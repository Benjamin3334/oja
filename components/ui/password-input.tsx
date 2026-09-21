"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import type { InputHTMLAttributes } from "react";

interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  id: string;
}

// Shared by both auth forms so the toggle behaves identically on each. The
// input stays uncontrolled unless a caller passes value and onChange, which
// sign-up does because the strength meter needs to read what was typed.
export function PasswordInput({
  id,
  label,
  className = "",
  ...props
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const reactId = useId();
  const toggleId = `${reactId}-toggle`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label text-ink">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          // Switching the type is what reveals the value. Keeping one input
          // rather than swapping two preserves the caret, the undo history and
          // the browser autofill association.
          type={isVisible ? "text" : "password"}
          {...props}
          className={[
            // pr-10 is 40px: a 4px gap, the 32px button, and 4px again, so
            // typed text can never run underneath the icon.
            "h-[36px] w-full rounded-sm border border-hairline bg-surface pl-3 pr-10",
            "text-body text-ink placeholder:text-ink-faint",
            className,
          ].join(" ")}
        />

        {/* type="button" is load-bearing: a button inside a form defaults to
            type="submit", so without it, revealing the password would submit
            the form. */}
        <button
          type="button"
          id={toggleId}
          onClick={() => setIsVisible((shown) => !shown)}
          aria-label={isVisible ? "Hide password" : "Show password"}
          aria-controls={id}
          aria-pressed={isVisible}
          disabled={props.disabled}
          // No border and no background: this is a control inside a field,
          // not a button beside one, so it deliberately does not use the
          // Button primitive's variant styling. inset-y-0 with my-auto centres
          // a fixed 32x32 hit area rather than stretching it to the full
          // height of the input. The focus ring comes from the :focus-visible
          // rule in globals.css and takes rounded-sm so it matches the field.
          className="absolute inset-y-0 right-1 my-auto flex size-8 items-center justify-center rounded-sm text-ink-muted transition-quiet hover:text-ink disabled:opacity-60"
        >
          {isVisible ? (
            <EyeOff size={18} strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Eye size={18} strokeWidth={1.5} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
