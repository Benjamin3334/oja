import type { Metadata } from "next";

import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found · Oja",
};

// At the root of app/, so it catches every unmatched route and renders inside
// the root layout - fonts and tokens loaded, no application shell, because a
// stranger who mistyped a URL has no sidebar to be shown.
//
// Next returns a real HTTP 404 for this file. Redirecting to the dashboard
// would return 200 for a page that does not exist, which lies to a crawler,
// loses the address the user was trying to reach, and hides typos in our own
// links during development.
export default function NotFound() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center bg-canvas px-6 py-16">
      <div className="enter-rise flex w-full max-w-[480px] flex-col items-center text-center">
        {/* No logo file exists in public/, so the wordmark is set rather than
            served. Geist at 600 matches the mark used in the app shell. */}
        <span className="font-ui text-title font-semibold text-ink">Oja</span>

        {/* The figure carries the page. Geist 700, tightened and set solid, in
            tabular figures so the three digits sit evenly rather than
            letter-spaced by the font's proportional widths.

            Deliberately NOT SF Pro Display: Apple's licence does not permit
            serving it on the web, so this is the closest honest equivalent
            from a family already loaded. No new font is requested. */}
        <p
          aria-hidden="true"
          className="mt-12 font-ui font-bold tabular-nums leading-none tracking-[-0.04em] text-ink text-[clamp(96px,18vw,160px)]"
        >
          404
        </p>

        <h1 className="mt-8 font-ui text-title font-semibold text-ink">
          This page doesn&rsquo;t exist.
        </h1>

        <p className="mt-3 text-body text-ink-muted">
          The link may be broken, or the page may have moved.
        </p>

        {/* Signed-out visitors are sent from / to /sign-in by the middleware,
            so this needs no branch of its own. */}
        <LinkButton href="/" variant="primary" className="mt-8">
          Back to dashboard
        </LinkButton>
      </div>
    </main>
  );
}
