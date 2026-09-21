"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ActionResult } from "@/lib/actions/auth";
import { addMember } from "@/lib/actions/staff";
import { ADDABLE_ROLES } from "@/lib/roles";

export function AddMemberDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    ActionResult | null,
    FormData
  >(addMember, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Closing on success rather than showing a confirmation inside the dialog:
  // the new row appearing in the table behind it IS the confirmation, and it
  // is the thing the owner came to see.
  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      formRef.current?.reset();
    }
  }, [state]);

  const error = state && !state.ok ? state.error : null;

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        Add member
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Add a member">
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <Input
            id="member-email"
            name="email"
            label="Email address"
            hint="The address they signed up with."
            type="email"
            required
            autoComplete="off"
            error={error ?? undefined}
          />

          {/* Owner is absent on purpose, and 0018 refuses it in the database
              too: an owner who could add a second owner could be demoted by
              them. Promotion is the path for that, and it carries the
              last-owner guard. */}
          <Select
            id="member-role"
            name="role"
            label="Role"
            defaultValue="staff"
            options={ADDABLE_ROLES.map((role) => ({
              value: role.value,
              label: role.label,
            }))}
            required
          />

          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? "Adding" : "Add member"}
            </Button>

            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
