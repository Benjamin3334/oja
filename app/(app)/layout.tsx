import {
  BarChart3,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { NavLink } from "@/components/app/nav-link";
import { signOut } from "@/lib/actions/auth";
import { getCurrentProfile } from "@/lib/queries/profile";
import { createClient } from "@/lib/supabase/server";

// 1.5px stroke at 18px, per 02_CLAUDE.md section 2.
const ICON_PROPS = { size: 18, strokeWidth: 1.5, "aria-hidden": true } as const;

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: <LayoutDashboard {...ICON_PROPS} /> },
  { href: "/inventory", label: "Inventory", icon: <Package {...ICON_PROPS} /> },
  { href: "/sales", label: "Sales", icon: <Receipt {...ICON_PROPS} /> },
  { href: "/customers", label: "Customers", icon: <Users {...ICON_PROPS} /> },
  { href: "/reports", label: "Reports", icon: <BarChart3 {...ICON_PROPS} /> },
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
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-full flex-1">
      {/* 240px sidebar, per PRD section 8.3. */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-hairline bg-surface">
        <div className="flex h-16 items-center px-4">
          <span className="font-display text-title text-ink">Oja</span>
        </div>

        <nav aria-label="Main" className="flex flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
            />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-hairline px-6">
          <span className="text-title text-ink">
            {profile.organisation.name}
          </span>

          <div className="flex items-center gap-4">
            <span className="text-caption text-ink-muted">
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
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
