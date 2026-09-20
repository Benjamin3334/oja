import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

// Browser client, for Client Components only.
//
// This uses the ANON key, never the service_role key. The anon key is designed
// to be public: it reaches the browser, and Row-Level Security is what actually
// protects the data (02_CLAUDE.md section 5.1).
//
// createBrowserClient is already a singleton internally, so calling this
// function repeatedly does not create repeated connections.
export function createClient() {
  return createBrowserClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
}
