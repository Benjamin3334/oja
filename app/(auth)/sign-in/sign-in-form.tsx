"use client";

import { useActionState } from "react";

import { PasswordInput } from "@/components/ui/password-input";
import { signIn, type ActionResult } from "@/lib/actions/auth";

// The only client component on this screen. The page around it stays a Server
// Component, per 02_CLAUDE.md section 5.2: "use client" as low in the tree as
// it will go.
export function SignInForm() {
  // React 19. Returns [state, formAction, isPending] in that order.
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    signIn,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
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

      {/* No strength meter here. Sign-in measures nothing about an existing
          password, and showing a rule checklist on it would leak the policy
          and confuse anyone whose account predates it. */}
      <PasswordInput
        id="password"
        name="password"
        label="Password"
        autoComplete="current-password"
        required
        disabled={isPending}
      />

      {/* The live region is always in the DOM. A region added at the same time
          as its content is often not announced, because there was nothing for
          the screen reader to observe changing. */}
      <div aria-live="polite">
        {state && !state.ok ? (
          <p className="text-caption text-danger">{state.error}</p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="h-[36px] rounded-sm bg-accent px-4 text-label text-accent-ink transition-quiet hover:bg-accent-hover disabled:opacity-60"
      >
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
