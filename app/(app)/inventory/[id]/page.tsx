import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { setProductActive } from "@/lib/actions/products";
import { adjustStock, receiveStock } from "@/lib/actions/stock";
import { formatDateTime, formatMoney, formatSignedQuantity } from "@/lib/format";
import { listCategories } from "@/lib/queries/categories";
import { getProduct, getProductMovements } from "@/lib/queries/products";
import { canManageInventory, getSignedInProfile } from "@/lib/queries/profile";

import { ProductStatusToggle } from "./product-status-toggle";
import { StockForm } from "./stock-form";

export const metadata: Metadata = {
  title: "Product | Oja",
};

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

const MOVEMENT_LABELS: Record<string, string> = {
  in: "Received",
  out: "Sold",
  adjustment: "Adjusted",
};

interface FactProps {
  label: string;
  value: string;
}

function Fact({ label, value }: FactProps) {
  return (
    <div>
      <p className="text-label text-ink-muted">{label}</p>
      <p className="mt-1 numeric text-ink">{value}</p>
    </div>
  );
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;

  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  const [product, movements, categories] = await Promise.all([
    getProduct(id),
    getProductMovements(id),
    listCategories(),
  ]);

  if (!product) {
    notFound();
  }

  const canManage = canManageInventory(profile.role);
  const currency = profile.organisation.currency;
  const categoryName = product.categoryId
    ? categories.find((row) => row.id === product.categoryId)?.name ?? "Uncategorised"
    : "Uncategorised";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/inventory"
            className="text-caption text-ink-muted underline underline-offset-2"
          >
            Inventory
          </Link>
          <h1 className="mt-2 font-display text-display text-ink">
            {product.name}
          </h1>
          <p className="mt-1 text-caption text-ink-faint">
            {product.sku} &middot; {categoryName}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!product.isActive ? (
            <Badge tone="neutral">Inactive</Badge>
          ) : product.isLowStock ? (
            <Badge tone="warning">Low stock</Badge>
          ) : (
            <Badge tone="positive">In stock</Badge>
          )}

          {canManage ? (
            <LinkButton href={`/inventory/${product.id}/edit`}>Edit</LinkButton>
          ) : null}
        </div>
      </div>

      <Card title="Details">
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          <Fact label="In stock" value={String(product.stockQuantity)} />
          <Fact label="Reorder level" value={String(product.reorderLevel)} />
          <Fact
            label="Selling price"
            value={formatMoney(product.unitPrice, currency)}
          />
          {/* Cost, and therefore margin, is management information. Staff can
              see what a thing sells for, not what it cost to buy. */}
          {canManage ? (
            <Fact
              label="Cost price"
              value={formatMoney(product.costPrice, currency)}
            />
          ) : null}
        </div>

        {canManage ? (
          <div className="mt-6 border-t border-hairline pt-6">
            <ProductStatusToggle
              productId={product.id}
              isActive={product.isActive}
              action={setProductActive}
            />
          </div>
        ) : null}
      </Card>

      {canManage ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Receive stock">
            <StockForm
              action={receiveStock}
              productId={product.id}
              idPrefix="receive"
              quantityLabel="Quantity received"
              quantityHint="How many units arrived."
              quantityMin={1}
              reasonLabel="Source"
              reasonPlaceholder="Delivery from supplier"
              submitLabel="Record delivery"
              successMessage="Delivery recorded."
            />
          </Card>

          <Card title="Adjust stock">
            <StockForm
              action={adjustStock}
              productId={product.id}
              idPrefix="adjust"
              quantityLabel="Change in units"
              quantityHint="Negative for breakage or loss, positive for a recount upward."
              reasonLabel="Reason"
              reasonPlaceholder="Damaged in transit"
              submitLabel="Record adjustment"
              successMessage="Adjustment recorded."
            />
          </Card>
        </div>
      ) : null}

      <div>
        <h2 className="mb-4 text-title text-ink">Movement history</h2>

        <Table>
          <THead>
            <Th>When</Th>
            <Th>Type</Th>
            <Th numeric>Quantity</Th>
            <Th>Reason</Th>
            <Th>By</Th>
          </THead>
          <TBody>
            {movements.length === 0 ? (
              <TableEmpty colSpan={5}>
                <EmptyState
                  icon={<History size={18} strokeWidth={1.5} aria-hidden="true" />}
                  headline="No movements yet."
                  body="Receiving stock, selling it or adjusting it all leave a line here, with who did it and why."
                />
              </TableEmpty>
            ) : (
              movements.map((movement) => (
                <Tr key={movement.id}>
                  <Td>{formatDateTime(movement.createdAt)}</Td>
                  <Td>{MOVEMENT_LABELS[movement.movementType]}</Td>
                  {/* A sale is stored as a positive magnitude with type "out",
                      so the minus sign is added for reading rather than being
                      what the ledger holds. */}
                  <Td numeric>
                    {movement.movementType === "out"
                      ? `-${movement.quantity}`
                      : formatSignedQuantity(movement.quantity)}
                  </Td>
                  <Td>{movement.reason ?? "Sale"}</Td>
                  <Td>{movement.createdByName ?? "Removed user"}</Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
