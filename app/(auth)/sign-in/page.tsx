import type { Metadata } from "next";
import Link from "next/link";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in | Oja",
};

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-display text-ink">Oja</h1>
        <p className="mt-2 text-body text-ink-muted">
          Sign in to your organisation.
        </p>

        <div className="mt-8 rounded-md border border-hairline bg-surface p-6">
          <SignInForm />
        </div>

        <p className="mt-6 text-caption text-ink-muted">
          No account yet?{" "}
          <Link
            href="/sign-up"
            className="text-accent underline underline-offset-2"
          >
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
