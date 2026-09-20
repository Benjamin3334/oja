"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions/auth";

export interface CustomerFormValues {
  fullName: string;
  phone: string;
  email: string;
  address: string;
}

type CustomerFormAction = (
  state: ActionResult | null,
  formData: FormData
) => Promise<ActionResult>;

interface CustomerFormProps {
  action: CustomerFormAction;
  submitLabel: string;
  cancelHref: string;
  initial?: CustomerFormValues;
}

const BLANK: CustomerFormValues = {
  fullName: "",
  phone: "",
  email: "",
  address: "",
};

export function CustomerForm({
  action,
  submitLabel,
  cancelHref,
  initial = BLANK,
}: CustomerFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
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

      <Input
        id="customer-name"
        name="fullName"
        label="Full name"
        defaultValue={initial.fullName}
        required
        maxLength={120}
        autoComplete="name"
      />

      <Input
        id="customer-phone"
        name="phone"
        label="Phone"
        hint="Optional, but it must be unique within your shop if given."
        type="tel"
        defaultValue={initial.phone}
        maxLength={30}
        autoComplete="tel"
      />

      <Input
        id="customer-email"
        name="email"
        label="Email"
        hint="Optional."
        type="email"
        defaultValue={initial.email}
        autoComplete="email"
      />

      <Textarea
        id="customer-address"
        name="address"
        label="Address"
        hint="Optional."
        defaultValue={initial.address}
        maxLength={300}
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
