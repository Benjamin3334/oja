import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { getSignedInProfile } from "@/lib/queries/profile";
import { countActiveOwners, listMembers } from "@/lib/queries/staff";

import { MemberRow } from "./member-row";

export const metadata: Metadata = {
  title: "Staff | Oja",
};

export default async function StaffPage() {
  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  // Section 9.2: managing staff and roles is the one capability an owner holds
  // alone. 0017 refuses a non-owner inside the database as well; this is the
  // half that stops a manager reaching a page full of controls that would all
  // fail.
  if (profile.role !== "owner") {
    redirect("/");
  }

  const [members, activeOwners] = await Promise.all([
    listMembers(),
    countActiveOwners(),
  ]);

  const isLastActiveOwner = activeOwners <= 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-display text-ink">Staff</h1>
        <p className="mt-1 text-caption text-ink-muted">
          Only an owner can change roles or remove access. Deactivating someone
          keeps everything they recorded; it removes what they can do next.
        </p>
      </div>

      {isLastActiveOwner ? (
        <p className="rounded-sm border border-hairline bg-surface-sunk px-3 py-2 text-caption text-ink-muted">
          You are the only active owner, so your own role and access are locked.
          Promote someone else to owner first if you need to change them.
        </p>
      ) : null}

      <Table>
        <THead>
          <Th>Member</Th>
          <Th>Role</Th>
          <Th>Status</Th>
          <Th>Access</Th>
        </THead>
        <TBody>
          {members.length === 0 ? (
            <Tr>
              <Td>No members yet.</Td>
              <Td>{null}</Td>
              <Td>{null}</Td>
              <Td>{null}</Td>
            </Tr>
          ) : (
            members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                viewerId={profile.id}
                isLastActiveOwner={isLastActiveOwner}
              />
            ))
          )}
        </TBody>
      </Table>

      <p className="text-caption text-ink-muted">
        Members are added by signing up and being invited to this organisation.
        The earliest member is listed first
        {members.length > 0
          ? `, joined ${formatDateTime(members[0].joinedAt)}.`
          : "."}
      </p>
    </div>
  );
}
