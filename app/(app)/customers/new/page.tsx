import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createCustomer } from "@/lib/actions/customers";
import { getSignedInProfile } from "@/lib/queries/profile";

import { CustomerForm } from "../customer-form";

export const metadata: Metadata = {
  title: "Add customer | Oja",
};

export default async function NewCustomerPage() {
  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  // No role gate: customers_all carries no role check, because anyone who can
  // record a sale can record who it was for.
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/customers"
          className="text-caption text-ink-muted underline underline-offset-2"
        >
          Customers
        </Link>
        <h1 className="mt-2 font-display text-display text-ink">Add customer</h1>
      </div>

      <CustomerForm
        action={createCustomer}
        submitLabel="Add customer"
        cancelHref="/customers"
      />
    </div>
  );
}
