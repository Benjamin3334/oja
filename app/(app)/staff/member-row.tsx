"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Td, Tr } from "@/components/ui/table";
import { changeMemberRole, setMemberActive } from "@/lib/actions/staff";
import type { StaffMember } from "@/lib/queries/staff";

interface MemberRowProps {
  member: StaffMember;
  // The signed-in owner, so the row can explain why some controls are closed
  // to them rather than simply failing when clicked.
  viewerId: string;
  isLastActiveOwner: boolean;
}

const ROLES = ["owner", "manager", "staff"] as const;

export function MemberRow({
  member,
  viewerId,
  isLastActiveOwner,
}: MemberRowProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isSelf = member.id === viewerId;
  // 0017 refuses both of these in the database. Disabling them here means the
  // user is told before the click instead of after it; the database remains
  // the thing that makes it impossible.
  const cannotDeactivate = isSelf || (member.role === "owner" && isLastActiveOwner);
  const cannotDemote = member.role === "owner" && isLastActiveOwner;

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);

    startTransition(async () => {
      const result = await work();

      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Tr>
      <Td>
        {member.fullName}
        {isSelf ? (
          <span className="ml-2 text-caption text-ink-faint">you</span>
        ) : null}
        <span className="mt-1 block text-caption text-ink-faint">
          {member.email}
        </span>
        {error ? (
          <span
            aria-live="assertive"
            className="mt-1 block text-caption text-danger"
          >
            {error}
          </span>
        ) : null}
      </Td>

      <Td>
        <label className="sr-only" htmlFor={`role-${member.id}`}>
          Role for {member.fullName}
        </label>
        <select
          id={`role-${member.id}`}
          value={member.role}
          disabled={isPending || cannotDemote}
          onChange={(event) =>
            run(() => changeMemberRole(member.id, event.target.value))
          }
          className="h-[var(--control-h)] rounded-sm border border-hairline bg-surface px-3 text-body text-ink disabled:text-ink-faint"
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </option>
          ))}
        </select>
      </Td>

      <Td>
        {member.isActive ? (
          <Badge tone="positive">Active</Badge>
        ) : (
          <Badge tone="neutral">Deactivated</Badge>
        )}
      </Td>

      <Td>
        <Button
          type="button"
          variant={member.isActive ? "destructive" : "secondary"}
          disabled={isPending || (member.isActive && cannotDeactivate)}
          onClick={() => run(() => setMemberActive(member.id, !member.isActive))}
        >
          {member.isActive ? "Deactivate" : "Reactivate"}
        </Button>
      </Td>
    </Tr>
  );
}
