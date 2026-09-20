import { createClient } from "@/lib/supabase/server";

// Lifetime spend is role-dependent for the same reason the sales queries are:
// migration 0008 scopes sales by sold_by, so a staff member reading a customer
// sees the total of the sales THEY recorded for that customer, not the
// customer's true lifetime spend. An owner sees the real figure. Any screen
// showing this to a staff member has to label it honestly rather than call it
// a lifetime total.

export interface CustomerListItem {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  saleCount: number;
  lifetimeSpend: number;
}

interface EmbeddedSale {
  status: string;
  sale_items: { line_total: number | null }[] | null;
}

function summarise(sales: EmbeddedSale[] | null) {
  const completed = (sales ?? []).filter((sale) => sale.status === "completed");

  return {
    saleCount: completed.length,
    lifetimeSpend: completed.reduce(
      (total, sale) =>
        total +
        (sale.sale_items ?? []).reduce(
          (sum, line) => sum + (line.line_total ?? 0),
          0
        ),
      0
    ),
  };
}

// Reference query 9.3 is a LEFT JOIN precisely so customers who have never
// bought anything still appear. An embedded select gives the same shape: a
// customer with no sales comes back with an empty array rather than being
// dropped, which is what makes this a left join and not an inner one.
export async function listCustomers(): Promise<CustomerListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, phone, email, sales ( status, sale_items ( line_total ) )")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[queries.listCustomers]", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    ...summarise(row.sales),
  }));
}

export interface CustomerPurchase {
  id: string;
  reference: string;
  status: string;
  soldAt: string;
  total: number;
}

export interface CustomerDetail extends CustomerListItem {
  address: string | null;
  purchases: CustomerPurchase[];
}

export async function getCustomer(
  customerId: string
): Promise<CustomerDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, full_name, phone, email, address, sales ( id, reference, status, sold_at, sale_items ( line_total ) )"
    )
    .eq("id", customerId)
    .maybeSingle();

  if (error) {
    console.error("[queries.getCustomer]", error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  const sales = data.sales ?? [];

  return {
    id: data.id,
    fullName: data.full_name,
    phone: data.phone,
    email: data.email,
    address: data.address,
    ...summarise(sales),
    // The history shows voided sales as well as completed ones. A void is part
    // of the record - nothing is deleted - and hiding it would make the
    // history disagree with the lifetime total for no stated reason.
    purchases: sales
      .map((sale) => ({
        id: sale.id,
        reference: sale.reference,
        status: sale.status,
        soldAt: sale.sold_at,
        total: (sale.sale_items ?? []).reduce(
          (sum, line) => sum + (line.line_total ?? 0),
          0
        ),
      }))
      .sort((a, b) => b.soldAt.localeCompare(a.soldAt)),
  };
}
