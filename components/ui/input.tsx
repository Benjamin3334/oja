import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

// A real label/for pair, a hint wired with aria-describedby, and an error in a
// live region. Section 8.4: forms use real labels and errors are announced.
// The focus ring comes from the :focus-visible rule in globals.css, so no
// component has to remember it.
export function Input({ id, label, hint, error, className = "", ...props }: InputProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? true : undefined}
        {...props}
        className={[
          "h-[var(--control-h)] rounded-sm border bg-surface px-3 text-body text-ink",
          "placeholder:text-ink-faint disabled:text-ink-faint",
          error ? "border-danger" : "border-hairline",
          className,
        ].join(" ")}
      />
      {hint ? (
        <p id={hintId} className="text-caption text-ink-muted">
          {hint}
        </p>
      ) : null}
      <div aria-live="polite">
        {error ? (
          <p id={errorId} className="text-caption text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
