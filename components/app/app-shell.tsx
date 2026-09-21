"use client";

import { PanelLeft } from "lucide-react";

import { OjaMark } from "@/components/app/oja-mark";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

interface AppShellProps {
  // Read from the cookie on the SERVER and passed in, so the first paint is
  // already the right width. See the note on persistence below.
  initialCollapsed: boolean;
  items: NavItem[];
  organisationName: string;
  headerRight: ReactNode;
  children: ReactNode;
}

const COOKIE = "oja-sidebar";
// A year. The preference is not sensitive and there is nothing to expire.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// WHY A COOKIE AND NOT localStorage
//   localStorage is only readable in the browser, so the server would have to
//   render a default width and the client would correct it after hydration -
//   the sidebar would flash open and snap shut on every page load. A cookie
//   travels with the request, so app/(app)/layout.tsx reads it during the
//   render and the first byte of HTML already has the right width. The same
//   reason the theme uses an inline script rather than an effect: anything
//   decided after paint is visible as a flash.
//
//   It is set here with document.cookie rather than through a Server Action.
//   A Server Action would mean a round trip and a re-render to move a
//   sidebar, and this value is presentational - nothing on the server makes a
//   decision with it beyond choosing a class name.
function persist(collapsed: boolean) {
  try {
    document.cookie = `${COOKIE}=${collapsed ? "collapsed" : "expanded"}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    // Cookies disabled. The sidebar still works for this session.
  }
}

export function AppShell({
  initialCollapsed,
  items,
  organisationName,
  headerRight,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Two refs because the control is rendered twice: in the sidebar header
  // from md up, and in the topbar below md where the sidebar is off-canvas
  // and its own button would be off screen. Closing returns focus to the
  // mobile one, since the drawer only exists at that size.
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  const isMobile = useCallback(
    () =>
      typeof window !== "undefined" &&
      !window.matchMedia("(min-width: 768px)").matches,
    []
  );

  const toggle = useCallback(() => {
    if (isMobile()) {
      setDrawerOpen((open) => !open);
      return;
    }

    setCollapsed((current) => {
      const next = !current;
      persist(next);
      return next;
    });
  }, [isMobile]);

  // Ctrl+\, or Cmd+\ on a Mac. The backslash is unshifted on most layouts and
  // is not claimed by the browser, unlike most Ctrl+letter combinations.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "\\" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        toggle();
      }

      if (event.key === "Escape") {
        setDrawerOpen((open) => {
          if (open) {
            mobileToggleRef.current?.focus();
          }
          return false;
        });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  // A route change closes the drawer. Without this, tapping a link on a phone
  // navigates behind a drawer that stays open over the new page.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Focus moves into the drawer when it opens, so the next Tab lands on a nav
  // link rather than continuing from whatever was focused behind it.
  useEffect(() => {
    if (drawerOpen) {
      navRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    }
  }, [drawerOpen]);

  function closeDrawer() {
    setDrawerOpen(false);
    mobileToggleRef.current?.focus();
  }

  const isExpanded = drawerOpen || !collapsed;

  return (
    <div className="flex min-h-full flex-1">
      {/* The backdrop only exists on mobile, and only while the drawer is
          open. Below md the sidebar is fixed and sits above it. */}
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={closeDrawer}
          className="fixed inset-0 z-30 bg-ink/30 md:hidden"
        />
      ) : null}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col overflow-hidden",
          "border-r border-hairline bg-surface",
          "transition-[width,transform] duration-[var(--dur)] ease-[var(--ease)]",
          // Below md the sidebar is off-canvas and slides in at full width.
          drawerOpen ? "translate-x-0" : "-translate-x-full",
          // From md it is part of the layout again and the width carries the
          // state instead of the transform.
          "md:static md:translate-x-0",
          collapsed
            ? "w-[var(--sidebar-w)] md:w-[var(--sidebar-w-rail)]"
            : "w-[var(--sidebar-w)]",
        ].join(" ")}
      >
        {/* The toggle is FIRST and fixed at the left edge, with the wordmark
            after it, so the button occupies the same 32x32 at the same offset
            in both states and never moves under the cursor. */}
        {/* px-3 here and on the nav below, in BOTH states. With a 40px slot
            that puts every icon centre at 12 + 20 = 32px, which is the centre
            of the 64px rail - so nothing moves horizontally when the width
            animates. */}
        <div className="flex h-16 shrink-0 items-center gap-3 px-3">
          <button
            ref={toggleRef}
            type="button"
            onClick={toggle}
            aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={isExpanded}
            aria-controls="main-nav"
            // Hidden below md: at that size the topbar button is the control,
            // and this one would be labelled "Collapse sidebar" inside a
            // drawer that does not collapse.
            className="hidden size-[var(--nav-slot)] shrink-0 items-center justify-center rounded-md text-ink-muted transition-quiet hover:bg-surface-sunk hover:text-ink md:flex"
          >
            <PanelLeft size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>

          {/* The mark and the name fade together as one group, so they
              cannot drift apart mid-transition. The aside clips them as the
              width shrinks; nothing is unmounted and nothing is re-laid-out,
              which is the same rule the nav icons follow. The toggle above is
              outside this span and therefore never moves. */}
          <span
            className={[
              "flex items-center gap-2 whitespace-nowrap",
              "transition-opacity duration-[var(--dur)] ease-[var(--ease)]",
              isExpanded ? "opacity-100" : "opacity-0",
            ].join(" ")}
          >
            {/* Optically centred on the name's x-height rather than its line
                box. At 20px in a 28px line the baseline sits 20px down, the
                x-height band runs from about 10.4px to 20px, so its centre is
                near 15.2px while the line box centre is 14px. The mark is
                nudged down the difference, rounded to 1px. */}
            <span className="shrink-0 translate-y-[1px] overflow-hidden rounded-sm">
              <OjaMark size={20} decorative variant="brand" />
            </span>

            <span className="font-display text-title text-ink">Oja</span>
          </span>
        </div>

        <nav
          id="main-nav"
          ref={navRef}
          aria-label="Main"
          className="flex flex-col gap-1 px-3"
        >
          {items.map((item) => (
            <ShellNavLink
              key={item.href}
              item={item}
              expanded={isExpanded}
              active={
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href)
              }
            />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-hairline px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={mobileToggleRef}
              type="button"
              onClick={toggle}
              aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={drawerOpen}
              aria-controls="main-nav"
              className="flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-muted transition-quiet hover:text-ink md:hidden"
            >
              <PanelLeft size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>

            <span className="truncate text-title text-ink">
              {organisationName}
            </span>
          </div>

          <div className="flex items-center gap-4">{headerRight}</div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

interface ShellNavLinkProps {
  item: NavItem;
  expanded: boolean;
  active: boolean;
}

// Collapsing hides the label visually but never removes it from the DOM, so
// the link keeps its accessible name and stays in the tab order. The tooltip
// is a decorative duplicate of that name, which is why it is aria-hidden - a
// screen reader would otherwise hear the label twice.
function ShellNavLink({ item, expanded, active }: ShellNavLinkProps) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      // NOTHING here changes with state. No justify switch, no padding
      // switch, no width switch. The item is always w-full, so at 64px it is
      // a 40px square around the icon and at 240px it is the full-width pill
      // - the same element, following the sidebar's width.
      className={[
        "group relative flex w-full items-center gap-3 rounded-md transition-quiet",
        active
          ? "bg-accent-soft text-accent"
          : "text-ink-muted hover:bg-surface-sunk hover:text-ink",
      ].join(" ")}
    >
      {/* A fixed square, never flexible, so the icon's position is decided by
          the padding and this width alone. */}
      <span className="flex size-[var(--nav-slot)] shrink-0 items-center justify-center">
        {item.icon}
      </span>

      {/* Stays mounted in both states: unmounting it would reflow the row and
          would take the accessible name with it. The aside clips it with
          overflow-hidden and it fades on opacity only, so the letterforms are
          never compressed and never wrap. */}
      <span
        className={[
          "whitespace-nowrap transition-opacity duration-[var(--dur)] ease-[var(--ease)]",
          expanded ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {item.label}
      </span>

      {/* Absolutely positioned, so it cannot affect the row's layout. Shown on
          hover AND on keyboard focus, and only while collapsed, where the
          label it duplicates is not readable. aria-hidden because that label
          is still in the DOM and would otherwise be announced twice. */}
      {expanded ? null : (
        <span
          aria-hidden="true"
          className={[
            "pointer-events-none absolute left-full z-50 ml-2 hidden rounded-sm border border-hairline",
            "bg-surface px-2 py-1 text-caption text-ink shadow-popover",
            "opacity-0 transition-opacity duration-[var(--dur)] ease-[var(--ease)]",
            "md:block group-hover:opacity-100 group-focus-visible:opacity-100",
          ].join(" ")}
        >
          {item.label}
        </span>
      )}
    </Link>
  );
}
