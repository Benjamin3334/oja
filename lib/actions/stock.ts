"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/auth";
import { canManageInventory, getSignedInProfile } from "@/lib/queries/profile";
import { createClient } from "@/lib/supabase/server";
import {
  adjustStockSchema,
  receiveStockSchema,
} from "@/lib/validation/inventory";

// Stock is never stored on products; it is derived from this ledger by
// v_product_stock. Both actions below therefore only ever INSERT. There is no
// stock column to update, and section 9 of 02_CLAUDE.md forbids deleting a
// movement once it has been written.

// The three failures a user can actually cause. Anything else is a bug, so the
// real message goes to the server log and the user gets a generic sentence.
function toUserMessage(rawMessage: string): string {
  const message = rawMessage.toLowerCase();

  if (message.includes("chk_adjustment_has_reason")) {
    return "An adjustment must say why the stock changed.";
  }
  if (message.includes("chk_movement_quantity")) {
    return "That quantity is not valid for this kind of movement.";
  }
  if (message.includes("row-level security")) {
    return "Only an owner or manager can change stock levels.";
  }

  return "Could not record the stock movement. Please try again.";
}

interface Movement {
  productId: string;
  movementType: "in" | "adjustment";
  quantity: number;
  reason: string;
}

// The shared tail of both actions: authorise, insert, revalidate. Kept in one
// place so the role check and the ledger write cannot drift apart.
async function writeMovement(
  movement: Movement,
  deniedMessage: string
): Promise<ActionResult> {
  const profile = await getSignedInProfile();

  if (!profile) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  // The movements_insert policy from migration 0003 enforces exactly this in
  // the database. The check here exists so a staff member reads a sentence
  // rather than a raised policy violation.
  if (!canManageInventory(profile.role)) {
    return { ok: false, error: deniedMessage };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("stock_movements").insert({
    org_id: profile.organisation.id,
    product_id: movement.productId,
    movement_type: movement.movementType,
    quantity: movement.quantity,
    reason: movement.reason,
    created_by: profile.id,
  });

  if (error) {
    console.error("[stock.writeMovement]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${movement.productId}`);
  return { ok: true };
}

// FR-3.4. A receipt is a positive magnitude recorded as movement type "in";
// the reason records where the goods came from.
export async function receiveStock(
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = receiveStockSchema.safeParse({
    productId: String(formData.get("productId") ?? ""),
    quantity: String(formData.get("quantity") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  return writeMovement(
    {
      productId: parsed.data.productId,
      movementType: "in",
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
    },
    "Only an owner or manager can receive stock."
  );
}

// FR-3.5. An adjustment is signed, because a recount can go either way, and
// carries a mandatory reason. Migration 0010 makes that mandatory in the
// database too, so the form cannot be the only thing enforcing it.
export async function adjustStock(
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = adjustStockSchema.safeParse({
    productId: String(formData.get("productId") ?? ""),
    quantity: String(formData.get("quantity") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  return writeMovement(
    {
      productId: parsed.data.productId,
      movementType: "adjustment",
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
    },
    "Only an owner or manager can adjust stock."
  );
}
