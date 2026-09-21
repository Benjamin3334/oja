"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

interface StaffErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function StaffError({ error, reset }: StaffErrorProps) {
  useEffect(() => {
    console.error("[staff]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-4 rounded-md border border-hairline bg-surface p-6">
      <span className="flex size-8 items-center justify-center rounded-sm bg-surface-sunk text-danger">
        <AlertTriangle size={18} strokeWidth={1.5} aria-hidden="true" />
      </span>

      <div>
        <p className="text-body text-ink">Staff could not be loaded.</p>
        <p className="mt-1 text-caption text-ink-muted">
          No role or access has been changed by this. Try again, and if it
          keeps happening the reference below will help whoever looks into it.
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
