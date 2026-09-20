import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listCategories } from "@/lib/queries/categories";
import { canManageInventory, getSignedInProfile } from "@/lib/queries/profile";

import { CategoryManager } from "./category-manager";

export const metadata: Metadata = {
  title: "Categories | Oja",
};

export default async function CategoriesPage() {
  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

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
        <h1 className="mt-2 font-display text-display text-ink">Categories</h1>
        <p className="mt-1 text-caption text-ink-muted">
          A category groups products for filtering and reporting. A product does
          not need one.
        </p>
      </div>

      <CategoryManager categories={categories} />
    </div>
  );
}
