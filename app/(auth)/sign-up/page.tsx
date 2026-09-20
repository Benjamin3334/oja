import type { Metadata } from "next";
import Link from "next/link";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Create an account | Oja",
};

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-display text-ink">Oja</h1>
        <p className="mt-2 text-body text-ink-muted">
          Create an account to get started.
        </p>

        <div className="mt-8 rounded-md border border-hairline bg-surface p-6">
          <SignUpForm />
        </div>

        <p className="mt-6 text-caption text-ink-muted">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="text-accent underline underline-offset-2"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
