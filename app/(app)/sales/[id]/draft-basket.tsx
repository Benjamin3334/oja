"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import { completeSale, removeLine, updateLineQuantity } from "@/lib/actions/sales";
import { formatMoney } from "@/lib/format";
import type { SaleLine } from "@/lib/queries/sales";

interface DraftBasketProps {
  saleId: string;
  lines: SaleLine[];
  total: number;
  currency: string;
}

export function DraftBasket({
  saleId,
  lines,
  total,
  currency,
}: DraftBasketProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setMessage(null);

    startTransition(async () => {
      const result = await work();

      if (!result.ok) {
        setMessage(result.error ?? "Something went wrong.");
      }
    });
  }

  // Saving on blur rather than on every keystroke: one write per edit, and no
  // debounce to reason about. Unchanged values are skipped so tabbing through
  // the basket does not write anything.
  function onQuantityBlur(line: SaleLine, raw: string) {
    const next = Number(raw);

    if (!Number.isInteger(next) || next < 1 || next === line.quantity) {
      return;
    }

    run(() => updateLineQuantity(saleId, line.id, next));
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <THead>
          <Th>Product</Th>
          <Th numeric>Price</Th>
          <Th numeric>Quantity</Th>
          <Th numeric>Line total</Th>
          <Th>Remove</Th>
        </THead>
        <TBody>
          {lines.map((line) => (
            <Tr key={line.id}>
              <Td>
                {line.productName}
                <span className="mt-1 block text-caption text-ink-faint">
                  {line.sku}
                </span>
              </Td>
              <Td numeric>{formatMoney(line.unitPrice, currency)}</Td>
              <Td numeric>
                <label className="sr-only" htmlFor={`qty-${line.id}`}>
                  Quantity of {line.productName}
                </label>
                <input
                  id={`qty-${line.id}`}
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={line.quantity}
                  disabled={isPending}
                  onBlur={(event) => onQuantityBlur(line, event.target.value)}
                  className="numeric h-[var(--control-h)] w-20 rounded-sm border border-hairline bg-surface px-2 text-right text-ink"
                />
              </Td>
              <Td numeric>{formatMoney(line.lineTotal, currency)}</Td>
              <Td>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => run(() => removeLine(saleId, line.id))}
                  aria-label={`Remove ${line.productName}`}
                >
                  <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                </Button>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-hairline bg-surface px-6 py-4">
        <div>
          <p className="text-label text-ink-muted">Total</p>
          <p className="numeric mt-1 text-title text-ink">
            {formatMoney(total, currency)}
          </p>
        </div>

        <Button
          type="button"
          variant="primary"
          disabled={isPending || lines.length === 0}
          onClick={() => run(() => completeSale(saleId))}
        >
          {isPending ? "Working" : "Complete sale"}
        </Button>
      </div>

      {/* The oversell refusal lands here. It names the products that are short
          and by how much, because complete_sale raises a uuid the cashier
          cannot act on. */}
      <div aria-live="assertive">
        {message ? (
          <p className="rounded-sm border border-danger bg-surface px-3 py-2 text-body text-danger">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
