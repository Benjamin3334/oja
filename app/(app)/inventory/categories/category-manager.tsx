"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCategory,
  deleteCategory,
  renameCategory,
} from "@/lib/actions/categories";

interface CategoryRow {
  id: string;
  name: string;
  productCount: number;
}

interface CategoryManagerProps {
  categories: CategoryRow[];
}

// Server Actions can be imported and called directly from a Client Component,
// which is why there is no API route here and no fetch. The transition is what
// keeps the list on screen while the server revalidates it.
export function CategoryManager({ categories }: CategoryManagerProps) {
  const [createState, createAction, isCreating] = useActionState(
    createCategory,
    null
  );
  const createFormRef = useRef<HTMLFormElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (createState?.ok) {
      createFormRef.current?.reset();
    }
  }, [createState]);

  const createError =
    createState && !createState.ok ? createState.error : null;

  function rename(categoryId: string, formData: FormData) {
    setRowError(null);

    startTransition(async () => {
      const result = await renameCategory(categoryId, null, formData);

      if (result.ok) {
        setEditingId(null);
      } else {
        setRowError(result.error);
      }
    });
  }

  function remove(categoryId: string) {
    setRowError(null);

    startTransition(async () => {
      const result = await deleteCategory(categoryId);

      if (!result.ok) {
        setRowError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        ref={createFormRef}
        action={createAction}
        className="flex max-w-xl flex-col gap-4"
      >
        <Input
          id="new-category"
          name="name"
          label="New category"
          placeholder="Drinks"
          error={createError ?? undefined}
          required
          maxLength={120}
          autoComplete="off"
        />

        <div>
          <Button type="submit" variant="primary" disabled={isCreating}>
            {isCreating ? "Adding" : "Add category"}
          </Button>
        </div>
      </form>

      <div aria-live="polite">
        {rowError ? (
          <p className="rounded-sm border border-danger bg-surface px-3 py-2 text-body text-danger">
            {rowError}
          </p>
        ) : null}
      </div>

      <ul className="divide-y divide-hairline rounded-md border border-hairline bg-surface">
        {categories.length === 0 ? (
          <li className="px-4 py-6 text-body text-ink-muted">
            No categories yet. Products without one are shown as Uncategorised.
          </li>
        ) : (
          categories.map((category) => (
            <li
              key={category.id}
              className="flex flex-wrap items-center justify-between gap-4 px-4 py-3"
            >
              {editingId === category.id ? (
                <form
                  action={(formData) => rename(category.id, formData)}
                  className="flex flex-1 flex-wrap items-end gap-2"
                >
                  <Input
                    id={`rename-${category.id}`}
                    name="name"
                    label="Name"
                    defaultValue={category.name}
                    required
                    maxLength={120}
                    autoComplete="off"
                  />
                  <Button type="submit" variant="primary" disabled={isPending}>
                    Save
                  </Button>
                  <Button type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <div className="min-w-0">
                    <p className="text-body text-ink">{category.name}</p>
                    <p className="text-caption text-ink-muted">
                      {category.productCount === 1
                        ? "1 product"
                        : `${category.productCount} products`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        setRowError(null);
                        setEditingId(category.id);
                      }}
                    >
                      Rename
                    </Button>

                    {/* Deleting a category that still has products is refused
                        by the database, so the button is disabled here to say
                        so before the attempt rather than after it. */}
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isPending || category.productCount > 0}
                      onClick={() => remove(category.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
