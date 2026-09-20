import { NextResponse } from "next/server";

import { getSignedInProfile } from "@/lib/queries/profile";
import {
  getRevenue,
  lagosDateOffsetBy,
  type RevenueGrain,
} from "@/lib/queries/reports";

const GRAINS = ["day", "week", "month"] as const;

// A CSV cell that starts with =, +, - or @ is executed as a formula when the
// file is opened in Excel or Sheets. None of the values below are user-typed,
// but a product name will pass through the other exports later, so the guard
// lives here from the start rather than being remembered then.
function csvCell(value: string | number): string {
  const text = String(value);
  const risky = /^[=+\-@]/.test(text);
  const escaped = text.replace(/"/g, '""');
  return `"${risky ? `'${escaped}` : escaped}"`;
}

export async function GET(request: Request) {
  const profile = await getSignedInProfile();

  // The same rule as the page, restated. A route handler is a separate entry
  // point: guarding the page it is linked from protects nothing.
  if (!profile || profile.role === "staff") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const from = params.get("from") || lagosDateOffsetBy(-29);
  const to = params.get("to") || lagosDateOffsetBy(0);
  const requested = params.get("grain") ?? "day";
  const grain: RevenueGrain = GRAINS.includes(requested as RevenueGrain)
    ? (requested as RevenueGrain)
    : "day";

  const points = await getRevenue(from, to, grain);

  const rows = [
    ["Period", "Sales", "Items sold", "Revenue"],
    ...points.map((point) => [
      point.label,
      point.saleCount,
      point.itemsSold,
      // Unformatted, with two decimals: a spreadsheet should receive a number
      // it can total, not a currency string it has to be taught to parse.
      point.revenue.toFixed(2),
    ]),
  ];

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      // charset matters: Excel reads a bare text/csv as the system codepage.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="oja-revenue-${from}-to-${to}.csv"`,
      // A report of live figures must never be served from a cache.
      "Cache-Control": "no-store",
    },
  });
}
