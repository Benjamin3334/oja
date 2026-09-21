// The currencies the organisation settings form offers.
//
// A closed list rather than a free text field, for a reason that shows up in
// lib/format.ts: Intl.NumberFormat throws a RangeError on an unknown currency
// code rather than degrading, so formatMoney carries a try/catch to stop one
// mistyped code taking down every screen that shows money. Choosing from a
// list means that guard never has to fire.
//
// In its own module, with no dependencies, because the select that renders it
// is a Client Component. Importing it from lib/validation/organisation.ts
// would pull Zod into the browser - the same mistake made twice already in
// this project, with PAYMENT_METHODS and PASSWORD_MIN_LENGTH.
export const SUPPORTED_CURRENCIES = [
  { code: "NGN", label: "Nigerian naira (NGN)" },
  { code: "USD", label: "US dollar (USD)" },
  { code: "GBP", label: "Pound sterling (GBP)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "GHS", label: "Ghanaian cedi (GHS)" },
  { code: "KES", label: "Kenyan shilling (KES)" },
  { code: "ZAR", label: "South African rand (ZAR)" },
] as const;

export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map(
  (currency) => currency.code
) as unknown as [string, ...string[]];

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];
