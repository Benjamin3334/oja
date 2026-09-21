"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

// PRD section 8.3: centred, max 480px, --e-popover, backdrop --ink at 32%,
// 160ms fade and 2px rise.
//
// Built on the native <dialog> element rather than a div with a fixed
// position. showModal() gives focus containment, Escape, inert background
// content and top-layer stacking for free - all of which are easy to get
// subtly wrong by hand, and all of which a keyboard user notices immediately
// when they are missing.
//
// The open animation needs no trigger: a closed dialog is display:none, so the
// animation restarts every time the browser shows it.
export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    // Guarded both ways: calling showModal on an open dialog throws, and
    // close() on a closed one fires a stray close event.
    if (open && !element.open) {
      element.showModal();
    }

    if (!open && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Fires for Escape as well as close(), so the parent's state cannot
      // drift out of step with what the browser is showing.
      onClose={onClose}
      // A click on the backdrop targets the dialog element itself; a click on
      // anything inside targets a descendant.
      onClick={(event) => {
        if (event.target === ref.current) {
          onClose();
        }
      }}
      className={[
        "enter-rise w-[calc(100vw-var(--space-8))] max-w-[var(--dialog-max-w)]",
        "rounded-md border border-hairline bg-surface p-6 text-ink shadow-popover",
        "backdrop:bg-ink/30",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="text-title text-ink">
          {title}
        </h2>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-muted transition-quiet hover:bg-surface-sunk hover:text-ink"
        >
          <X size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4">{children}</div>
    </dialog>
  );
}
