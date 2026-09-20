"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ActionResult } from "@/lib/actions/auth";
import { addLine } from "@/lib/actions/sales";

interface ProductOption {
  id: string;
  label: string;
}

interface AddLineFormProps {
  saleId: string;
  products: ProductOption[];
}

export function AddLineForm({ saleId, products }: AddLineFormProps) {
  const [state, formAction, isPending] = useActionState<
    ActionResult | null,
    FormData
  >(addLine, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Clearing after a successful add is what makes a second scan feel like a
  // second scan rather than an edit of the first.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  const error = state && !state.ok ? state.error : null;

  if (products.length === 0) {
    return (
      <p className="text-body text-ink-muted">
        There are no active products to sell. Add one in Inventory first.
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-4"
    >
      <input type="hidden" name="saleId" value={saleId} />

      <div className="min-w-64 flex-1">
        <Select
          id="line-product"
          name="productId"
          label="Product"
          placeholder="Choose a product"
          options={products.map((product) => ({
            value: product.id,
            label: product.label,
          }))}
          required
          className="w-full"
        />
      </div>

      <div className="w-32">
        <Input
          id="line-quantity"
          name="quantity"
          label="Quantity"
          type="number"
          step="1"
          min="1"
          defaultValue="1"
          required
          className="w-full"
        />
      </div>

      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Adding" : "Add to sale"}
      </Button>

      <span aria-live="polite" className="text-caption text-danger">
        {error}
      </span>
    </form>
  );
}
