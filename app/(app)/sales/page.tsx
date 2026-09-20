import { Receipt } from "lucide-react";
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
import { formatDateTime, formatMoney } from "@/lib/format";
import { getSignedInProfile } from "@/lib/queries/profile";
import { listSales, type SaleStatus } from "@/lib/queries/sales";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payment-methods";

import { SaleFilters } from "./sale-filters";

export const metadata: Metadata = {
  title: "Sales | Oja",
};

interface SalesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_TONES = {
  draft: "neutral",
  completed: "positive",
  void: "danger",
} as const;

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string
): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const params = await searchParams;

  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  const status = readParam(params, "status");
  const payment = readParam(params, "payment");
  const from = readParam(params, "from");
  const to = readParam(params, "to");

  const sales = await listSales({
    status: status ? (status as SaleStatus) : undefined,
    paymentMethod: PAYMENT_METHODS.includes(payment as PaymentMethod)
      ? (payment as PaymentMethod)
      : undefined,
    // The date inputs give a day; the column is a timestamp. The day is
    // widened to cover it at both ends, rather than silently excluding
    // everything that happened after midnight on the closing day.
    from: from ? `${from}T00:00:00` : undefined,
    to: to ? `${to}T23:59:59.999` : undefined,
  });

  const isFiltered = Boolean(status || payment || from || to);
  const currency = profile.organisation.currency;
  const isStaff = profile.role === "staff";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-display text-ink">Sales</h1>
          {/* Migration 0008 scopes this list by sold_by. Saying so is more
              honest than showing a staff member a short list that looks like
              the whole shop. */}
          {isStaff ? (
            <p className="mt-1 text-caption text-ink-muted">
              You are seeing the sales you recorded.
            </p>
          ) : null}
        </div>

        <LinkButton href="/sales/new" variant="primary">
          New sale
        </LinkButton>
      </div>

      <SaleFilters
        status={status}
        paymentMethod={payment}
        from={from}
        to={to}
      />

      <Table>
        <THead>
          <Th>Reference</Th>
          <Th>When</Th>
          <Th>Customer</Th>
          <Th>Sold by</Th>
          <Th>Status</Th>
          <Th numeric>Total</Th>
        </THead>
        <TBody>
          {sales.length === 0 ? (
            <TableEmpty colSpan={6}>
              <EmptyState
                icon={<Receipt size={18} strokeWidth={1.5} aria-hidden="true" />}
                headline={
                  isFiltered ? "No sales match these filters." : "No sales yet."
                }
                body={
                  isFiltered
                    ? "Try a wider date range, or clear the filters to see everything."
                    : "Record your first sale to start tracking takings and stock together."
                }
                actionLabel={isFiltered ? "Clear filters" : "Record a sale"}
                actionHref={isFiltered ? "/sales" : "/sales/new"}
              />
            </TableEmpty>
          ) : (
            sales.map((sale) => (
              <Tr key={sale.id}>
                <Td>
                  <Link
                    href={`/sales/${sale.id}`}
                    className="numeric text-ink underline-offset-2 hover:underline"
                  >
                    {sale.reference}
                  </Link>
                </Td>
                <Td>{formatDateTime(sale.soldAt)}</Td>
                <Td>{sale.customerName ?? "Walk-in"}</Td>
                <Td>{sale.soldByName ?? "Removed user"}</Td>
                <Td>
                  <Badge tone={STATUS_TONES[sale.status]}>
                    {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
                  </Badge>
                </Td>
                <Td numeric>{formatMoney(sale.total, currency)}</Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
