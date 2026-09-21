"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/auth";
import { getSignedInProfile } from "@/lib/queries/profile";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type UserRole = Database["public"]["Enums"]["user_role"];

const ROLES: UserRole[] = ["owner", "manager", "staff"];

// The functions from 0017 raise their refusals as exceptions with readable
// sentences, because they were written to be read by a person. Passing them
// through mostly unchanged is therefore the honest thing to do - but only for
// the messages we know about. Anything else is a bug and gets a generic line
// with the real text in the server log.
function toUserMessage(rawMessage: string): string {
  const known = [
    "You cannot deactivate your own account",
    "An organisation must keep at least one active owner",
    "Only an owner can change roles",
    "Only an owner can deactivate a member",
    "That member does not belong to your organisation",
    "That member was not found",
    "Your account is not attached to an organisation",
  ];

  const match = known.find((sentence) => rawMessage.includes(sentence));

  if (match) {
    return `${match}.`;
  }

  return "Could not update this member. Please try again.";
}

function isRole(value: string): value is UserRole {
  return (ROLES as string[]).includes(value);
}

// Both actions re-check the caller is an owner before calling the database.
// This is NOT the control - 0017 checks it again inside the function, where it
// cannot be skipped - it is so a non-owner reads a sentence rather than an
// exception, and so the UI and the database agree about who may do what
// (PRD section 9.1, principle 3).
async function requireOwner(): Promise<ActionResult> {
  const profile = await getSignedInProfile();

  if (!profile) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  if (profile.role !== "owner") {
    return { ok: false, error: "Only an owner can manage staff." };
  }

  return { ok: true };
}

export async function changeMemberRole(
  memberId: string,
  role: string
): Promise<ActionResult> {
  if (!isRole(role)) {
    return { ok: false, error: "Choose a valid role." };
  }

  const guard = await requireOwner();

  if (!guard.ok) {
    return guard;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", {
    p_member_id: memberId,
    p_role: role,
  });

  if (error) {
    console.error("[staff.changeMemberRole]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath("/staff");
  return { ok: true };
}

export async function setMemberActive(
  memberId: string,
  isActive: boolean
): Promise<ActionResult> {
  const guard = await requireOwner();

  if (!guard.ok) {
    return guard;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_active", {
    p_member_id: memberId,
    p_active: isActive,
  });

  if (error) {
    console.error("[staff.setMemberActive]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath("/staff");
  return { ok: true };
}
