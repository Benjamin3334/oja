import { createClient } from "@/lib/supabase/server";

// FR-7.1. The aggregation is v_revenue_by_day, which groups on the Lagos
// calendar day in SQL (migration 0013). Nothing here re-decides what a day is.
//
// REPORTS ARE OWNER AND MANAGER ONLY (section 9.2), and that matters more here
// than on other screens: 0008 scopes sales by sold_by, so a staff member
// reading these views would get their own takings presented as the shop total.
// The route gate is the control; this module does not filter by user.

export type RevenueGrain = "day" | "week" | "month";

export interface RevenuePoint {
  // The bucket label, already formatted for display and for a CSV cell.
  label: string;
  // Sort key: the first day of the bucket, YYYY-MM-DD.
  startsOn: string;
  revenue: number;
  saleCount: number;
  itemsSold: number;
}

interface DayRow {
  day: string | null;
  revenue: number | null;
  sale_count: number | null;
  items_sold: number | null;
}

// Monday of the week a date falls in. ISO weeks start on Monday, and a report
// that starts its week on Sunday disagrees with every other business report
// the shop will ever be shown.
function startOfIsoWeek(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const weekday = date.getUTCDay(); // 0 = Sunday
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  date.setUTCDate(date.getUTCDate() - daysFromMonday);
  return date.toISOString().slice(0, 10);
}

function bucketFor(iso: string, grain: RevenueGrain) {
  if (grain === "day") {
    return { startsOn: iso, label: iso };
  }

  if (grain === "week") {
    const monday = startOfIsoWeek(iso);
    return { startsOn: monday, label: `Week of ${monday}` };
  }

  const month = iso.slice(0, 7);
  return { startsOn: `${month}-01`, label: month };
}

export async function getRevenue(
  from: string,
  to: string,
  grain: RevenueGrain = "day"
): Promise<RevenuePoint[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_revenue_by_day")
    .select("day, revenue, sale_count, items_sold")
    .gte("day", from)
    .lte("day", to)
    .order("day", { ascending: true });

  if (error) {
    console.error("[queries.getRevenue]", error.message);
    return [];
  }

  // Rolling pre-aggregated day rows into weeks or months is not the
  // client-side loop FR-7.1 forbids: the join and the per-line summation,
  // the parts that grow with the number of sales, already happened in SQL.
  // This walks at most one row per day in the range.
  const buckets = new Map<string, RevenuePoint>();

  for (const row of (data ?? []) as DayRow[]) {
    if (!row.day) {
      continue;
    }

    const { startsOn, label } = bucketFor(row.day, grain);
    const existing = buckets.get(startsOn);

    if (existing) {
      existing.revenue += row.revenue ?? 0;
      existing.saleCount += row.sale_count ?? 0;
      existing.itemsSold += row.items_sold ?? 0;
    } else {
      buckets.set(startsOn, {
        label,
        startsOn,
        revenue: row.revenue ?? 0,
        saleCount: row.sale_count ?? 0,
        itemsSold: row.items_sold ?? 0,
      });
    }
  }

  return [...buckets.values()].sort((a, b) =>
    a.startsOn.localeCompare(b.startsOn)
  );
}

export interface RevenueTotals {
  revenue: number;
  saleCount: number;
  itemsSold: number;
}

export function totalsFor(points: RevenuePoint[]): RevenueTotals {
  return points.reduce<RevenueTotals>(
    (total, point) => ({
      revenue: total.revenue + point.revenue,
      saleCount: total.saleCount + point.saleCount,
      itemsSold: total.itemsSold + point.itemsSold,
    }),
    { revenue: 0, saleCount: 0, itemsSold: 0 }
  );
}

// Lagos is UTC+1 year-round. Same reasoning as lib/queries/sales.ts: a fixed
// offset is correct for a zone that has not shifted since 1945.
const LAGOS_OFFSET_MINUTES = 60;

export function lagosDateOffsetBy(days: number): string {
  const now = new Date();
  const shifted = new Date(
    now.getTime() + LAGOS_OFFSET_MINUTES * 60_000 + days * 86_400_000
  );
  return shifted.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// FR-7.2 - product performance.
// ---------------------------------------------------------------------------

export interface ProductPerformanceRow {
  productId: string;
  sku: string;
  name: string;
  unitsSold: number;
  revenue: number;
  costOfGoods: number;
  grossMargin: number;
  // Lines completed before migration 0006 have no unit_cost. The view counts
  // them so a reader can tell how much of the margin is approximate instead of
  // being shown a confident number built partly on zeros.
  linesWithoutCost: number;
}

export async function getProductPerformance(): Promise<ProductPerformanceRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_product_performance")
    .select(
      "product_id, sku, name, units_sold, revenue, cost_of_goods, gross_margin, lines_without_cost"
    )
    .order("gross_margin", { ascending: false });

  if (error) {
    console.error("[queries.getProductPerformance]", error.message);
    return [];
  }

  return (data ?? [])
    .filter((row) => row.product_id !== null)
    .map((row) => ({
      productId: row.product_id as string,
      sku: row.sku ?? "",
      name: row.name ?? "",
      unitsSold: row.units_sold ?? 0,
      revenue: row.revenue ?? 0,
      costOfGoods: row.cost_of_goods ?? 0,
      grossMargin: row.gross_margin ?? 0,
      linesWithoutCost: row.lines_without_cost ?? 0,
    }));
}

// ---------------------------------------------------------------------------
// FR-7.3 - stock valuation, one figure plus a per-category breakdown.
// ---------------------------------------------------------------------------

export interface CategoryValuation {
  categoryName: string;
  productCount: number;
  stockValue: number;
}

export interface StockValuation {
  totalValue: number;
  byCategory: CategoryValuation[];
}

export async function getStockValuation(): Promise<StockValuation> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_stock_valuation")
    .select("category_name, stock_value");

  if (error) {
    console.error("[queries.getStockValuation]", error.message);
    return { totalValue: 0, byCategory: [] };
  }

  const groups = new Map<string, CategoryValuation>();
  let totalValue = 0;

  for (const row of data ?? []) {
    const value = row.stock_value ?? 0;
    totalValue += value;

    // A product with no category still holds value. Dropping it would make the
    // breakdown disagree with the total, which is the one thing a valuation
    // must never do.
    const key = row.category_name ?? "Uncategorised";
    const existing = groups.get(key);

    if (existing) {
      existing.productCount += 1;
      existing.stockValue += value;
    } else {
      groups.set(key, { categoryName: key, productCount: 1, stockValue: value });
    }
  }

  return {
    totalValue,
    byCategory: [...groups.values()].sort((a, b) => b.stockValue - a.stockValue),
  };
}
