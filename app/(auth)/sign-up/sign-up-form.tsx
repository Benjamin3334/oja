"use client";

import { useActionState, useState } from "react";

import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/ui/password-strength";
import { signUp, type ActionResult } from "@/lib/actions/auth";

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    signUp,
    null
  );

  // Controlled only so the meter can read what was typed. The value still
  // reaches the Server Action through the form field, and the Server Action
  // still parses it with Zod - the meter is guidance, never a gate.
  const [password, setPassword] = useState("");

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

      <div className="flex flex-col gap-2">
        <PasswordInput
          id="password"
          name="password"
          label="Password"
          autoComplete="new-password"
          required
          disabled={isPending}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby="password-strength"
        />

        <PasswordStrength id="password-strength" value={password} />
      </div>

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
        {isPending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
