"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/actions/auth";
import { canManageInventory, getSignedInProfile } from "@/lib/queries/profile";
import { createClient } from "@/lib/supabase/server";
import { productSchema } from "@/lib/validation/inventory";

// Postgres errors are never shown raw. These are the two a user can actually
// cause; everything else falls back to a generic sentence.
function toUserMessage(rawMessage: string): string {
  const message = rawMessage.toLowerCase();

  if (message.includes("uq_sku_per_org") || message.includes("duplicate key")) {
    return "A product with that SKU already exists in your organisation.";
  }
  if (message.includes("row-level security")) {
    return "You do not have permission to do that.";
  }

  return "Could not save the product. Please try again.";
}

function readProductForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    sku: String(formData.get("sku") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    unitPrice: String(formData.get("unitPrice") ?? ""),
    costPrice: String(formData.get("costPrice") ?? ""),
    reorderLevel: String(formData.get("reorderLevel") ?? ""),
  };
}

export async function createProduct(
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = productSchema.safeParse(readProductForm(formData));

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const profile = await getSignedInProfile();

  if (!profile) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  // The UI half of PRD section 9.2. RLS on products enforces the same rule, so
  // this exists to produce a readable message rather than being the only thing
  // standing in the way.
  if (!canManageInventory(profile.role)) {
    return { ok: false, error: "Only an owner or manager can add products." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    org_id: profile.organisation.id,
    name: parsed.data.name,
    sku: parsed.data.sku,
    category_id: parsed.data.categoryId === "" ? null : parsed.data.categoryId,
    unit_price: parsed.data.unitPrice,
    cost_price: parsed.data.costPrice,
    reorder_level: parsed.data.reorderLevel,
  });

  if (error) {
    console.error("[products.createProduct]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function updateProduct(
  productId: string,
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = productSchema.safeParse(readProductForm(formData));

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const profile = await getSignedInProfile();

  if (!profile || !canManageInventory(profile.role)) {
    return { ok: false, error: "Only an owner or manager can edit products." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      sku: parsed.data.sku,
      category_id: parsed.data.categoryId === "" ? null : parsed.data.categoryId,
      unit_price: parsed.data.unitPrice,
      cost_price: parsed.data.costPrice,
      reorder_level: parsed.data.reorderLevel,
    })
    .eq("id", productId);

  if (error) {
    console.error("[products.updateProduct]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${productId}`);
  redirect(`/inventory/${productId}`);
}

// FR-3.2: products are never hard-deleted, only deactivated, so historical
// sales keep their foreign key intact. Section 9 of 02_CLAUDE.md forbids the
// alternative outright.
export async function setProductActive(
  productId: string,
  isActive: boolean
): Promise<ActionResult> {
  const profile = await getSignedInProfile();

  if (!profile || !canManageInventory(profile.role)) {
    return { ok: false, error: "Only an owner or manager can do that." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", productId);

  if (error) {
    console.error("[products.setProductActive]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${productId}`);
  return { ok: true };
}
