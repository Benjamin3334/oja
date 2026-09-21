import {
  BarChart3,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { signOut } from "@/lib/actions/auth";
import { getCurrentProfile, getOwnProfileRow } from "@/lib/queries/profile";
import { createClient } from "@/lib/supabase/server";

// 1.5px stroke at 18px, per 02_CLAUDE.md section 2.
const ICON_PROPS = { size: 18, strokeWidth: 1.5, "aria-hidden": true } as const;

// Everyone sees these.
const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: <LayoutDashboard {...ICON_PROPS} /> },
  { href: "/inventory", label: "Inventory", icon: <Package {...ICON_PROPS} /> },
  { href: "/sales", label: "Sales", icon: <Receipt {...ICON_PROPS} /> },
  { href: "/customers", label: "Customers", icon: <Users {...ICON_PROPS} /> },
];

// Section 9.2 restricts these two. Hiding a link is a courtesy, not a control:
// /reports redirects a staff member and /staff redirects anyone who is not an
// owner, and 0017 refuses them again inside the database.
const MANAGER_NAV_ITEMS = [
  { href: "/reports", label: "Reports", icon: <BarChart3 {...ICON_PROPS} /> },
];

const OWNER_NAV_ITEMS = [
  { href: "/staff", label: "Staff", icon: <UserCog {...ICON_PROPS} /> },
  { href: "/settings", label: "Settings", icon: <Settings {...ICON_PROPS} /> },
];

interface AppLayoutProps {
  children: ReactNode;
}

export default async function AppLayout({ children }: AppLayoutProps) {
  const supabase = await createClient();

  // Verified here as well as in the middleware. The middleware refreshes the
  // session; this is the authorisation gate, and it re-checks rather than
  // trusting that the request got this far. getClaims verifies the token
  // signature rather than reading the cookie at face value.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (typeof userId !== "string") {
    redirect("/sign-in");
  }

  // A signed-in user with no profile row has no organisation, so there is
  // nothing in this shell they could be shown. Onboarding handles them.
  const profile = await getCurrentProfile(userId);

  if (!profile) {
    // Null means one of two things, and they need different screens. A
    // deactivated member still HAS a profile row - readable through
    // profiles_select_self - but their organisation is hidden, so the join in
    // getCurrentProfile comes back empty. Sending them to onboarding would put
    // them in front of a form that create_organisation_and_profile refuses,
    // because a profile already exists.
    const own = await getOwnProfileRow(userId);

    if (own && !own.isActive) {
      redirect("/deactivated");
    }

    redirect("/onboarding");
  }

  // Read on the server so the first paint is already the right width. A
  // localStorage value would only be readable after hydration, so the sidebar
  // would render open and snap shut - the same flash the theme script exists
  // to prevent.
  const collapsed =
    (await cookies()).get("oja-sidebar")?.value === "collapsed";

  const items = [
    ...NAV_ITEMS,
    ...(profile.role === "staff" ? [] : MANAGER_NAV_ITEMS),
    ...(profile.role === "owner" ? OWNER_NAV_ITEMS : []),
  ];

  return (
    <AppShell
      initialCollapsed={collapsed}
      items={items}
      organisationName={profile.organisation.name}
      headerRight={
        <>
          <ThemeToggle />

          <span className="hidden text-caption text-ink-muted sm:inline">
            {profile.fullName} &middot; {profile.role}
          </span>

          {/* A plain form posting to a Server Action. No client component is
              needed for this, so none is used. */}
          <form action={signOut}>
            <button
              type="submit"
              className="h-[36px] rounded-sm border border-hairline px-3 text-label text-ink transition-quiet hover:bg-surface-sunk"
            >
              Sign out
            </button>
          </form>
        </>
      }
    >
      {children}
    </AppShell>
  );
}
