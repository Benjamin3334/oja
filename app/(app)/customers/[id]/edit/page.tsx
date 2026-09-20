import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { updateCustomer } from "@/lib/actions/customers";
import { getCustomer } from "@/lib/queries/customers";
import { getSignedInProfile } from "@/lib/queries/profile";

import { CustomerForm } from "../../customer-form";

export const metadata: Metadata = {
  title: "Edit customer | Oja",
};

interface EditCustomerPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCustomerPage({
  params,
}: EditCustomerPageProps) {
  const { id } = await params;

  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  const customer = await getCustomer(id);

  if (!customer) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/customers/${customer.id}`}
          className="text-caption text-ink-muted underline underline-offset-2"
        >
          {customer.fullName}
        </Link>
        <h1 className="mt-2 font-display text-display text-ink">
          Edit customer
        </h1>
      </div>

      <CustomerForm
        action={updateCustomer.bind(null, customer.id)}
        submitLabel="Save changes"
        cancelHref={`/customers/${customer.id}`}
        initial={{
          fullName: customer.fullName,
          // The database stores null for a field never given; the form needs a
          // string. They are the same absence, expressed differently.
          phone: customer.phone ?? "",
          email: customer.email ?? "",
          address: customer.address ?? "",
        }}
      />
    </div>
  );
}
