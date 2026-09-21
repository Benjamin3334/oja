import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OjaMark } from "@/components/app/oja-mark";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { getCurrentProfile, getOwnProfileRow } from "@/lib/queries/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Access removed | Oja",
};

// Outside the (app) route group, deliberately: a deactivated member has
// nothing the shell could show them. Every query in the application returns
// empty for them since 0016, so a sidebar and a topbar would be a frame around
// nothing.
//
// This screen exists because Supabase Auth knows nothing about profiles. A
// deactivated member still signs in successfully and still holds a valid
// session - the database simply stops answering. Without this they would land
// on an application that looks broken rather than one that has removed them.
export default async function DeactivatedPage() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (typeof userId !== "string") {
    redirect("/sign-in");
  }

  // Re-checked on every visit rather than cached in a cookie, so an owner
  // reactivating someone takes effect the moment they reload - no sign out and
  // back in, and no stale "you were removed" for somebody who no longer is.
  const profile = await getCurrentProfile(userId);

  if (profile) {
    redirect("/");
  }

  const own = await getOwnProfileRow(userId);

  // No profile row at all means a new account that has not onboarded, which is
  // a different screen with a different answer.
  if (!own) {
    redirect("/onboarding");
  }

  if (own.isActive) {
    redirect("/");
  }

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center bg-canvas px-6 py-16">
      <div className="enter-rise flex w-full max-w-[480px] flex-col items-start">
        <span className="text-ink">
          <OjaMark size={40} />
        </span>

        <h1 className="mt-8 font-ui text-title font-semibold text-ink">
          Your access has been removed.
        </h1>

        <p className="mt-3 text-body text-ink-muted">
          {own.fullName}, your account is still here but it is no longer active
          in this organisation, so there is nothing for you to see. Nothing you
          recorded has been deleted.
        </p>

        <p className="mt-3 text-body text-ink-muted">
          An owner can restore your access from the staff page. If you think
          this is a mistake, speak to them - it cannot be undone from here.
        </p>

        {/* Signing out is the only action available, and it is the one most
            people will want: the session is valid, so the browser would
            otherwise keep returning them to this page. */}
        <form action={signOut} className="mt-8">
          <Button type="submit" variant="primary">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
