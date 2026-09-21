import { formatMoneyParts } from "@/lib/format";

interface MoneyProps {
  amount: number;
  currency: string;
}

// Renders an amount with the currency symbol in its own element. The symbol
// comes from a different family than the digits - Geist has no naira sign, so
// Noto Sans supplies it through per-glyph fallback - and separating them is
// what lets the symbol be adjusted for optical size or baseline without
// touching the figures.
//
// No typography classes of its own: the container decides the face and size,
// so this composes inside a table cell, a KPI tile or a totals block without
// fighting any of them.
export function Money({ amount, currency }: MoneyProps) {
  const { symbol, digits } = formatMoneyParts(amount, currency);

  return (
    <>
      {symbol ? <span className="currency-symbol">{symbol}</span> : null}
      {digits}
    </>
  );
}
