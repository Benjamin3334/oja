import { CURRENCY_CODES } from "@/lib/currencies";

export interface ExchangeRates {
  base: string;
  // Only the currencies this application offers, keyed by code.
  rates: Record<string, number>;
  updatedAt: string;
}

// Live rates for the currency selector on /settings.
//
// WHY THIS SOURCE
//   The reference implementation for this feature (Evavic44/currencee) uses
//   CurrencyBeacon, which needs an API key - and therefore runs a separate
//   Express backend whose only job is to keep that key off the client. In a
//   Next.js application a Server Component already is that backend, so the
//   proxy is unnecessary; but the key would still be a credential to obtain,
//   store and rotate.
//
//   open.er-api.com needs no key at all and carries NGN, which matters: the
//   ECB-derived free APIs (Frankfurter and the like) publish only the
//   currencies the ECB quotes, and the naira is not among them. A rate service
//   that cannot price this shop's own currency is no use here.
//
// WHY IT CANNOT BREAK THE PAGE
//   Settings must open whether or not a third party is reachable. Every
//   failure - network, non-200, malformed body, a missing currency - returns
//   null, and the form simply shows no rate. Nothing about saving a currency
//   depends on this call succeeding.
const ENDPOINT = "https://open.er-api.com/v6/latest";

export async function getExchangeRates(
  base: string
): Promise<ExchangeRates | null> {
  try {
    const response = await fetch(`${ENDPOINT}/${encodeURIComponent(base)}`, {
      // An hour is far finer than this needs. The figure is shown so an owner
      // understands the scale of the currency they are switching to, not to
      // price a trade, and caching keeps a public free endpoint from being
      // called on every settings render.
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      console.error("[queries.getExchangeRates] status", response.status);
      return null;
    }

    const body = await response.json();

    if (body?.result !== "success" || typeof body?.rates !== "object") {
      console.error("[queries.getExchangeRates] unexpected body");
      return null;
    }

    // Only the codes this application offers are carried forward. The endpoint
    // returns roughly 160 currencies and the client has no use for the rest.
    const rates: Record<string, number> = {};

    for (const code of CURRENCY_CODES) {
      const rate = body.rates[code];

      if (typeof rate === "number" && Number.isFinite(rate)) {
        rates[code] = rate;
      }
    }

    return {
      base,
      rates,
      updatedAt:
        typeof body.time_last_update_utc === "string"
          ? body.time_last_update_utc
          : "",
    };
  } catch (error) {
    console.error("[queries.getExchangeRates]", error);
    return null;
  }
}
