"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions/auth";
import { startSale } from "@/lib/actions/sales";
import { PAYMENT_METHODS } from "@/lib/payment-methods";

interface CustomerOption {
  id: string;
  name: string;
}

interface StartSaleFormProps {
  customers: CustomerOption[];
}

export function StartSaleForm({ customers }: StartSaleFormProps) {
  const [state, formAction, isPending] = useActionState<
    ActionResult | null,
    FormData
  >(startSale, null);

  const error = state && !state.ok ? state.error : null;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div aria-live="polite">
        {error ? (
          <p className="rounded-sm border border-danger bg-surface px-3 py-2 text-body text-danger">
            {error}
          </p>
        ) : null}
      </div>

      {/* FR-4.2: a walk-in has no customer, and that is the common case in a
          shop, so it is the default rather than something to opt into. */}
      <Select
        id="sale-customer"
        name="customerId"
        label="Customer"
        placeholder="Walk-in (no customer)"
        options={customers.map((customer) => ({
          value: customer.id,
          label: customer.name,
        }))}
      />

      <Select
        id="sale-payment"
        name="paymentMethod"
        label="Payment method"
        defaultValue="cash"
        options={PAYMENT_METHODS.map((method) => ({
          value: method,
          label: method.charAt(0).toUpperCase() + method.slice(1),
        }))}
      />

      <Textarea
        id="sale-note"
        name="note"
        label="Note"
        hint="Optional. Anything worth remembering about this sale."
        maxLength={500}
      />

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Starting" : "Start sale"}
        </Button>

        <Link
          href="/sales"
          className="text-label text-ink-muted underline underline-offset-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
