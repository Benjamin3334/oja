import { createClient } from "@/lib/supabase/server";

// The signed-in user's profile, with the organisation it belongs to.
//
// TEMPORARY TYPES. 02_CLAUDE.md section 5.4 requires row types to come from
// types/database.types.ts and forbids hand-written row interfaces. That file
// cannot be generated yet: the Supabase project is still empty, because
// supabase/migrations/0001_initial_schema.sql has not been run against it. Generation
// succeeds but returns no tables. Once the schema is applied, run
//
//   npx supabase gen types typescript --project-id <ref> > types/database.types.ts
//
// and replace ProfileRow and the assertion below with the generated types.

export interface CurrentProfile {
  id: string;
  fullName: string;
  role: "owner" | "manager" | "staff";
  isActive: boolean;
  organisation: {
    id: string;
    name: string;
    currency: string;
  };
}

// Shape of the row as Postgrest returns it. Note `organisations` is a nested
// OBJECT, not a flat set of columns: selecting through a foreign key nests the
// related row. This is the trap listed in 02_CLAUDE.md section 8.
interface ProfileRow {
  id: string;
  full_name: string;
  role: CurrentProfile["role"];
  is_active: boolean;
  organisations: {
    id: string;
    name: string;
    currency: string;
  } | null;
}

export async function getCurrentProfile(
  userId: string
): Promise<CurrentProfile | null> {
  const supabase = await createClient();

  // Named columns only; no SELECT * (section 5.1).
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, organisations ( id, name, currency )")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // RLS returning no rows is not an error, so reaching here means something
    // genuinely failed. Logged server-side, never surfaced to the user.
    console.error("[queries.getCurrentProfile]", error.message);
    return null;
  }

  // The assertion exists only because the generated types are unavailable; it
  // disappears with the comment at the top of this file.
  const row = data as ProfileRow | null;

  // No row means the auth user has no profile yet, which is the state a brand
  // new sign-up is in until onboarding creates one. Not an error.
  if (!row || !row.organisations) {
    return null;
  }

  return {
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
    organisation: {
      id: row.organisations.id,
      name: row.organisations.name,
      currency: row.organisations.currency,
    },
  };
}
