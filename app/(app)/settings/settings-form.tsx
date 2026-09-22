"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ActionResult } from "@/lib/actions/auth";
import { updateOrganisationSettings } from "@/lib/actions/organisation";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import type { ExchangeRates } from "@/lib/queries/exchange-rates";

interface SettingsFormProps {
  name: string;
  currency: string;
  // Null when the rate service could not be reached. The form must work
  // either way: a currency is a setting, not a quote.
  rates: ExchangeRates | null;
}

// Enough decimal places to be meaningful in both directions: one naira is a
// very small number of pounds, and one pound is a large number of naira.
function formatRate(value: number): string {
  if (value >= 100) return value.toFixed(0);
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(4);
  return value.toFixed(6);
}

export function SettingsForm({ name, currency, rates }: SettingsFormProps) {
  const [selected, setSelected] = useState(currency);
  const [state, formAction, isPending] = useActionState<
    ActionResult | null,
    FormData
  >(updateOrganisationSettings, null);

  const error = state && !state.ok ? state.error : null;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <Input
        id="organisation-name"
        name="name"
        label="Organisation name"
        hint="Shown in the top bar and on anything you print."
        defaultValue={name}
        required
        maxLength={120}
        autoComplete="organization"
        error={error ?? undefined}
      />

      {/* A list rather than a text field: Intl throws on an unknown currency
          code instead of degrading, and every money figure in the application
          is formatted through it. */}
      <Select
        id="organisation-currency"
        name="currency"
        label="Currency"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        options={SUPPORTED_CURRENCIES.map((option) => ({
          value: option.code,
          label: option.label,
        }))}
        required
      />

      {/* The rate is shown so the scale of the new currency is obvious before
          committing to it - a figure that reads 12,000 in naira reads 9 in
          pounds. It is NOT an offer to convert anything, which is why the
          sentence underneath is blunt about that. */}
      {selected !== currency && rates?.rates[selected] ? (
        <div className="rounded-sm border border-hairline bg-surface-sunk px-3 py-2">
          <p className="numeric text-body text-ink">
            1 {currency} = {formatRate(rates.rates[selected])} {selected}
          </p>
          <p className="mt-1 text-caption text-ink-muted">
            Live mid-market rate{rates.updatedAt ? `, ${rates.updatedAt}` : ""}.
            For reference only.
          </p>
        </div>
      ) : null}

      <p className="text-caption text-ink-muted">
        <strong className="text-ink">Nothing is converted.</strong> Changing the
        currency changes the symbol every amount is displayed with, and nothing
        else. A product priced 12,000 stays the number 12,000 and starts being
        shown as {selected === currency ? "the new currency" : selected}. Prices
        already recorded on past sales never change at all - that is what makes
        an old receipt still true.
      </p>

      <div className="flex items-center gap-4 pt-2">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Saving" : "Save changes"}
        </Button>

        {/* Quiet confirmation in a live region, per section 8.1 - no toast to
            dismiss, and it replaces itself on the next save. */}
        <span aria-live="polite" className="text-caption">
          {state?.ok ? (
            <span className="text-positive">Settings saved.</span>
          ) : null}
        </span>
      </div>
    </form>
  );
}
