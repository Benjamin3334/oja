"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { RevenueGrain } from "@/lib/queries/reports";

interface ReportControlsProps {
  from: string;
  to: string;
  grain: RevenueGrain;
  csvHref: string;
}

const GRAINS: { value: RevenueGrain; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export function ReportControls({
  from,
  to,
  grain,
  csvHref,
}: ReportControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function apply(patch: Partial<{ from: string; to: string; grain: string }>) {
    const next = new URLSearchParams({ from, to, grain, ...patch });

    startTransition(() => {
      router.replace(`/reports?${next.toString()}`);
    });
  }

  const controlClasses =
    "h-[var(--control-h)] rounded-sm border border-hairline bg-surface px-3 text-body text-ink";

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="report-from" className="text-label text-ink">
          From
        </label>
        <input
          id="report-from"
          type="date"
          value={from}
          max={to}
          onChange={(event) => apply({ from: event.target.value })}
          className={controlClasses}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="report-to" className="text-label text-ink">
          To
        </label>
        <input
          id="report-to"
          type="date"
          value={to}
          min={from}
          onChange={(event) => apply({ to: event.target.value })}
          className={controlClasses}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="report-grain" className="text-label text-ink">
          Group by
        </label>
        <select
          id="report-grain"
          value={grain}
          onChange={(event) => apply({ grain: event.target.value })}
          className={controlClasses}
        >
          {GRAINS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* FR-7.4. A plain link, not a fetch: the browser downloads it because
          the route sets Content-Disposition, so it works with middle-click,
          right-click save, and with JavaScript disabled. */}
      <a
        href={csvHref}
        download
        className="inline-flex h-[var(--control-h)] items-center justify-center rounded-sm border border-hairline bg-surface px-4 text-label text-ink transition-quiet hover:bg-surface-sunk"
      >
        Export CSV
      </a>

      <span aria-live="polite" className="text-caption text-ink-muted">
        {isPending ? "Updating report" : ""}
      </span>
    </div>
  );
}
