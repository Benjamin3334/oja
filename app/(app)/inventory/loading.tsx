import { Skeleton } from "@/components/ui/skeleton";

// Section 5.2 of 02_CLAUDE.md: loading states are skeletons, not spinners. The
// shape mirrors the real page closely enough that nothing jumps when the data
// arrives: same heading height, same filter row, same table rows.
export default function InventoryLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[var(--control-h)] w-32" />
      </div>

      <Skeleton className="h-[var(--control-h)] w-full max-w-2xl" />

      <div className="rounded-md border border-hairline bg-surface">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="flex h-[var(--row-h)] items-center gap-4 border-b border-hairline px-4 last:border-b-0"
          >
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
