import Link from "next/link";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  headline: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
}

// 02_CLAUDE.md section 5.3: every list has a designed empty state that names
// the next action. A blank panel is a defect, not a neutral default.
export function EmptyState({
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
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="mt-4 text-label text-accent underline underline-offset-2"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
