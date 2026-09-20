"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { createOrganisationSchema } from "@/lib/validation/organisation";

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
