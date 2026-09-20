"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions/auth";

type StockAction = (
  state: ActionResult | null,
  formData: FormData
) => Promise<ActionResult>;

interface StockFormProps {
  action: StockAction;
  productId: string;
  // Receiving and adjusting are the same three fields with different meanings,
  // so the wording is passed in rather than the component guessing from a
  // variant flag. The words are the whole difference between them.
  idPrefix: string;
  quantityLabel: string;
  quantityHint: string;
  quantityMin?: number;
  reasonLabel: string;
  reasonPlaceholder: string;
  submitLabel: string;
  successMessage: string;
}

export function StockForm({
  action,
  productId,
  idPrefix,
  quantityLabel,
  quantityHint,
  quantityMin,
  reasonLabel,
  reasonPlaceholder,
  submitLabel,
  successMessage,
}: StockFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Clearing the fields after a successful write is what stops the obvious
  // double submission: a quantity left sitting in the box reads like it has
  // not been recorded yet.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  const error = state && !state.ok ? state.error : null;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="productId" value={productId} />

      <Input
        id={`${idPrefix}-quantity`}
        name="quantity"
        label={quantityLabel}
        hint={quantityHint}
        type="number"
        step="1"
        min={quantityMin}
        required
      />

      <Input
        id={`${idPrefix}-reason`}
        name="reason"
        label={reasonLabel}
        placeholder={reasonPlaceholder}
        required
        maxLength={200}
        autoComplete="off"
      />

      <div className="flex items-center gap-4">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Recording" : submitLabel}
        </Button>

        {/* Section 8.1: confirmation is quiet. A sentence that replaces itself
            in a live region, not a toast that has to be dismissed. */}
        <span aria-live="polite" className="text-caption">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : state?.ok ? (
            <span className="text-positive">{successMessage}</span>
          ) : null}
        </span>
      </div>
    </form>
  );
}
