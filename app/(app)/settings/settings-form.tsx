"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ActionResult } from "@/lib/actions/auth";
import { updateOrganisationSettings } from "@/lib/actions/organisation";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";

interface SettingsFormProps {
  name: string;
  currency: string;
}

export function SettingsForm({ name, currency }: SettingsFormProps) {
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
        defaultValue={currency}
        options={SUPPORTED_CURRENCIES.map((option) => ({
          value: option.code,
          label: option.label,
        }))}
        required
      />

      <p className="text-caption text-ink-muted">
        Changing the currency changes how amounts are displayed. It does not
        convert anything: figures already recorded keep their numbers.
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
