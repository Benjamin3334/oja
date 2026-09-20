import type { ReactNode } from "react";

type BadgeTone = "neutral" | "accent" | "warning" | "positive" | "danger";

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunk text-ink-muted",
  accent: "bg-accent-soft text-accent",
  warning: "bg-surface-sunk text-warning",
  positive: "bg-surface-sunk text-positive",
  danger: "bg-surface-sunk text-danger",
};

// Section 8.4: colour is never the sole carrier of meaning, so a badge always
// contains a word. "Low" plus amber, never amber alone.
export function Badge({ tone = "neutral", children }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-pill px-2 py-1 text-caption",
        TONE_CLASSES[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}
