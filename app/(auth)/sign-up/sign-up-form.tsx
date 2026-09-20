"use client";

import { useActionState } from "react";

import { signUp, type ActionResult } from "@/lib/actions/auth";

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    signUp,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="fullName" className="text-label text-ink">
          Full name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          disabled={isPending}
          className="h-[36px] rounded-sm border border-hairline bg-surface px-3 text-body text-ink placeholder:text-ink-faint"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-label text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          className="h-[36px] rounded-sm border border-hairline bg-surface px-3 text-body text-ink placeholder:text-ink-faint"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-label text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          disabled={isPending}
          className="h-[36px] rounded-sm border border-hairline bg-surface px-3 text-body text-ink placeholder:text-ink-faint"
        />
        <p id="password-hint" className="text-caption text-ink-muted">
          At least 8 characters.
        </p>
      </div>

      <div aria-live="polite">
        {state && !state.ok ? (
          <p className="text-caption text-danger">{state.error}</p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="h-[36px] rounded-sm bg-accent px-4 text-label text-white transition-quiet hover:bg-accent-hover disabled:opacity-60"
      >
        {isPending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
