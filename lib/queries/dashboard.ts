import { lagosDateOffsetBy } from "@/lib/queries/reports";
import { createClient } from "@/lib/supabase/server";

// The two dashboard panels. Both are summaries of data that has a full screen
// elsewhere, so each one is deliberately short and links onward rather than
// trying to be the report.

export interface LowStockItem {
  productId: string;
  name: string;
  sku: string;
  stockQuantity: number;
  reorderLevel: number;
}

// v_low_stock already encodes "stock at or below reorder level" - the
// comparison between two columns that PostgREST cannot express - so this
// selects from it rather than reimplementing the predicate here. RLS scopes
// the view to the caller's organisation, so no org filter is written.
//
// Ordered by how little is left, not alphabetically: the panel answers "what
// runs out first", and a name-ordered list buries that.
export async function getLowStock(limit = 5): Promise<LowStockItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_low_stock")
    .select("product_id, name, sku, stock_quantity, reorder_level")
    .order("stock_quantity", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[queries.getLowStock]", error.message);
    return [];
  }

  return (data ?? [])
    .filter((row) => row.product_id !== null)
    .map((row) => ({
      productId: row.product_id as string,
      name: row.name ?? "",
      sku: row.sku ?? "",
      stockQuantity: row.stock_quantity ?? 0,
      reorderLevel: row.reorder_level ?? 0,
    }));
}

export interface TopSeller {
  productId: string;
  name: string;
  sku: string;
  unitsSold: number;
  revenue: number;
}

// PRD section 8.5: the products earning the most over the last 30 days.
//
// NOT v_product_performance, which is lifetime and has no date column to
// filter on - a shop's all-time best seller is not the same question as what
// is selling now, and the dashboard is asking the second one.
//
// The rollup happens here rather than in SQL because PostgREST cannot GROUP BY.
// The same trade as getTodayFigures: the join and the per-line totals are the
// database's work, and what is walked here is one bounded window of sales. If
// a month of sales ever stops being a small number of rows, the answer is a
// date-scoped view, not pagination in this function.
//
// ROLE DEPENDENT, like everything built on sales: 0008 scopes them by sold_by,
// so a staff member sees their own best sellers. The panel says so.
export async function getTopSellers(
  days = 30,
  limit = 5
): Promise<TopSeller[]> {
  const supabase = await createClient();

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, sale_items ( product_id, quantity, line_total, products ( name, sku ) )"
    )
    .eq("status", "completed")
    .gte("sold_at", since.toISOString());

  if (error) {
    console.error("[queries.getTopSellers]", error.message);
    return [];
  }

  const totals = new Map<string, TopSeller>();

  for (const sale of data ?? []) {
    for (const line of sale.sale_items ?? []) {
      const existing = totals.get(line.product_id);

      if (existing) {
        existing.unitsSold += line.quantity;
        existing.revenue += line.line_total ?? 0;
      } else {
        totals.set(line.product_id, {
          productId: line.product_id,
          name: line.products?.name ?? "Unknown product",
          sku: line.products?.sku ?? "",
          unitsSold: line.quantity,
          revenue: line.line_total ?? 0,
        });
      }
    }
  }

  return [...totals.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export interface RevenueDay {
  // Lagos calendar date, YYYY-MM-DD.
  date: string;
  // Short label for the axis, e.g. "Mon 21".
  label: string;
  revenue: number;
}

export interface RevenueSeries {
  days: RevenueDay[];
  total: number;
  // Null when the previous week earned nothing: a percentage change from zero
  // is not a number anyone can act on, and "+infinity%" is worse than silence.
  trendPercent: number | null;
}

// PRD section 8.5: the 14-day revenue chart.
//
// GAPS ARE FILLED IN TYPESCRIPT, NOT SQL
//   generate_series() would be the neater answer and would keep the whole
//   shape in the database - but it would need a new view or function, and the
//   schema is closed at 0017. Adding a migration to pad fourteen rows would be
//   the tail wagging the dog.
//
//   The cost is small and bounded: v_revenue_by_day returns at most 14 rows
//   for this window, and the fill walks a fixed 14-day calendar. This is not
//   the client-side aggregation FR-7.1 forbids - the summing still happens in
//   the view. What happens here is padding, not arithmetic.
//
//   A day with no sales must still appear, or the chart silently compresses a
//   quiet week into a busy-looking one by omitting the empty days.
export async function getRevenueSeries(days = 14): Promise<RevenueSeries> {
  const supabase = await createClient();

  const from = lagosDateOffsetBy(-(days - 1));
  const to = lagosDateOffsetBy(0);

  const { data, error } = await supabase
    .from("v_revenue_by_day")
    .select("day, revenue")
    .gte("day", from)
    .lte("day", to);

  if (error) {
    console.error("[queries.getRevenueSeries]", error.message);
  }

  const byDate = new Map<string, number>();

  for (const row of data ?? []) {
    if (row.day) {
      byDate.set(row.day, row.revenue ?? 0);
    }
  }

  const series: RevenueDay[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);

  for (let index = 0; index < days; index += 1) {
    const date = cursor.toISOString().slice(0, 10);

    series.push({
      date,
      // Weekday and day of month: enough to locate a bar without an axis.
      label: new Intl.DateTimeFormat("en-NG", {
        weekday: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(cursor),
      revenue: byDate.get(date) ?? 0,
    });

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const half = Math.floor(days / 2);
  const previous = series
    .slice(0, half)
    .reduce((sum, day) => sum + day.revenue, 0);
  const current = series
    .slice(half)
    .reduce((sum, day) => sum + day.revenue, 0);

  return {
    days: series,
    total: previous + current,
    trendPercent:
      previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}
