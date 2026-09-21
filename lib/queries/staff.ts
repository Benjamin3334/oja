import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type UserRole = Database["public"]["Enums"]["user_role"];

export interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  joinedAt: string;
}

// Everyone in the caller organisation. profiles_select scopes this to the
// tenant, so no org filter is written here - and since 0016 that policy
// resolves through current_org_id(), which returns null for a deactivated
// caller, so a removed owner cannot read the staff list either.
//
// Inactive members are included on purpose: the whole point of the screen is
// to see who has been removed and to be able to restore them.
export async function listMembers(): Promise<StaffMember[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[queries.listMembers]", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    joinedAt: row.created_at,
  }));
}

// How many active owners the organisation has. The staff screen uses it to
// explain, before a click, why the last owner cannot be demoted or
// deactivated - the rule 0017 enforces in the database.
export async function countActiveOwners(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .eq("is_active", true);

  if (error) {
    console.error("[queries.countActiveOwners]", error.message);
    return 0;
  }

  return count ?? 0;
}
