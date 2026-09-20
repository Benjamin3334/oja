import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listCustomers } from "@/lib/queries/customers";
import { getSignedInProfile } from "@/lib/queries/profile";

import { StartSaleForm } from "./start-sale-form";

export const metadata: Metadata = {
  title: "New sale | Oja",
};

export default async function NewSalePage() {
  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  // Recording a sale is the one write every role can do, including staff.
  // That is the whole point of the till, so there is no role gate here.
  const customers = await listCustomers();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/sales"
          className="text-caption text-ink-muted underline underline-offset-2"
        >
          Sales
        </Link>
        <h1 className="mt-2 font-display text-display text-ink">New sale</h1>
        <p className="mt-1 text-caption text-ink-muted">
          This opens a draft. Nothing leaves your stock until you complete it.
        </p>
      </div>

      <StartSaleForm
        customers={customers.map((customer) => ({
          id: customer.id,
          name: customer.phone
            ? `${customer.fullName} (${customer.phone})`
            : customer.fullName,
        }))}
      />
    </div>
  );
}
