"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ActionResult } from "@/lib/actions/auth";

interface CategoryOption {
  id: string;
  name: string;
}

export interface ProductFormValues {
  name: string;
  sku: string;
  categoryId: string;
  unitPrice: string;
  costPrice: string;
  reorderLevel: string;
}

// The shape useActionState expects. Adding a product and editing one differ
// only in which action is passed in, so both screens share this form rather
// than keeping two field lists that would drift apart the first time the
// schema changes.
type ProductFormAction = (
  state: ActionResult | null,
  formData: FormData
) => Promise<ActionResult>;

interface ProductFormProps {
  action: ProductFormAction;
  categories: CategoryOption[];
  submitLabel: string;
  cancelHref: string;
  initial?: ProductFormValues;
}

const BLANK: ProductFormValues = {
  name: "",
  sku: "",
  categoryId: "",
  unitPrice: "",
  costPrice: "",
  reorderLevel: "0",
};

export function ProductForm({
  action,
  categories,
  submitLabel,
  cancelHref,
  initial = BLANK,
}: ProductFormProps) {
  // React 19. The third element is what makes the pending state available
  // without a useState of our own, and it is why the submit button can be
  // disabled during the round trip rather than after it.
  const [state, formAction, isPending] = useActionState(action, null);
  const error = state && !state.ok ? state.error : null;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      {/* One sentence, above the fields, in a live region. The actions return
          the first validation failure rather than a map of field errors, so
          there is one place to look and it is announced when it changes. */}
      <div aria-live="polite">
        {error ? (
          <p className="rounded-sm border border-danger bg-surface px-3 py-2 text-body text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <Input
        id="product-name"
        name="name"
        label="Product name"
        defaultValue={initial.name}
        required
        maxLength={120}
        autoComplete="off"
      />

      <Input
        id="product-sku"
        name="sku"
        label="SKU"
        hint="Your own code for this product. It only has to be unique within your shop."
        defaultValue={initial.sku}
        required
        maxLength={40}
        autoComplete="off"
      />

      <Select
        id="product-category"
        name="categoryId"
        label="Category"
        placeholder="Uncategorised"
        defaultValue={initial.categoryId}
        options={categories.map((category) => ({
          value: category.id,
          label: category.name,
        }))}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id="product-unit-price"
          name="unitPrice"
          label="Selling price"
          type="number"
          step="0.01"
          min="0"
          defaultValue={initial.unitPrice}
          required
        />

        <Input
          id="product-cost-price"
          name="costPrice"
          label="Cost price"
          hint="What you pay for it. Used for profit, and never shown to staff."
          type="number"
          step="0.01"
          min="0"
          defaultValue={initial.costPrice}
          required
        />
      </div>

      <Input
        id="product-reorder-level"
        name="reorderLevel"
        label="Reorder level"
        hint="Stock at or below this number is flagged as low."
        type="number"
        step="1"
        min="0"
        defaultValue={initial.reorderLevel}
        required
      />

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Saving" : submitLabel}
        </Button>

        <Link
          href={cancelHref}
          className="text-label text-ink-muted underline underline-offset-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
