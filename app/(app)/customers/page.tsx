import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LinkButton } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
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
import { listCustomers } from "@/lib/queries/customers";
import { getSignedInProfile } from "@/lib/queries/profile";

export const metadata: Metadata = {
  title: "Customers | Oja",
};

export default async function CustomersPage() {
  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  const customers = await listCustomers();
  const currency = profile.organisation.currency;
  const isStaff = profile.role === "staff";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-display text-ink">Customers</h1>
          {/* The spend column is computed from sales, and 0008 scopes those by
              sold_by. For a staff member it is therefore their own takings
              from this customer, not the customer total. Saying so is the
              difference between an honest number and a wrong one. */}
          <p className="mt-1 text-caption text-ink-muted">
            {isStaff
              ? "Spend shown is from the sales you recorded."
              : "Spend is the total of completed sales."}
          </p>
        </div>

        <LinkButton href="/customers/new" variant="primary">
          Add customer
        </LinkButton>
      </div>

      <Table>
        <THead>
          <Th>Name</Th>
          <Th>Phone</Th>
          <Th numeric>Sales</Th>
          <Th numeric>{isStaff ? "Spend with you" : "Lifetime spend"}</Th>
        </THead>
        <TBody>
          {customers.length === 0 ? (
            <TableEmpty colSpan={4}>
              <EmptyState
                icon={<Users size={18} strokeWidth={1.5} aria-hidden="true" />}
                headline="No customers yet."
                body="A sale does not need one - a walk-in is recorded without a customer. Add someone here when you want their purchase history."
                actionLabel="Add a customer"
                actionHref="/customers/new"
              />
            </TableEmpty>
          ) : (
            customers.map((customer) => (
              <Tr key={customer.id}>
                <Td>
                  <Link
                    href={`/customers/${customer.id}`}
                    className="text-ink underline-offset-2 hover:underline"
                  >
                    {customer.fullName}
                  </Link>
                </Td>
                <Td>{customer.phone ?? "Not given"}</Td>
                <Td numeric>{customer.saleCount}</Td>
                <Td numeric>{<Money amount={customer.lifetimeSpend} currency={currency} />}</Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
