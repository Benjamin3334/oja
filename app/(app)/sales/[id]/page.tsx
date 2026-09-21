import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { Card } from "@/components/ui/card";
import {
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { listProducts } from "@/lib/queries/products";
import { getSignedInProfile } from "@/lib/queries/profile";
import { getSale } from "@/lib/queries/sales";

import { AddLineForm } from "./add-line-form";
import { DraftBasket } from "./draft-basket";
import { VoidSaleForm } from "./void-sale-form";

export const metadata: Metadata = {
  title: "Sale | Oja",
};

interface SalePageProps {
  params: Promise<{ id: string }>;
}

const STATUS_TONES = {
  draft: "neutral",
  completed: "positive",
  void: "danger",
} as const;

export default async function SalePage({ params }: SalePageProps) {
  const { id } = await params;

  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  const sale = await getSale(id);

  // A sale outside this organisation is invisible to the query because RLS
  // scopes it, and since 0008 a staff member cannot see a colleague sale
  // either. Both arrive here as the same 404, which tells the caller nothing
  // about what exists.
  if (!sale) {
    notFound();
  }

  const currency = profile.organisation.currency;
  const isDraft = sale.status === "draft";
  const canVoid =
    sale.status === "completed" &&
    (profile.role === "owner" || profile.role === "manager");

  // Only needed for the picker, so it is not fetched for a finished sale.
  const products = isDraft ? await listProducts({}) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/sales"
            className="text-caption text-ink-muted underline underline-offset-2"
          >
            Sales
          </Link>
          <h1 className="numeric mt-2 text-display text-ink">
            {sale.reference}
          </h1>
          <p className="mt-1 text-caption text-ink-faint">
            {formatDateTime(sale.soldAt)} &middot;{" "}
            {sale.customerName ?? "Walk-in"} &middot; {sale.paymentMethod}
            {sale.soldByName ? ` · ${sale.soldByName}` : ""}
          </p>
        </div>

        <Badge tone={STATUS_TONES[sale.status]}>
          {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
        </Badge>
      </div>

      {isDraft ? (
        <>
          <Card title="Add a product">
            <AddLineForm
              saleId={sale.id}
              products={products.map((product) => ({
                id: product.id,
                label: `${product.name} - ${product.stockQuantity} left`,
              }))}
            />
          </Card>

          {sale.lines.length === 0 ? (
            <p className="rounded-md border border-hairline bg-surface px-6 py-8 text-body text-ink-muted">
              Nothing on this sale yet. Add a product above, then complete the
              sale to take the stock off the shelf.
            </p>
          ) : (
            <DraftBasket
              saleId={sale.id}
              lines={sale.lines}
              total={sale.total}
              currency={currency}
            />
          )}
        </>
      ) : (
        <>
          <Table>
            <THead>
              <Th>Product</Th>
              <Th numeric>Price</Th>
              <Th numeric>Quantity</Th>
              <Th numeric>Line total</Th>
            </THead>
            <TBody>
              {sale.lines.map((line) => (
                <Tr key={line.id}>
                  <Td>
                    {line.productName}
                    <span className="mt-1 block text-caption text-ink-faint">
                      {line.sku}
                    </span>
                  </Td>
                  {/* This is what the customer actually paid, snapshotted at
                      completion by 0012. Changing the product price since then
                      does not move it. */}
                  <Td numeric>{<Money amount={line.unitPrice} currency={currency} />}</Td>
                  <Td numeric>{line.quantity}</Td>
                  <Td numeric>{<Money amount={line.lineTotal} currency={currency} />}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>

          <div className="flex items-center justify-between rounded-md border border-hairline bg-surface px-6 py-4">
            <p className="text-label text-ink-muted">Total</p>
            <p className="numeric text-title text-ink">
              {<Money amount={sale.total} currency={currency} />}
            </p>
          </div>
        </>
      )}

      {sale.note ? (
        <Card title="Note">
          <p className="text-body text-ink">{sale.note}</p>
        </Card>
      ) : null}

      {canVoid ? (
        <Card title="Void this sale">
          <VoidSaleForm saleId={sale.id} />
        </Card>
      ) : null}
    </div>
  );
}
