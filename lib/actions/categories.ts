"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/auth";
import type { CurrentProfile } from "@/lib/queries/profile";
import { canManageInventory, getSignedInProfile } from "@/lib/queries/profile";
import { createClient } from "@/lib/supabase/server";
import { categorySchema } from "@/lib/validation/inventory";

function toUserMessage(rawMessage: string): string {
  const message = rawMessage.toLowerCase();

  if (
    message.includes("uq_category_per_org") ||
    message.includes("duplicate key")
  ) {
    return "You already have a category with that name.";
  }

  // products.category_id is declared with "on delete restrict", so Postgres
  // refuses the delete outright rather than orphaning the products or quietly
  // nulling their category. FR-3.7 wants that refusal stated as a sentence the
  // user can act on, not surfaced as a foreign key error.
  if (message.includes("violates foreign key constraint")) {
    return "This category still has products in it. Move them to another category first.";
  }

  if (message.includes("row-level security")) {
    return "Only an owner or manager can manage categories.";
  }

  return "Could not save the category. Please try again.";
}

type Guard =
  | { ok: true; profile: CurrentProfile }
  | { ok: false; error: string };

// Every action in this file needs the same two answers: who is signed in, and
// may they manage inventory. The verb is passed in so the refusal names the
// thing the user was actually trying to do.
async function requireInventoryManager(verb: string): Promise<Guard> {
  const profile = await getSignedInProfile();

  if (!profile) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  if (!canManageInventory(profile.role)) {
    return { ok: false, error: `Only an owner or manager can ${verb}.` };
  }

  return { ok: true, profile };
}

export async function createCategory(
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = categorySchema.safeParse({
    name: String(formData.get("name") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const guard = await requireInventoryManager("add a category");

  if (!guard.ok) {
    return guard;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    org_id: guard.profile.organisation.id,
    name: parsed.data.name,
  });

  if (error) {
    console.error("[categories.createCategory]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath("/inventory/categories");
  revalidatePath("/inventory");
  return { ok: true };
}

export async function renameCategory(
  categoryId: string,
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = categorySchema.safeParse({
    name: String(formData.get("name") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const guard = await requireInventoryManager("rename a category");

  if (!guard.ok) {
    return guard;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ name: parsed.data.name })
    .eq("id", categoryId);

  if (error) {
    console.error("[categories.renameCategory]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath("/inventory/categories");
  revalidatePath("/inventory");
  return { ok: true };
}

// A category, unlike a product, may genuinely be deleted: nothing historical
// depends on it. The restriction is only that it must be empty first, and that
// is the database refusing, not this function.
export async function deleteCategory(
  categoryId: string
): Promise<ActionResult> {
  const guard = await requireInventoryManager("delete a category");

  if (!guard.ok) {
    return guard;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId);

  if (error) {
    console.error("[categories.deleteCategory]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath("/inventory/categories");
  revalidatePath("/inventory");
  return { ok: true };
}
