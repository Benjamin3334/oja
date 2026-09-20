import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { updateProduct } from "@/lib/actions/products";
import { listCategories } from "@/lib/queries/categories";
import { getProduct } from "@/lib/queries/products";
import { canManageInventory, getSignedInProfile } from "@/lib/queries/profile";

import { ProductForm } from "../../product-form";

export const metadata: Metadata = {
  title: "Edit product | Oja",
};

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  const { id } = await params;

  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  if (!canManageInventory(profile.role)) {
    redirect(`/inventory/${id}`);
  }

  const [product, categories] = await Promise.all([
    getProduct(id),
    listCategories(),
  ]);

  // A product in another organisation is invisible to this query because RLS
  // scopes the view, so "not found" and "not yours" are the same answer here
  // on purpose: a 404 tells an attacker nothing about what exists.
  if (!product) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/inventory/${product.id}`}
          className="text-caption text-ink-muted underline underline-offset-2"
        >
          {product.name}
        </Link>
        <h1 className="mt-2 font-display text-display text-ink">Edit product</h1>
      </div>

      <ProductForm
        // Binding the id server-side keeps it out of the form markup, so which
        // product is being written is not something the browser can change.
        action={updateProduct.bind(null, product.id)}
        categories={categories.map((row) => ({ id: row.id, name: row.name }))}
        submitLabel="Save changes"
        cancelHref={`/inventory/${product.id}`}
        initial={{
          name: product.name,
          sku: product.sku,
          categoryId: product.categoryId ?? "",
          unitPrice: product.unitPrice.toFixed(2),
          costPrice: product.costPrice.toFixed(2),
          reorderLevel: String(product.reorderLevel),
        }}
      />
    </div>
  );
}
