"use client";

import { useActionState } from "react";

import type { ActionResult } from "@/lib/actions/auth";
import { createOrganisation } from "@/lib/actions/organisation";

interface CreateOrganisationFormProps {
  defaultFullName: string;
}

export function CreateOrganisationForm({
  defaultFullName,
}: CreateOrganisationFormProps) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    createOrganisation,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="organisationName" className="text-label text-ink">
          Organisation name
        </label>
        <input
          id="organisationName"
          name="organisationName"
          type="text"
          autoComplete="organization"
          required
          disabled={isPending}
          placeholder="Topfaith Campus Store"
          className="h-[36px] rounded-sm border border-hairline bg-surface px-3 text-body text-ink placeholder:text-ink-faint"
        />
        <p className="text-caption text-ink-muted">
          The shop, school or department this account will run.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fullName" className="text-label text-ink">
          Your full name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          disabled={isPending}
          defaultValue={defaultFullName}
          className="h-[36px] rounded-sm border border-hairline bg-surface px-3 text-body text-ink placeholder:text-ink-faint"
        />
      </div>

      {/* Always present in the DOM. A live region added at the same moment as
          its content is frequently not announced. */}
      <div aria-live="polite">
        {state && !state.ok ? (
          <p className="text-caption text-danger">{state.error}</p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="h-[36px] rounded-sm bg-accent px-4 text-label text-white transition-quiet hover:bg-accent-hover disabled:opacity-60"
      >
        {isPending ? "Creating..." : "Create organisation"}
      </button>
    </form>
  );
}
