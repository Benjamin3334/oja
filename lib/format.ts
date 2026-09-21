// Formatting that more than one screen needs. It lives here rather than beside
// the first screen that needed it, because the guards below have to apply
// everywhere the value is shown, not only where someone remembered them.

// Intl throws a RangeError on an unknown currency code rather than degrading,
// and the code comes from the database, so an organisation with a mistyped
// currency would otherwise take the whole page down.
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// Adjustments are signed, and the sign is the whole meaning: a recount upward
// and a breakage write-off are the same row shape otherwise. A leading plus is
// not the default for positive numbers, so it is added deliberately.
export function formatSignedQuantity(quantity: number): string {
  return quantity > 0 ? `+${quantity}` : String(quantity);
}

export function formatDateTime(iso: string): string {
  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export interface MoneyParts {
  // The currency symbol on its own, so it can be rendered in its own element.
  // Geist has no naira sign, so that character is set by Noto Sans through
  // per-glyph fallback while the digits stay Geist - splitting them is what
  // allows the symbol to be tuned without affecting the figures.
  symbol: string;
  // Everything else, including any separator Intl places between them.
  digits: string;
}

export function formatMoneyParts(amount: number, currency: string): MoneyParts {
  try {
    const parts = new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
    }).formatToParts(amount);

    return {
      symbol: parts
        .filter((part) => part.type === "currency")
        .map((part) => part.value)
        .join(""),
      digits: parts
        .filter((part) => part.type !== "currency")
        .map((part) => part.value)
        .join(""),
    };
  } catch {
    // Same guard as formatMoney: Intl throws on an unknown currency code
    // rather than degrading, and the code comes from the database.
    return { symbol: currency, digits: ` ${amount.toFixed(2)}` };
  }
}
