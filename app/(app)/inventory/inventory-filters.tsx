"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface CategoryOption {
  id: string;
  name: string;
}

interface InventoryFiltersProps {
  search: string;
  categoryId: string;
  lowStockOnly: boolean;
  includeInactive: boolean;
  categories: CategoryOption[];
}

type FilterPatch = Partial<{
  q: string;
  category: string;
  low: boolean;
  inactive: boolean;
}>;

// The only client component on this screen. The filter state lives in the URL
// rather than in React state, so a filtered view can be bookmarked, shared and
// reloaded, and so the page stays a Server Component that simply reads its own
// search params. This island exists only to write that URL.
export function InventoryFilters({
  search,
  categoryId,
  lowStockOnly,
  includeInactive,
  categories,
}: InventoryFiltersProps) {
  const router = useRouter();
  // Navigation is a transition, so the current results stay on screen and
  // readable while the next set is fetched instead of blanking out.
  const [isPending, startTransition] = useTransition();

  function apply(patch: FilterPatch) {
    const next = new URLSearchParams();
    const q = patch.q ?? search;
    const category = patch.category ?? categoryId;
    const low = patch.low ?? lowStockOnly;
    const inactive = patch.inactive ?? includeInactive;

    // Only non-default values are written, so the common case is a clean /inventory.
    if (q) next.set("q", q);
    if (category) next.set("category", category);
    if (low) next.set("low", "1");
    if (inactive) next.set("inactive", "1");

    const query = next.toString();

    startTransition(() => {
      router.replace(query ? `/inventory?${query}` : "/inventory");
    });
  }

  return (
    <form
      // Enter in the search box navigates. Without an explicit handler the
      // browser would do a full page GET and lose the transition.
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("q");
        apply({ q: typeof value === "string" ? value.trim() : "" });
      }}
      className="flex flex-wrap items-end gap-4"
      role="search"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor="inventory-search" className="text-label text-ink">
          Search
        </label>
        <input
          id="inventory-search"
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Name or SKU"
          className="h-[var(--control-h)] w-64 max-w-full rounded-sm border border-hairline bg-surface px-3 text-body text-ink placeholder:text-ink-faint"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="inventory-category" className="text-label text-ink">
          Category
        </label>
        <select
          id="inventory-category"
          value={categoryId}
          onChange={(event) => apply({ category: event.target.value })}
          className="h-[var(--control-h)] rounded-sm border border-hairline bg-surface px-3 text-body text-ink"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex h-[var(--control-h)] items-center gap-2 text-body text-ink">
        <input
          type="checkbox"
          checked={lowStockOnly}
          onChange={(event) => apply({ low: event.target.checked })}
          className="size-4 accent-[var(--accent)]"
        />
        Low stock only
      </label>

      <label className="flex h-[var(--control-h)] items-center gap-2 text-body text-ink">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(event) => apply({ inactive: event.target.checked })}
          className="size-4 accent-[var(--accent)]"
        />
        Show inactive
      </label>

      {/* Announced rather than shown as a spinner: section 5.2 of 02_CLAUDE.md
          rules out spinners, and a filter change is too quick to justify one. */}
      <span aria-live="polite" className="text-caption text-ink-muted">
        {isPending ? "Updating results" : ""}
      </span>
    </form>
  );
}
