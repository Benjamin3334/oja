import { PackageSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TBody,
  THead,
  Table,
  TableEmpty,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { listCategories } from "@/lib/queries/categories";
import { listProducts } from "@/lib/queries/products";
import { canManageInventory, getSignedInProfile } from "@/lib/queries/profile";

import { InventoryFilters } from "./inventory-filters";

export const metadata: Metadata = {
  title: "Inventory | Oja",
};

interface InventoryPageProps {
  // Next 15 hands these in as a Promise. Awaiting it is what opts the route
  // into dynamic rendering, which this page needs anyway: every query is
  // scoped to the signed-in organisation by RLS.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string
): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

export default async function InventoryPage({
  searchParams,
}: InventoryPageProps) {
  const params = await searchParams;

  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  const search = readParam(params, "q");
  const categoryId = readParam(params, "category");
  const lowStockOnly = readParam(params, "low") === "1";
  const includeInactive = readParam(params, "inactive") === "1";

  const [products, categories] = await Promise.all([
    listProducts({ search, categoryId, lowStockOnly, includeInactive }),
    listCategories(),
  ]);

  const categoryNames = new Map(categories.map((row) => [row.id, row.name]));
  const isFiltered = Boolean(search || categoryId || lowStockOnly);
  const canManage = canManageInventory(profile.role);
  const currency = profile.organisation.currency;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-display text-ink">Inventory</h1>

        <div className="flex items-center gap-2">
          <LinkButton href="/inventory/categories">Categories</LinkButton>
          {/* Section 9.2: staff may read stock but not change it, so the
              action is hidden as well as refused by RLS. */}
          {canManage ? (
            <LinkButton href="/inventory/new" variant="primary">
              Add product
            </LinkButton>
          ) : null}
        </div>
      </div>

      <InventoryFilters
        search={search}
        categoryId={categoryId}
        lowStockOnly={lowStockOnly}
        includeInactive={includeInactive}
        categories={categories.map((row) => ({ id: row.id, name: row.name }))}
      />

      <Table>
        <THead>
          <Th>Product</Th>
          <Th>Category</Th>
          <Th numeric>In stock</Th>
          <Th numeric>Price</Th>
          <Th>Status</Th>
        </THead>
        <TBody>
          {products.length === 0 ? (
            <TableEmpty colSpan={5}>
              <EmptyState
                icon={<PackageSearch size={18} strokeWidth={1.5} aria-hidden="true" />}
                headline={
                  isFiltered
                    ? "No products match these filters."
                    : "No products yet."
                }
                body={
                  isFiltered
                    ? "Try a different search term, or clear the filters to see everything."
                    : "Add your first product to start tracking stock, prices and reorder levels."
                }
                actionLabel={
                  isFiltered
                    ? "Clear filters"
                    : canManage
                      ? "Add a product"
                      : undefined
                }
                actionHref={
                  isFiltered
                    ? "/inventory"
                    : canManage
                      ? "/inventory/new"
                      : undefined
                }
              />
            </TableEmpty>
          ) : (
            products.map((product) => (
              <Tr key={product.id}>
                <Td>
                  <Link
                    href={`/inventory/${product.id}`}
                    className="text-ink underline-offset-2 hover:underline"
                  >
                    {product.name}
                  </Link>
                  <span className="mt-1 block text-caption text-ink-faint">
                    {product.sku}
                  </span>
                </Td>
                <Td>
                  {product.categoryId
                    ? categoryNames.get(product.categoryId) ?? "Uncategorised"
                    : "Uncategorised"}
                </Td>
                <Td numeric>{product.stockQuantity}</Td>
                <Td numeric>{formatMoney(product.unitPrice, currency)}</Td>
                <Td>
                  {!product.isActive ? (
                    <Badge tone="neutral">Inactive</Badge>
                  ) : product.isLowStock ? (
                    <Badge tone="warning">Low</Badge>
                  ) : (
                    <Badge tone="positive">In stock</Badge>
                  )}
                </Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
