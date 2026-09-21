import { z } from "zod";

import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

// The single source of truth for the auth form rules.
//
// The client form and the Server Action both parse with these schemas, so the
// rules cannot drift apart. Client-side validation is a convenience; the Server
// Action re-validates because that is the only check an attacker cannot skip
// (docs/01_PRD.md section 9.1, point 4).
//
// Written against Zod 4: z.email() is the top-level form, and the message
// option is named `error`, not `message`.

// Supabase hashes passwords with bcrypt, which ignores anything past 72 bytes,
// so accepting more would silently mislead the user about what was stored.
//
// LENGTH IS THE ONLY RULE THAT BLOCKS A SIGN-UP. Case, digit and symbol are
// shown in the strength checklist as advice and are never enforced: NIST
// SP 800-63B recommends against composition rules, because they push people
// toward predictable substitutions (Password1!) without adding real entropy.
//
// The constant itself lives in lib/password-policy.ts, which imports nothing.
// The strength meter needs it in the browser, and importing it from this
// module would pull Zod into the client bundle. Re-exported here so there is
// one definition and either import path works.
export { PASSWORD_MIN_LENGTH };
const PASSWORD_MAX_LENGTH = 72;
const FULL_NAME_MIN_LENGTH = 2;
const FULL_NAME_MAX_LENGTH = 120;

export const signInSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }),
  // Deliberately only checks presence. Applying the sign-up length rule here
  // would tell an attacker about the password policy, and would lock out any
  // account created before the rule changed.
  password: z.string().min(1, { error: "Enter your password." }),
});

export const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(FULL_NAME_MIN_LENGTH, { error: "Enter your full name." })
    .max(FULL_NAME_MAX_LENGTH, {
      error: `Name must be ${FULL_NAME_MAX_LENGTH} characters or fewer.`,
    }),
  email: z.email({ error: "Enter a valid email address." }),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, {
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    })
    .max(PASSWORD_MAX_LENGTH, {
      error: `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`,
    }),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
