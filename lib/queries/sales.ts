import { createClient } from "@/lib/supabase/server";
import type { PaymentMethod } from "@/lib/validation/sales";

// EVERY QUERY IN THIS FILE IS ROLE-DEPENDENT.
// Migration 0008 scopes the sales policy by sold_by: an owner or manager sees
// the whole organisation, a staff member sees only the sales they recorded.
// Nothing here filters by user, and nothing here should - the same query
// returns different rows for different callers, on purpose. It follows that
// "revenue today" is genuinely per-person for staff and shop-wide for an
// owner. That is the intended behaviour, not a bug to be worked around, and
// any screen showing these numbers has to be read with it in mind.

export type SaleStatus = "draft" | "completed" | "void";

export interface SaleListItem {
  id: string;
  reference: string;
  status: SaleStatus;
  paymentMethod: PaymentMethod;
  soldAt: string;
  customerName: string | null;
  soldByName: string | null;
  total: number;
}

export interface SaleFilters {
  status?: SaleStatus;
  paymentMethod?: PaymentMethod;
  from?: string;
  to?: string;
}

// line_total is a generated column, so the total is summed from the lines
// rather than stored on the sale. There is no second copy to fall out of step.
function sumLines(lines: { line_total: number | null }[] | null): number {
  return (lines ?? []).reduce((total, line) => total + (line.line_total ?? 0), 0);
}

export async function listSales(
  filters: SaleFilters = {}
): Promise<SaleListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("sales")
    .select(
      "id, reference, status, payment_method, sold_at, customers ( full_name ), profiles ( full_name ), sale_items ( line_total )"
    );

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.paymentMethod) {
    query = query.eq("payment_method", filters.paymentMethod);
  }

  if (filters.from) {
    query = query.gte("sold_at", filters.from);
  }

  if (filters.to) {
    query = query.lte("sold_at", filters.to);
  }

  const { data, error } = await query
    .order("sold_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[queries.listSales]", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    reference: row.reference,
    status: row.status,
    paymentMethod: row.payment_method,
    soldAt: row.sold_at,
    customerName: row.customers?.full_name ?? null,
    soldByName: row.profiles?.full_name ?? null,
    total: sumLines(row.sale_items),
  }));
}

export interface SaleLine {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SaleDetail extends SaleListItem {
  note: string | null;
  customerId: string | null;
  lines: SaleLine[];
}

export async function getSale(saleId: string): Promise<SaleDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, reference, status, payment_method, sold_at, note, customer_id, customers ( full_name ), profiles ( full_name ), sale_items ( id, product_id, quantity, unit_price, line_total, products ( name, sku ) )"
    )
    .eq("id", saleId)
    .maybeSingle();

  if (error) {
    console.error("[queries.getSale]", error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    reference: data.reference,
    status: data.status,
    paymentMethod: data.payment_method,
    soldAt: data.sold_at,
    note: data.note,
    customerId: data.customer_id,
    customerName: data.customers?.full_name ?? null,
    soldByName: data.profiles?.full_name ?? null,
    total: sumLines(data.sale_items),
    lines: (data.sale_items ?? []).map((line) => ({
      id: line.id,
      productId: line.product_id,
      // A product is never hard-deleted while it has sales history
      // (FR-3.2 and the on delete restrict on sale_items.product_id), so this
      // join cannot come back empty for a real line.
      productName: line.products?.name ?? "Unknown product",
      sku: line.products?.sku ?? "",
      quantity: line.quantity,
      unitPrice: line.unit_price,
      lineTotal: line.line_total ?? 0,
    })),
  };
}

export interface TodayFigures {
  revenue: number;
  saleCount: number;
  itemsSold: number;
  lowStockCount: number;
}

// FR-2.1. Summed in JavaScript rather than in SQL because PostgREST cannot
// aggregate across a nested relation, and at MVP scale a day of sales is a
// small number of rows. If that stops being true the answer is a view, not a
// loop over pages.
export async function getTodayFigures(): Promise<TodayFigures> {
  const supabase = await createClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [salesResult, lowStockResult] = await Promise.all([
    supabase
      .from("sales")
      .select("id, sale_items ( quantity, line_total )")
      .eq("status", "completed")
      .gte("sold_at", startOfDay.toISOString()),
    supabase
      .from("v_low_stock")
      .select("product_id", { count: "exact", head: true }),
  ]);

  if (salesResult.error) {
    console.error("[queries.getTodayFigures]", salesResult.error.message);
  }

  if (lowStockResult.error) {
    console.error("[queries.getTodayFigures.lowStock]", lowStockResult.error.message);
  }

  const sales = salesResult.data ?? [];

  return {
    revenue: sales.reduce((total, sale) => total + sumLines(sale.sale_items), 0),
    saleCount: sales.length,
    itemsSold: sales.reduce(
      (total, sale) =>
        total +
        (sale.sale_items ?? []).reduce((count, line) => count + line.quantity, 0),
      0
    ),
    lowStockCount: lowStockResult.count ?? 0,
  };
}
