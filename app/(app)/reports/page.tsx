import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import {
  TBody,
  THead,
  Table,
  TableEmpty,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import { getSignedInProfile } from "@/lib/queries/profile";
import {
  getProductPerformance,
  getRevenue,
  getStockValuation,
  lagosDateOffsetBy,
  totalsFor,
  type RevenueGrain,
} from "@/lib/queries/reports";

import { ReportControls } from "./report-controls";

export const metadata: Metadata = {
  title: "Reports | Oja",
};

interface ReportsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const GRAINS = ["day", "week", "month"] as const;

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string
): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;

  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  // Section 9.2: staff may not view reports. This matters more than the usual
  // route gate. These figures come from views over sales, and 0008 scopes
  // sales by sold_by, so a staff member would not be refused - they would be
  // shown their own takings labelled as the shop total. A wrong number is
  // worse than a closed door.
  if (profile.role === "staff") {
    redirect("/");
  }

  const from = readParam(params, "from") || lagosDateOffsetBy(-29);
  const to = readParam(params, "to") || lagosDateOffsetBy(0);
  const requested = readParam(params, "grain");
  const grain: RevenueGrain = GRAINS.includes(requested as RevenueGrain)
    ? (requested as RevenueGrain)
    : "day";

  // FR-7.2 and FR-7.3 are lifetime figures rather than range-scoped: product
  // margin and stock valuation answer "what is true now", not "what happened
  // between these dates". Only the revenue report takes the range.
  const [points, performance, valuation] = await Promise.all([
    getRevenue(from, to, grain),
    getProductPerformance(),
    getStockValuation(),
  ]);
  const totals = totalsFor(points);
  const approximateMargins = performance.some((row) => row.linesWithoutCost > 0);
  const currency = profile.organisation.currency;

  const csvHref = `/api/reports/revenue?${new URLSearchParams({
    from,
    to,
    grain,
  }).toString()}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-display text-ink">Reports</h1>
        <p className="mt-1 text-caption text-ink-muted">
          Completed sales only. A voided sale returns both the goods and the
          money, so it is not revenue.
        </p>
      </div>

      <ReportControls from={from} to={to} grain={grain} csvHref={csvHref} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-hairline bg-surface p-6">
          <p className="text-label text-ink-muted">Revenue</p>
          <p className="numeric mt-2 text-title text-ink">
            {<Money amount={totals.revenue} currency={currency} />}
          </p>
        </div>
        <div className="rounded-md border border-hairline bg-surface p-6">
          <p className="text-label text-ink-muted">Sales</p>
          <p className="numeric mt-2 text-title text-ink">
            {totals.saleCount}
          </p>
        </div>
        <div className="rounded-md border border-hairline bg-surface p-6">
          <p className="text-label text-ink-muted">Items sold</p>
          <p className="numeric mt-2 text-title text-ink">
            {totals.itemsSold}
          </p>
        </div>
      </div>

      <Table>
        <THead>
          <Th>Period</Th>
          <Th numeric>Sales</Th>
          <Th numeric>Items</Th>
          <Th numeric>Revenue</Th>
        </THead>
        <TBody>
          {points.length === 0 ? (
            <TableEmpty colSpan={4}>
              <EmptyState
                icon={<BarChart3 size={18} strokeWidth={1.5} aria-hidden="true" />}
                headline="No completed sales in this range."
                body="Widen the dates, or record a sale and it will appear here."
                actionLabel="Record a sale"
                actionHref="/sales/new"
              />
            </TableEmpty>
          ) : (
            points.map((point) => (
              <Tr key={point.startsOn}>
                <Td>{point.label}</Td>
                <Td numeric>{point.saleCount}</Td>
                <Td numeric>{point.itemsSold}</Td>
                <Td numeric>{<Money amount={point.revenue} currency={currency} />}</Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>

      <div>
        <h2 className="mb-1 text-title text-ink">Product performance</h2>
        <p className="mb-4 text-caption text-ink-muted">
          Margin uses the cost recorded when each sale completed, not today
          cost price. A supplier renegotiation cannot restate past margins.
        </p>

        {approximateMargins ? (
          <p className="mb-4 rounded-sm border border-hairline bg-surface-sunk px-3 py-2 text-caption text-warning">
            Some sales completed before cost snapshots were recorded. Their cost
            is counted as zero, so the margin for those products reads high.
          </p>
        ) : null}

        <Table>
          <THead>
            <Th>Product</Th>
            <Th numeric>Units</Th>
            <Th numeric>Revenue</Th>
            <Th numeric>Cost</Th>
            <Th numeric>Gross margin</Th>
          </THead>
          <TBody>
            {performance.length === 0 ? (
              <TableEmpty colSpan={5}>
                <EmptyState
                  icon={<BarChart3 size={18} strokeWidth={1.5} aria-hidden="true" />}
                  headline="Nothing sold yet."
                  body="Complete a sale and the products that earn the most appear here."
                />
              </TableEmpty>
            ) : (
              performance.map((row) => (
                <Tr key={row.productId}>
                  <Td>
                    {row.name}
                    <span className="mt-1 block text-caption text-ink-faint">
                      {row.sku}
                      {row.linesWithoutCost > 0 ? " - cost partly unknown" : ""}
                    </span>
                  </Td>
                  <Td numeric>{row.unitsSold}</Td>
                  <Td numeric>{<Money amount={row.revenue} currency={currency} />}</Td>
                  <Td numeric>{<Money amount={row.costOfGoods} currency={currency} />}</Td>
                  <Td numeric>{<Money amount={row.grossMargin} currency={currency} />}</Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </div>

      <div>
        <h2 className="mb-1 text-title text-ink">Stock valuation</h2>
        <p className="mb-4 text-caption text-ink-muted">
          What the stock on your shelves cost to buy, at today cost price.
          Inactive products are excluded.
        </p>

        <div className="mb-4 rounded-md border border-hairline bg-surface p-6">
          <p className="text-label text-ink-muted">Total stock at cost</p>
          <p className="numeric mt-2 text-title text-ink">
            {<Money amount={valuation.totalValue} currency={currency} />}
          </p>
        </div>

        <Table>
          <THead>
            <Th>Category</Th>
            <Th numeric>Products</Th>
            <Th numeric>Value at cost</Th>
          </THead>
          <TBody>
            {valuation.byCategory.length === 0 ? (
              <TableEmpty colSpan={3}>
                <EmptyState
                  icon={<BarChart3 size={18} strokeWidth={1.5} aria-hidden="true" />}
                  headline="No stock to value."
                  body="Add a product and receive some stock to see it valued here."
                  actionLabel="Go to inventory"
                  actionHref="/inventory"
                />
              </TableEmpty>
            ) : (
              valuation.byCategory.map((row) => (
                <Tr key={row.categoryName}>
                  <Td>{row.categoryName}</Td>
                  <Td numeric>{row.productCount}</Td>
                  <Td numeric>{<Money amount={row.stockValue} currency={currency} />}</Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
