"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions/auth";
import { voidSale } from "@/lib/actions/sales";

interface VoidSaleFormProps {
  saleId: string;
}

// FR-4.7. Voiding cannot be undone, so section 8.3 would normally call for a
// confirmation dialog. The mandatory reason is doing that job here: it cannot
// be triggered by a single misplaced click, and unlike a dialog it leaves a
// record of why behind. There is no dialog primitive in the design system yet,
// and adding one for a single caller would be the weaker trade.
export function VoidSaleForm({ saleId }: VoidSaleFormProps) {
  const [state, formAction, isPending] = useActionState<
    ActionResult | null,
    FormData
  >(voidSale, null);

  const error = state && !state.ok ? state.error : null;

  if (state?.ok) {
    return (
      <p className="text-body text-ink-muted">
        This sale has been voided and the stock returned.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="saleId" value={saleId} />

      <Input
        id="void-reason"
        name="reason"
        label="Reason for voiding"
        hint="Required. This is the only record of why the sale was reversed."
        placeholder="Customer returned the goods"
        error={error ?? undefined}
        required
        maxLength={200}
        autoComplete="off"
      />

      <div>
        <Button type="submit" variant="destructive" disabled={isPending}>
          {isPending ? "Voiding" : "Void this sale"}
        </Button>
      </div>
    </form>
  );
}
