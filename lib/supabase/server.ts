import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server client, for Server Components, Server Actions and Route Handlers.
//
// cookies() is asynchronous from Next.js 15 onwards and must be awaited. The
// synchronous form still works in 15 for backwards compatibility but is
// deprecated, so it is not used here.
//
// A new client is created per request on purpose: the client is essentially a
// configured fetch, and it has to carry THIS request's cookies. Never hoist it
// into a module-level variable.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // Deliberate divergence from the Supabase example, which declares a
        // second `headers` parameter here and then ignores it. Omitting it
        // behaves identically and keeps npm run lint free of an unused-variable
        // warning. Those headers are Cache-Control, Expires and Pragma; a
        // Server Component cannot set response headers anyway, so they are
        // applied in lib/supabase/middleware.ts instead.
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component, which
            // cannot write cookies. Safe to ignore because the middleware
            // refreshes the session on every request instead.
          }
        },
      },
    }
  );
}
