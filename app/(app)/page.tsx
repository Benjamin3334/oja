import { PackageSearch, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { formatMoney } from "@/lib/format";
import { getCurrentProfile } from "@/lib/queries/profile";
import { getTodayFigures } from "@/lib/queries/sales";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard | Oja",
};

interface KpiTileProps {
  label: string;
  value: string;
}

// PRD section 5.2, FR-2.1. Figures are set in JetBrains Mono with tabular
// numerals: section 5.3 of 02_CLAUDE.md puts all money AND quantities in the
// mono face, which takes precedence over the type scale's note that the display
// face covers "KPI figures".
function KpiTile({ label, value }: KpiTileProps) {
  return (
    <div className="rounded-md border border-hairline bg-surface p-6">
      <p className="text-label text-ink-muted">{label}</p>
      <p className="mt-2 font-numeric text-display tabular-nums text-ink">
        {value}
      </p>
    </div>
  );
}

interface PanelProps {
  title: string;
  children: ReactNode;
}

function Panel({ title, children }: PanelProps) {
  return (
    <section className="flex flex-col rounded-md border border-hairline bg-surface">
      <header className="flex h-16 shrink-0 items-center border-b border-hairline px-6">
        <h2 className="text-title text-ink">{title}</h2>
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  headline: string;
  body: string;
  actionLabel: string;
  actionHref: string;
}

// Every list gets a designed empty state that names the next action
// (02_CLAUDE.md section 5.3), not a blank panel.
function EmptyState({
  icon,
  headline,
  body,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start">
      <span className="flex size-8 items-center justify-center rounded-sm bg-surface-sunk text-ink-muted">
        {icon}
      </span>
      <p className="mt-4 text-body text-ink">{headline}</p>
      <p className="mt-1 text-caption text-ink-muted">{body}</p>
      <Link
        href={actionHref}
        className="mt-4 text-label text-accent underline underline-offset-2"
      >
        {actionLabel}
      </Link>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // Re-read rather than threading the profile down from the layout. A layout
  // cannot pass props to a page. Wrapping getCurrentProfile in React's cache()
  // would collapse this into one query per request; deferred until there is
  // real data to fetch.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (typeof userId !== "string") {
    redirect("/sign-in");
  }

  const profile = await getCurrentProfile(userId);

  if (!profile) {
    redirect("/onboarding");
  }

  const currency = profile.organisation.currency;

  // Migration 0008 scopes sales by sold_by, so these figures are this
  // person takings for a staff member and the whole shop for an owner.
  // The caption below says which, rather than letting the number imply.
  const figures = await getTodayFigures();
  const isStaff = profile.role === "staff";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-display text-ink">Dashboard</h1>

      {/* FR-2.1: four KPI tiles. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label={isStaff ? "Your revenue today" : "Revenue today"}
          value={formatMoney(figures.revenue, currency)}
        />
        <KpiTile
          label={isStaff ? "Your sales today" : "Sales today"}
          value={String(figures.saleCount)}
        />
        <KpiTile label="Items sold today" value={String(figures.itemsSold)} />
        <KpiTile label="Low stock" value={String(figures.lowStockCount)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Low stock">
          <EmptyState
            icon={<PackageSearch size={18} strokeWidth={1.5} aria-hidden="true" />}
            headline="Nothing is running low."
            body="There are no products yet, so there is no stock to watch. Add a product and set its reorder level to start tracking."
            actionLabel="Add your first product"
            actionHref="/inventory"
          />
        </Panel>

        <Panel title="Top sellers">
          <EmptyState
            icon={<TrendingUp size={18} strokeWidth={1.5} aria-hidden="true" />}
            headline="No sales recorded yet."
            body="Once you record a sale, the products earning the most over the last 30 days appear here."
            actionLabel="Record your first sale"
            actionHref="/sales"
          />
        </Panel>
      </div>
    </div>
  );
}
