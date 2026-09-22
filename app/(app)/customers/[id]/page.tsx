import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
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
import { formatDateTime } from "@/lib/format";
import { getCustomer } from "@/lib/queries/customers";
import { getSignedInProfile } from "@/lib/queries/profile";

export const metadata: Metadata = {
  title: "Customer | Oja",
};

interface CustomerPageProps {
  params: Promise<{ id: string }>;
}

const STATUS_TONES: Record<string, "neutral" | "positive" | "danger"> = {
  draft: "neutral",
  completed: "positive",
  void: "danger",
};

interface FactProps {
  label: string;
  value: string;
}

function Fact({ label, value }: FactProps) {
  return (
    <div>
      <p className="text-label text-ink-muted">{label}</p>
      <p className="mt-1 text-body text-ink">{value}</p>
    </div>
  );
}

export default async function CustomerPage({ params }: CustomerPageProps) {
  const { id } = await params;

  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  const customer = await getCustomer(id);

  if (!customer) {
    notFound();
  }

  const currency = profile.organisation.currency;
  const isStaff = profile.role === "staff";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/customers"
            className="text-caption text-ink-muted underline underline-offset-2"
          >
            Customers
          </Link>
          <h1 className="mt-2 font-display text-display text-ink">
            {customer.fullName}
          </h1>
        </div>

        <LinkButton href={`/customers/${customer.id}/edit`}>Edit</LinkButton>
      </div>

      <Card title="Details">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Phone" value={customer.phone ?? "Not given"} />
          <Fact label="Email" value={customer.email ?? "Not given"} />
          <Fact label="Address" value={customer.address ?? "Not given"} />
          <div>
            <p className="text-label text-ink-muted">
              {isStaff ? "Spend with you" : "Lifetime spend"}
            </p>
            <p className="numeric mt-1 text-title text-ink">
              {<Money amount={customer.lifetimeSpend} currency={currency} />}
            </p>
            {/* FR-5.2 calls this lifetime spend, and for an owner it is. For a
                staff member 0008 hides colleagues sales, so the honest label
                is a narrower one rather than a total that is quietly short. */}
            <p className="mt-1 text-caption text-ink-muted">
              {isStaff
                ? "From the sales you recorded."
                : `${customer.saleCount} completed ${
                    customer.saleCount === 1 ? "purchase" : "purchases"
                  }.`}
            </p>
          </div>
        </div>
      </Card>

      <div>
        <h2 className="mb-4 text-title text-ink">Purchase history</h2>

        <Table>
          <THead>
            <Th>Reference</Th>
            <Th>When</Th>
            <Th>Status</Th>
            <Th numeric>Total</Th>
          </THead>
          <TBody>
            {customer.purchases.length === 0 ? (
              <TableEmpty colSpan={4}>
                <EmptyState
                  icon={<Receipt size={18} strokeWidth={1.5} aria-hidden="true" />}
                  headline="No purchases yet."
                  body="Attach this customer to a sale and it will appear here."
                  actionLabel="Record a sale"
                  actionHref="/sales/new"
                />
              </TableEmpty>
            ) : (
              customer.purchases.map((purchase) => (
                <Tr key={purchase.id}>
                  <Td>
                    <Link
                      href={`/sales/${purchase.id}`}
                      className="numeric text-ink underline-offset-2 hover:underline"
                    >
                      {purchase.reference}
                    </Link>
                  </Td>
                  <Td>{formatDateTime(purchase.soldAt)}</Td>
                  <Td>
                    {/* Voided sales stay in the history. Nothing is deleted,
                        and hiding them would make this list disagree with the
                        spend above for no stated reason. */}
                    <Badge tone={STATUS_TONES[purchase.status] ?? "neutral"}>
                      {purchase.status.charAt(0).toUpperCase() +
                        purchase.status.slice(1)}
                    </Badge>
                  </Td>
                  <Td numeric>{<Money amount={purchase.total} currency={currency} />}</Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
