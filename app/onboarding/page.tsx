import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOut } from "@/lib/actions/auth";
import { getCurrentProfile } from "@/lib/queries/profile";
import { createClient } from "@/lib/supabase/server";

import { CreateOrganisationForm } from "./create-organisation-form";

export const metadata: Metadata = {
  title: "Set up your organisation | Oja",
};

// Deliberately OUTSIDE the (app) route group: a user with no organisation has
// nothing the shell could show them, so they get no sidebar and no topbar.
//
// This screen serves two people at once. Someone starting a new organisation
// fills in the form, which calls create_organisation_and_profile() and lands
// them on the dashboard as owner. Someone who was told they would be invited
// reads the panel underneath and waits, because only an existing owner can add
// them. Both are here because neither has a profile row yet, and nothing in the
// database can tell the two apart.
export default async function OnboardingPage() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (typeof userId !== "string") {
    redirect("/sign-in");
  }

  // Anyone who already has a profile belongs in the app, not here.
  const profile = await getCurrentProfile(userId);

  if (profile) {
    redirect("/");
  }

  const email =
    typeof data?.claims?.email === "string" ? data.claims.email : null;

  // Supplied at sign-up and stored on the auth user, so the name is not asked
  // for twice. Editable, because it is only a default.
  const metadata = data?.claims?.user_metadata;
  const suggestedName =
    metadata &&
    typeof metadata === "object" &&
    "full_name" in metadata &&
    typeof (metadata as { full_name?: unknown }).full_name === "string"
      ? (metadata as { full_name: string }).full_name
      : "";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-display text-ink">Oja</h1>
        <p className="mt-2 text-body text-ink-muted">
          One more step before you can start.
        </p>

        <div className="mt-8 rounded-md border border-hairline bg-surface p-6">
          <h2 className="text-title text-ink">Create your organisation</h2>
          <p className="mt-2 mb-6 text-caption text-ink-muted">
            You will be its owner, and can add staff afterwards.
          </p>

          <CreateOrganisationForm defaultFullName={suggestedName} />
        </div>

        <div className="mt-4 rounded-md border border-hairline bg-surface-sunk p-6">
          <h2 className="text-label text-ink">Were you invited instead?</h2>
          <p className="mt-2 text-caption text-ink-muted">
            If someone told you they would add you to an existing organisation,
            do not create one here. Ask them to add you from Staff, using the
            address below, then sign in again.
          </p>

          {email ? (
            <p className="mt-4 rounded-sm bg-surface px-3 py-2 text-caption text-ink">
              {email}
            </p>
          ) : null}

          <form action={signOut} className="mt-4">
            <button
              type="submit"
              className="h-[36px] w-full rounded-sm border border-hairline bg-surface px-4 text-label text-ink transition-quiet hover:bg-surface-sunk"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
