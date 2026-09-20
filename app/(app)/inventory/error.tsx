"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

interface InventoryErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// An error boundary has to be a Client Component: reset() is a callback, and
// callbacks do not cross the server boundary.
export default function InventoryError({ error, reset }: InventoryErrorProps) {
  useEffect(() => {
    // The message itself is never rendered. In production Next replaces it
    // with a digest precisely so server detail does not reach the browser, and
    // showing it would leak schema names in development for no benefit.
    console.error("[inventory]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-4 rounded-md border border-hairline bg-surface p-6">
      <span className="flex size-8 items-center justify-center rounded-sm bg-surface-sunk text-danger">
        <AlertTriangle size={18} strokeWidth={1.5} aria-hidden="true" />
      </span>

      <div>
        <p className="text-body text-ink">Inventory could not be loaded.</p>
        <p className="mt-1 text-caption text-ink-muted">
          This is usually temporary. Try again, and if it keeps happening the
          reference below will help whoever looks into it.
        </p>
      </div>

      {error.digest ? (
        <p className="numeric text-caption text-ink-faint">
          Reference {error.digest}
        </p>
      ) : null}

      <Button variant="primary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
