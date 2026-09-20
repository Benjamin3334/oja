import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createProduct } from "@/lib/actions/products";
import { listCategories } from "@/lib/queries/categories";
import { canManageInventory, getSignedInProfile } from "@/lib/queries/profile";

import { ProductForm } from "../product-form";

export const metadata: Metadata = {
  title: "Add product | Oja",
};

export default async function NewProductPage() {
  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  // Decision 4: page access is a route-level role check. RLS would refuse the
  // insert anyway, but a staff member who types this URL should land somewhere
  // sensible rather than on a form that cannot succeed.
  if (!canManageInventory(profile.role)) {
    redirect("/inventory");
  }

  const categories = await listCategories();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/inventory"
          className="text-caption text-ink-muted underline underline-offset-2"
        >
          Inventory
        </Link>
        <h1 className="mt-2 font-display text-display text-ink">Add product</h1>
      </div>

      <ProductForm
        action={createProduct}
        categories={categories.map((row) => ({ id: row.id, name: row.name }))}
        submitLabel="Add product"
        cancelHref="/inventory"
      />
    </div>
  );
}
