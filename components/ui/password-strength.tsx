"use client";

import { useEffect, useState } from "react";

import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

// Adapted from a 21st.dev password strength component. The structure and the
// accessibility behaviour are kept; the motion library and the palette are not.
// Springs became CSS transitions on transform and opacity, and every colour
// resolves to a design token, so the meter re-themes with the rest of the app
// (including dark mode) instead of carrying its own greens and reds.

interface Rule {
  id: string;
  label: string;
  test: (value: string) => boolean;
  // Only the length rule blocks submission. The rest are advice - see the note
  // on NIST SP 800-63B in lib/validation/auth.ts.
  blocking: boolean;
}

const RULES: Rule[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (value) => value.length >= PASSWORD_MIN_LENGTH,
    blocking: true,
  },
  {
    id: "case",
    label: "Upper and lower case",
    test: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value),
    blocking: false,
  },
  {
    id: "digit",
    label: "A number",
    test: (value) => /\d/.test(value),
    blocking: false,
  },
  {
    id: "symbol",
    label: "A symbol",
    test: (value) => /[^A-Za-z0-9]/.test(value),
    blocking: false,
  },
];

// A long password built from one obvious pattern is not strong, and a rule
// checklist alone would happily call "aaaaaaaaaa" or "password123" complete.
const GUESSABLE = [
  /^(.)\1+$/, // one repeated character
  /^(..)\1+$/, // one repeated pair
  /0123|1234|2345|3456|4567|5678|6789/,
  /abcdef|qwerty|asdfgh|zxcvbn/i,
  /password|letmein|welcome|admin|login|iloveyou/i,
];

function isGuessable(value: string): boolean {
  return GUESSABLE.some((pattern) => pattern.test(value));
}

const LEVELS = [
  { label: "Too weak", fill: "bg-danger", text: "text-danger" },
  { label: "Weak", fill: "bg-danger", text: "text-danger" },
  { label: "Fair", fill: "bg-warning", text: "text-warning" },
  { label: "Good", fill: "bg-warning", text: "text-warning" },
  { label: "Strong", fill: "bg-positive", text: "text-positive" },
] as const;

const MAX_SCORE = RULES.length;

function scoreFor(value: string): number {
  if (value.length === 0) {
    return 0;
  }

  const met = RULES.filter((rule) => rule.test(value)).length;

  // A guessable password is capped below "Strong" however many boxes it ticks.
  if (isGuessable(value)) {
    return Math.min(met, 1);
  }

  return met;
}

interface PasswordStrengthProps {
  value: string;
  // Ties the meter to the field it describes, for aria-describedby upstream.
  id: string;
}

export function PasswordStrength({ value, id }: PasswordStrengthProps) {
  const score = scoreFor(value);
  const level = LEVELS[score];

  // The visible meter updates on every keystroke, but announcing it on every
  // keystroke would flood a screen reader. The announcement lags deliberately,
  // so it speaks once the typing pauses.
  const [announced, setAnnounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnnounced(value.length === 0 ? "" : `Password strength: ${level.label}`);
    }, 700);

    return () => clearTimeout(timer);
  }, [value, level.label]);

  return (
    <div className="flex flex-col gap-2">
      {/* Motion is a transform and an opacity only, at the 160ms motion token.
          prefers-reduced-motion is handled once in globals.css, which collapses
          the duration for everything, so there is nothing to repeat here. */}
      <div
        id={id}
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={MAX_SCORE}
        aria-valuenow={score}
        aria-valuetext={value.length === 0 ? "No password entered" : level.label}
        className="flex gap-1"
      >
        {Array.from({ length: MAX_SCORE }).map((_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="h-1 flex-1 overflow-hidden rounded-pill bg-hairline"
          >
            <span
              className={[
                "block h-full w-full origin-left transition-quiet",
                index < score ? level.fill : "bg-hairline",
                index < score ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
              ].join(" ")}
            />
          </span>
        ))}
      </div>

      <p className={["text-caption", value.length === 0 ? "text-ink-muted" : level.text].join(" ")}>
        {value.length === 0 ? "Choose a password" : level.label}
      </p>

      <ul className="flex flex-col gap-1">
        {RULES.map((rule) => {
          const met = rule.test(value);

          return (
            <li
              key={rule.id}
              className={[
                "flex items-center gap-2 text-caption transition-quiet",
                met ? "text-ink" : "text-ink-muted",
              ].join(" ")}
            >
              {/* The dot is decoration; the state is carried by the words in
                  the span below, so it is never colour alone (section 8.4). */}
              <span
                aria-hidden="true"
                className={[
                  "size-1 shrink-0 rounded-pill transition-quiet",
                  met ? "bg-positive opacity-100" : "bg-hairline-strong opacity-100",
                ].join(" ")}
              />
              {rule.label}
              {rule.blocking ? "" : " (optional)"}
              <span className="sr-only">{met ? " - met" : " - not met"}</span>
            </li>
          );
        })}
      </ul>

      <div aria-live="polite" className="sr-only">
        {announced}
      </div>
    </div>
  );
}
