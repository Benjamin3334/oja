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

import { AddMemberDialog } from "./add-member-dialog";
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display text-ink">Staff</h1>
          <p className="mt-1 text-caption text-ink-muted">
            Only an owner can change roles or remove access. Deactivating
            someone keeps everything they recorded; it removes what they can do
            next.
          </p>
        </div>

        {/* The only primary action on the page. Everything else here changes
            an existing member; this is the one that adds one. */}
        <AddMemberDialog />
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

      {/* The old copy said members were "invited", which described a
          mechanism that did not exist - there is no invitation email in this
          MVP. This says what actually happens. */}
      <p className="text-caption text-ink-muted">
        To add someone, they sign up for their own Oja account first, then you
        add the email address they used. Adding does not send them anything.
        The earliest member is listed first
        {members.length > 0
          ? `, joined ${formatDateTime(members[0].joinedAt)}.`
          : "."}
      </p>

      {/* Shown only while the owner is alone, where the table teaches nothing
          and the next step is not obvious from it. */}
      {members.length === 1 ? (
        <p className="rounded-sm border border-hairline bg-surface-sunk px-3 py-2 text-caption text-ink-muted">
          Ask them to sign up, then add the email they used here.
        </p>
      ) : null}
    </div>
  );
}
