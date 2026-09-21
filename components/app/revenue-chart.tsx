"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { formatMoney } from "@/lib/format";
import type { RevenueDay } from "@/lib/queries/dashboard";

interface RevenueChartProps {
  days: RevenueDay[];
  total: number;
  trendPercent: number | null;
  currency: string;
}

// Hand-built SVG rather than a charting library. One chart does not justify
// roughly 100 kB of dependency, and drawing it directly is what lets every
// colour be a token - a library arrives with its own palette and defaults to
// fight. The data is computed on the server; this is a client component only
// because the tooltip needs hover state.

const SLOT = 40;
const BAR_W = 24;
const CHART_H = 132;
const PLOT_H = 112;
const RADIUS = 4;
// A zero day still draws a 2px stub, so the baseline reads as a continuous
// row of days rather than a gap where the chart looks broken.
const STUB_H = 2;

// A rect with only its top corners rounded. rx would round all four, which
// makes a bar look detached from its baseline.
function topRoundedPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(RADIUS, h);

  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

export function RevenueChart({
  days,
  total,
  trendPercent,
  currency,
}: RevenueChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const width = days.length * SLOT;
  const max = Math.max(...days.map((day) => day.revenue), 0);
  const isUp = trendPercent !== null && trendPercent >= 0;

  const trendLabel =
    trendPercent === null
      ? null
      : `${isUp ? "+" : ""}${trendPercent.toFixed(1)}%`;

  const summary =
    trendLabel === null
      ? `Revenue for the last ${days.length} days, ${formatMoney(total, currency)} in total.`
      : `Revenue for the last ${days.length} days, ${formatMoney(total, currency)} in total, ${trendLabel} against the previous week.`;

  return (
    <section className="flex flex-col rounded-md border border-hairline bg-surface">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-4 border-b border-hairline px-6 py-3">
        <h2 className="text-title text-ink">Revenue, last 14 days</h2>

        <div className="flex items-center gap-3">
          <span className="numeric text-title text-ink">
            <Money amount={total} currency={currency} />
          </span>

          {/* Hidden when the previous week was zero: a percentage change from
              nothing is not a number anyone can act on. The arrow and the sign
              carry the meaning as well as the colour (section 8.4). */}
          {trendLabel === null ? null : (
            <Badge tone={isUp ? "positive" : "danger"}>
              <span className="inline-flex items-center gap-1">
                {isUp ? (
                  <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <ArrowDownRight size={14} strokeWidth={1.5} aria-hidden="true" />
                )}
                <span className="numeric">{trendLabel}</span>
                <span className="sr-only">against the previous week</span>
              </span>
            </Badge>
          )}
        </div>
      </header>

      <div className="p-6">
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${CHART_H}`}
            width="100%"
            height={CHART_H}
            preserveAspectRatio="none"
            role="img"
            aria-label={summary}
            className="block"
            onMouseLeave={() => setHovered(null)}
          >
            <defs>
              <pattern
                id="revenue-dots"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="1" cy="1" r="1" fill="var(--hairline)" />
              </pattern>
            </defs>

            {/* No axis lines and no gridlines. The dotted field gives the plot
                a floor to sit on without drawing a rule across the card. */}
            <rect
              x="0"
              y="0"
              width={width}
              height={PLOT_H}
              fill="url(#revenue-dots)"
            />

            {days.map((day, index) => {
              const scaled =
                max === 0 ? 0 : Math.round((day.revenue / max) * PLOT_H);
              const height =
                day.revenue === 0 ? STUB_H : Math.max(scaled, RADIUS);
              const x = index * SLOT + (SLOT - BAR_W) / 2;
              const isHovered = hovered === index;

              return (
                <g key={day.date}>
                  <path
                    d={topRoundedPath(x, PLOT_H - height, BAR_W, height)}
                    fill={
                      day.revenue === 0
                        ? "var(--hairline)"
                        : isHovered
                          ? "var(--accent-hover)"
                          : "var(--accent)"
                    }
                    opacity={hovered === null || isHovered ? 1 : 0.55}
                    className="transition-quiet"
                  />

                  {/* A full-height target, so the pointer does not have to
                      find a 2px stub on a quiet day. */}
                  <rect
                    x={index * SLOT}
                    y="0"
                    width={SLOT}
                    height={PLOT_H}
                    fill="transparent"
                    onMouseEnter={() => setHovered(index)}
                  />
                </g>
              );
            })}
          </svg>

          {hovered === null ? null : (
            <div
              // A percentage of the container, because the svg scales to its
              // width and coordinates inside it are not pixels outside it.
              style={{ left: `${((hovered + 0.5) / days.length) * 100}%` }}
              className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-2 rounded-sm border border-hairline bg-surface px-3 py-2 shadow-popover"
            >
              <p className="whitespace-nowrap text-caption text-ink-muted">
                {new Intl.DateTimeFormat("en-NG", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                }).format(new Date(`${days[hovered].date}T00:00:00Z`))}
              </p>
              <p className="numeric whitespace-nowrap text-ink">
                <Money amount={days[hovered].revenue} currency={currency} />
              </p>
            </div>
          )}
        </div>

        <div className="mt-2 flex" aria-hidden="true">
          {days.map((day, index) => (
            <span
              key={day.date}
              className="flex-1 text-center text-caption text-ink-faint"
            >
              {/* Every other label below sm: fourteen do not fit on a phone,
                  and overlapping text is worse than fewer labels. */}
              <span className={index % 2 === 1 ? "hidden sm:inline" : ""}>
                {day.label}
              </span>
            </span>
          ))}
        </div>

        {/* The numbers themselves, for a screen reader. An aria-label can
            summarise but cannot be read value by value. */}
        <table className="sr-only">
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <th scope="row">{day.label}</th>
                <td>{formatMoney(day.revenue, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
