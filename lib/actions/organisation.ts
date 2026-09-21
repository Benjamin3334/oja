"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/actions/auth";
import { getSignedInProfile } from "@/lib/queries/profile";
import { createClient } from "@/lib/supabase/server";
import {
  createOrganisationSchema,
  organisationSettingsSchema,
} from "@/lib/validation/organisation";

// create_organisation_and_profile() raises with messages written to be read by
// a user, but they arrive wrapped by PostgREST and alongside errors that are
// not fit to show. Known cases are matched and anything else falls back, so a
// raw Postgres error can never reach the screen (02_CLAUDE.md section 5.2).
function toUserMessage(rawMessage: string): string {
  const message = rawMessage.toLowerCase();

  if (message.includes("already belongs to an organisation")) {
    return "This account already belongs to an organisation.";
  }
  if (message.includes("must be signed in")) {
    return "Your session has expired. Sign in again.";
  }
  if (message.includes("organisation name is required")) {
    return "Enter the name of your organisation.";
  }
  if (message.includes("full name is required")) {
    return "Enter your full name.";
  }
  if (message.includes("duplicate key") || message.includes("unique")) {
    return "That name is already taken. Try a slightly different one.";
  }

  return "Could not create the organisation. Please try again.";
}

export async function createOrganisation(
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = createOrganisationSchema.safeParse({
    organisationName: String(formData.get("organisationName") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  // The whole of the work happens inside the database: the function creates the
  // organisation and the owner profile in one transaction, so there is no state
  // where one exists without the other. It is security definer because neither
  // table has an insert policy, and it guards itself in place of RLS.
  const { error } = await supabase.rpc("create_organisation_and_profile", {
    p_org_name: parsed.data.organisationName,
    p_full_name: parsed.data.fullName,
  });

  if (error) {
    console.error("[organisation.createOrganisation]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  // The shell reads the profile that now exists, so the cached signed-in-but-
  // profileless render has to go.
  revalidatePath("/", "layout");
  redirect("/");
}

// FR-6.2. Owner only, and the database says so too: org_update from 0001
// requires id = current_org_id() AND current_user_role() = 'owner', so a
// manager reaching this action is refused by RLS even though the check below
// has already turned them away with a sentence.
//
// Only name and currency are sent. The organisations row also carries slug and
// low_stock_default, and the table-level UPDATE grant does not distinguish
// between columns - an owner could change either with a crafted request. That
// is their own organisation and no other tenant is reachable, so it is not
// treated as a hole; it is simply not offered, because a URL slug that moves
// under people is a support problem rather than a setting.
export async function updateOrganisationSettings(
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = organisationSettingsSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    currency: String(formData.get("currency") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const profile = await getSignedInProfile();

  if (!profile) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  if (profile.role !== "owner") {
    return { ok: false, error: "Only an owner can change these settings." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organisations")
    .update({ name: parsed.data.name, currency: parsed.data.currency })
    .eq("id", profile.organisation.id);

  if (error) {
    console.error("[organisation.updateOrganisationSettings]", error.message);

    if (error.message.toLowerCase().includes("row-level security")) {
      return { ok: false, error: "Only an owner can change these settings." };
    }

    return { ok: false, error: "Could not save the settings. Please try again." };
  }

  // The layout, not the page: the organisation name is in the topbar and the
  // currency formats money on every screen, so a page-level revalidation would
  // leave the old name showing above the new settings.
  revalidatePath("/", "layout");
  return { ok: true };
}
