// Mirrors the payment_method enum in 0001. An enum models a closed domain, so
// this is not a convenience copy: if the database ever gains a value and this
// does not, the form silently stops offering it.
//
// It lives in its own module, apart from the validation schemas, because the
// filter and the till form need the list in the BROWSER. Importing it from
// lib/validation/sales.ts pulled Zod into the client bundle with it, which
// measured 26 kB of first-load JavaScript for a four-item array.
export const PAYMENT_METHODS = ["cash", "transfer", "card", "credit"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
