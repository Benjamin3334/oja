interface SkeletonProps {
  className?: string;
}

// Section 5.2 of 02_CLAUDE.md: loading states are skeletons, not spinners.
// Pulse rather than a sweep, so prefers-reduced-motion in globals.css stops it.
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={["animate-pulse rounded-sm bg-surface-sunk", className].join(" ")}
    />
  );
}
