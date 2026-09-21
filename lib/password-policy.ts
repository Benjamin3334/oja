// The password rule, in a module with no dependencies.
//
// It lives apart from lib/validation/auth.ts because the strength meter needs
// this number in the BROWSER, and importing it from the validation module
// pulled Zod into the client bundle with it: /sign-up measured 134 kB of
// first-load JavaScript against 107 kB before, for a single integer.
//
// lib/validation/auth.ts re-exports it, so there is still one definition and
// callers may import it from either place.
//
// Only length is enforced. Case, digit and symbol are advisory: NIST SP
// 800-63B recommends against composition rules, because they push people
// toward predictable substitutions without adding real entropy.
export const PASSWORD_MIN_LENGTH = 8;
