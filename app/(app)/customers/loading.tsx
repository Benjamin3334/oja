import { Skeleton } from "@/components/ui/skeleton";

export default function CustomersLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-[var(--control-h)] w-32" />
      </div>

      <div className="rounded-md border border-hairline bg-surface">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex h-[var(--row-h)] items-center gap-4 border-b border-hairline px-4 last:border-b-0"
          >
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
