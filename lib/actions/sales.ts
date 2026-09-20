"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/actions/auth";
import { getSignedInProfile } from "@/lib/queries/profile";
import { createClient } from "@/lib/supabase/server";
import {
  saleLineSchema,
  startSaleSchema,
  voidSaleSchema,
} from "@/lib/validation/sales";

function toUserMessage(rawMessage: string): string {
  const message = rawMessage.toLowerCase();

  if (message.includes("not found or is not a draft")) {
    return "This sale has already been completed or voided.";
  }
  if (message.includes("only an owner or manager may void")) {
    return "Only an owner or manager can void a sale.";
  }
  if (message.includes("does not belong to your organisation")) {
    return "That does not belong to your organisation.";
  }
  if (message.includes("uq_product_per_sale")) {
    return "That product is already on this sale.";
  }
  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "You do not have permission to do that.";
  }

  return "Something went wrong. Please try again.";
}

// FR-4.1. A sale opens as a draft, and only create_draft_sale() can open one:
// migration 0011 revoked INSERT on sales from the client entirely. status and
// sold_by are set by the function, not sent from here, which is the point.
export async function startSale(
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = startSaleSchema.safeParse({
    customerId: String(formData.get("customerId") ?? ""),
    paymentMethod: String(formData.get("paymentMethod") ?? "cash"),
    note: String(formData.get("note") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_draft_sale", {
    p_customer_id:
      parsed.data.customerId === "" ? undefined : parsed.data.customerId,
    p_payment_method: parsed.data.paymentMethod,
    p_note: parsed.data.note ? parsed.data.note : undefined,
  });

  if (error) {
    console.error("[sales.startSale]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath("/sales");
  redirect(`/sales/${data}`);
}

// The price is read from the product here rather than accepted from the form.
// Migration 0012 overwrites it at completion regardless, so this is not the
// control - it is so the running total the cashier reads matches what the
// customer is being told before the sale is completed.
export async function addLine(
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = saleLineSchema.safeParse({
    saleId: String(formData.get("saleId") ?? ""),
    productId: String(formData.get("productId") ?? ""),
    quantity: String(formData.get("quantity") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { saleId, productId, quantity } = parsed.data;
  const supabase = await createClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("unit_price, is_active")
    .eq("id", productId)
    .maybeSingle();

  if (productError || !product) {
    console.error("[sales.addLine]", productError?.message ?? "no product");
    return { ok: false, error: "That product could not be found." };
  }

  if (!product.is_active) {
    return { ok: false, error: "That product is no longer being sold." };
  }

  // uq_product_per_sale forbids the same product twice on one sale, so a
  // repeat scan increases the quantity instead of failing. Read-then-write is
  // a race in principle; in practice both statements come from one cashier
  // editing their own draft, and the unique constraint is still the backstop
  // if two arrive at once.
  const { data: existing } = await supabase
    .from("sale_items")
    .select("id, quantity")
    .eq("sale_id", saleId)
    .eq("product_id", productId)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("sale_items")
        .update({ quantity: existing.quantity + quantity })
        .eq("id", existing.id)
    : await supabase.from("sale_items").insert({
        sale_id: saleId,
        product_id: productId,
        quantity,
        unit_price: product.unit_price,
      });

  if (error) {
    console.error("[sales.addLine]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath(`/sales/${saleId}`);
  return { ok: true };
}

export async function updateLineQuantity(
  saleId: string,
  lineId: string,
  quantity: number
): Promise<ActionResult> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, error: "Enter a quantity greater than zero." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("sale_items")
    .update({ quantity })
    .eq("id", lineId);

  if (error) {
    console.error("[sales.updateLineQuantity]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath(`/sales/${saleId}`);
  return { ok: true };
}

// Deleting a DRAFT line is not the same as deleting history. Section 9 of
// 02_CLAUDE.md forbids removing rows from a completed sale; a draft has moved
// no stock and is not yet a record of anything.
export async function removeLine(
  saleId: string,
  lineId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("sale_items").delete().eq("id", lineId);

  if (error) {
    console.error("[sales.removeLine]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath(`/sales/${saleId}`);
  return { ok: true };
}

// complete_sale() raises "Insufficient stock for product <uuid>: 5 requested,
// 3 available". A cashier cannot act on a uuid. Rather than parse it back out
// of the exception string, which would break the moment the wording changes,
// the shortfall is recomputed from the sale itself - one extra round trip, and
// only on the failure path.
async function describeShortfall(saleId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: lines } = await supabase
    .from("sale_items")
    .select("product_id, quantity, products ( name )")
    .eq("sale_id", saleId);

  if (!lines || lines.length === 0) {
    return null;
  }

  const { data: stock } = await supabase
    .from("v_product_stock")
    .select("product_id, stock_quantity");

  if (!stock) {
    return null;
  }

  const available = new Map(
    stock.map((row) => [row.product_id ?? "", row.stock_quantity ?? 0])
  );

  const short = lines
    .filter((line) => (available.get(line.product_id) ?? 0) < line.quantity)
    .map((line) => {
      const name = line.products?.name ?? "A product";
      const left = available.get(line.product_id) ?? 0;
      return `${name} (${line.quantity} needed, ${left} left)`;
    });

  return short.length > 0 ? short.join("; ") : null;
}

// FR-4.4 and FR-4.5. Everything that matters happens inside the function: the
// product row is locked, the stock is checked, the movements are written, the
// price and cost are snapshotted, and only then does the status change.
export async function completeSale(saleId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_sale", { p_sale_id: saleId });

  if (error) {
    console.error("[sales.completeSale]", error.message);

    if (error.message.toLowerCase().includes("insufficient stock")) {
      const detail = await describeShortfall(saleId);

      return {
        ok: false,
        error: detail
          ? `Not enough stock: ${detail}.`
          : "There is not enough stock to complete this sale.",
      };
    }

    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${saleId}`);
  revalidatePath("/inventory");
  revalidatePath("/");
  return { ok: true };
}

// FR-4.7. Nothing is deleted: the status becomes void and void_sale() writes
// compensating movements of type in, which put the stock back.
export async function voidSale(
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = voidSaleSchema.safeParse({
    saleId: String(formData.get("saleId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const profile = await getSignedInProfile();

  if (!profile || (profile.role !== "owner" && profile.role !== "manager")) {
    return { ok: false, error: "Only an owner or manager can void a sale." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_sale", {
    p_sale_id: parsed.data.saleId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("[sales.voidSale]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${parsed.data.saleId}`);
  revalidatePath("/inventory");
  revalidatePath("/");
  return { ok: true };
}
