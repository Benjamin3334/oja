import { createClient } from "@/lib/supabase/server";

// Current stock is DERIVED, never stored (FR-3.3). Every read goes through
// v_product_stock, which sums the movement ledger. Since migration 0002 that
// view runs with security_invoker, so RLS scopes it to the caller's
// organisation and no org_id filter is needed here.
//
// Columns come back nullable because PostgreSQL cannot prove non-null through a
// view. They are normalised once, here, so no screen has to deal with it.

export interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  categoryId: string | null;
  unitPrice: number;
  costPrice: number;
  reorderLevel: number;
  isActive: boolean;
  stockQuantity: number;
  isLowStock: boolean;
}

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  lowStockOnly?: boolean;
  includeInactive?: boolean;
}

interface StockViewRow {
  product_id: string | null;
  sku: string | null;
  name: string | null;
  category_id: string | null;
  unit_price: number | null;
  cost_price: number | null;
  reorder_level: number | null;
  is_active: boolean | null;
  stock_quantity: number | null;
}

function toProduct(row: StockViewRow): ProductListItem | null {
  if (!row.product_id) {
    return null;
  }

  const stockQuantity = row.stock_quantity ?? 0;
  const reorderLevel = row.reorder_level ?? 0;

  return {
    id: row.product_id,
    sku: row.sku ?? "",
    name: row.name ?? "",
    categoryId: row.category_id,
    unitPrice: row.unit_price ?? 0,
    costPrice: row.cost_price ?? 0,
    reorderLevel,
    isActive: row.is_active ?? false,
    stockQuantity,
    isLowStock: stockQuantity <= reorderLevel,
  };
}

const COLUMNS =
  "product_id, sku, name, category_id, unit_price, cost_price, reorder_level, is_active, stock_quantity";

export async function listProducts(
  filters: ProductFilters = {}
): Promise<ProductListItem[]> {
  const supabase = await createClient();

  // "Low stock only" compares two columns, which PostgREST cannot express.
  // v_low_stock already encodes exactly that predicate, so the filter selects a
  // different source rather than being reimplemented in JavaScript.
  const source = filters.lowStockOnly ? "v_low_stock" : "v_product_stock";

  let query = supabase.from(source).select(COLUMNS);

  if (!filters.includeInactive) {
    query = query.eq("is_active", true);
  }

  if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }

  // FR-3.1 search covers name and SKU. The index on (org_id, lower(name))
  // exists for this.
  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`name.ilike.${term},sku.ilike.${term}`);
  }

  const { data, error } = await query.order("name", { ascending: true });

  if (error) {
    console.error("[queries.listProducts]", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => toProduct(row as StockViewRow))
    .filter((product): product is ProductListItem => product !== null);
}

export async function getProduct(
  productId: string
): Promise<ProductListItem | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_product_stock")
    .select(COLUMNS)
    .eq("product_id", productId)
    .maybeSingle();

  if (error) {
    console.error("[queries.getProduct]", error.message);
    return null;
  }

  return data ? toProduct(data as StockViewRow) : null;
}

// FR-3.6: movement history per product, newest first. Shows type, quantity,
// reason, user and time.
export interface StockMovementItem {
  id: string;
  movementType: "in" | "out" | "adjustment";
  quantity: number;
  reason: string | null;
  createdAt: string;
  createdByName: string | null;
  saleId: string | null;
}

export async function getProductMovements(
  productId: string
): Promise<StockMovementItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, movement_type, quantity, reason, created_at, sale_id, profiles ( full_name )")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[queries.getProductMovements]", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    movementType: row.movement_type,
    quantity: row.quantity,
    reason: row.reason,
    createdAt: row.created_at,
    saleId: row.sale_id,
    // Selecting through created_by nests the profile as an object rather than
    // flattening it (section 8 trap). It is null when the user was deleted,
    // because the foreign key is on delete set null.
    createdByName: row.profiles?.full_name ?? null,
  }));
}
