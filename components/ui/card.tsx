import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}

// Section 8.3: surface, hairline border, no shadow. Elevation is reserved for
// dialogs and popovers.
export function Card({ title, action, children }: CardProps) {
  return (
    <section className="flex flex-col rounded-md border border-hairline bg-surface">
      {title ? (
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-hairline px-6">
          <h2 className="text-title text-ink">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="p-6">{children}</div>
    </section>
  );
}
