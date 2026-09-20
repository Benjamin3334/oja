"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/auth";

interface ProductStatusToggleProps {
  productId: string;
  isActive: boolean;
  // Passed in rather than imported so this component knows nothing about the
  // data layer and can be read on its own.
  action: (productId: string, isActive: boolean) => Promise<ActionResult>;
}

// FR-3.2: a product with sales history is never deleted, only deactivated.
// Deactivating is reversible and loses nothing, so it gets no confirmation
// dialog; section 8.3 reserves those for actions that cannot be undone.
export function ProductStatusToggle({
  productId,
  isActive,
  action,
}: ProductStatusToggleProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);

    startTransition(async () => {
      const result = await action(productId, !isActive);

      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-4">
      <Button
        type="button"
        variant={isActive ? "destructive" : "secondary"}
        onClick={toggle}
        disabled={isPending}
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </Button>

      <span aria-live="polite" className="text-caption text-danger">
        {error}
      </span>
    </div>
  );
}
