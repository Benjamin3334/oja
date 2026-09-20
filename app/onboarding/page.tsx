import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOut } from "@/lib/actions/auth";
import { getCurrentProfile } from "@/lib/queries/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Waiting for access | Oja",
};

// Deliberately OUTSIDE the (app) route group: someone who has no organisation
// has nothing the shell could show them, so they get no sidebar and no topbar.
//
// This screen has two lives. Today it is the waiting room for a user whose
// auth account exists but whose profile row does not. Once
// create_organisation_and_profile() exists it also becomes the screen where a
// new owner names their organisation, and it stays as the waiting room for
// staff who have been invited but not yet linked.
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

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="rounded-md border border-hairline bg-surface p-6">
          <span className="flex size-8 items-center justify-center rounded-sm bg-accent-soft text-accent">
            <Building2 size={18} strokeWidth={1.5} aria-hidden="true" />
          </span>

          <h1 className="mt-4 font-display text-title text-ink">
            No organisation yet
          </h1>

          <p className="mt-2 text-body text-ink-muted">
            Your account exists, but it is not linked to an organisation, so
            there is nothing to show you yet.
          </p>

          <p className="mt-4 text-body text-ink-muted">
            Ask the owner of your organisation to add you as a member. They can
            do it from Staff, using the email below.
          </p>

          {email ? (
            <p className="mt-4 rounded-sm bg-surface-sunk px-3 py-2 text-caption text-ink">
              {email}
            </p>
          ) : null}

          <form action={signOut} className="mt-6">
            <button
              type="submit"
              className="h-[36px] w-full rounded-sm border border-hairline px-4 text-label text-ink transition-quiet hover:bg-surface-sunk"
            >
              Sign out
            </button>
          </form>
        </div>

        <p className="mt-6 text-caption text-ink-faint">
          Setting up a new organisation instead? That option appears here once
          your account is the first in the organisation.
        </p>
      </div>
    </main>
  );
}
