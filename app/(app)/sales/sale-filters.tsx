"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { PAYMENT_METHODS } from "@/lib/payment-methods";

interface SaleFiltersProps {
  status: string;
  paymentMethod: string;
  from: string;
  to: string;
}

type FilterPatch = Partial<Record<keyof SaleFiltersProps, string>>;

const STATUSES = ["draft", "completed", "void"] as const;

// Same approach as the inventory filters: the state lives in the URL so a
// filtered view can be shared and reloaded, and the page stays a Server
// Component that reads its own search params.
export function SaleFilters({
  status,
  paymentMethod,
  from,
  to,
}: SaleFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function apply(patch: FilterPatch) {
    const next = new URLSearchParams();
    const values = { status, paymentMethod, from, to, ...patch };

    if (values.status) next.set("status", values.status);
    if (values.paymentMethod) next.set("payment", values.paymentMethod);
    if (values.from) next.set("from", values.from);
    if (values.to) next.set("to", values.to);

    const query = next.toString();

    startTransition(() => {
      router.replace(query ? `/sales?${query}` : "/sales");
    });
  }

  const selectClasses =
    "h-[var(--control-h)] rounded-sm border border-hairline bg-surface px-3 text-body text-ink";

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="sales-status" className="text-label text-ink">
          Status
        </label>
        <select
          id="sales-status"
          value={status}
          onChange={(event) => apply({ status: event.target.value })}
          className={selectClasses}
        >
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sales-payment" className="text-label text-ink">
          Payment
        </label>
        <select
          id="sales-payment"
          value={paymentMethod}
          onChange={(event) => apply({ paymentMethod: event.target.value })}
          className={selectClasses}
        >
          <option value="">Any method</option>
          {PAYMENT_METHODS.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sales-from" className="text-label text-ink">
          From
        </label>
        <input
          id="sales-from"
          type="date"
          value={from}
          onChange={(event) => apply({ from: event.target.value })}
          className={selectClasses}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sales-to" className="text-label text-ink">
          To
        </label>
        <input
          id="sales-to"
          type="date"
          value={to}
          onChange={(event) => apply({ to: event.target.value })}
          className={selectClasses}
        />
      </div>

      <span aria-live="polite" className="text-caption text-ink-muted">
        {isPending ? "Updating results" : ""}
      </span>
    </div>
  );
}
