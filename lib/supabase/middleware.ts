import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

// The sections of the application that require a session. Anything outside
// this list is left to Next to route, which is what lets an unmatched URL
// reach app/not-found.tsx and return a real 404 instead of being redirected to
// the sign-in page with a 307.
//
// This list is NOT the access control. app/(app)/layout.tsx re-checks the
// session and redirects on its own, so a protected route left out of this list
// by mistake is still refused - it just costs a render to find out. The
// middleware is the session refresh plus a courtesy redirect; the layout is
// the gate (PRD section 9.1, principle 3).
const PROTECTED_PREFIXES = [
  "/inventory",
  "/sales",
  "/customers",
  "/reports",
  "/settings",
  "/staff",
  "/onboarding",
  "/deactivated",
];

function requiresSession(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }

  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          // Cache-Control, Expires and Pragma. Without these a CDN may cache a
          // response containing one user's session and serve it to another.
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;

  // Previously this redirected EVERY unauthenticated path that was not
  // /sign-in or /sign-up, which meant a mistyped URL never reached the router:
  // /does-not-exist answered 307 to the sign-in page rather than 404. Scoping
  // the redirect to real sections fixes that without weakening anything,
  // because the layout gate is what actually refuses access.
  //
  // An unknown path UNDER a protected prefix, such as /inventory/nonsense,
  // still redirects when signed out. That is deliberate: a signed-out stranger
  // learns nothing about which routes exist.
  if (!user && requiresSession(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
