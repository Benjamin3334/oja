import type { TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Textarea({ id, label, hint, error, className = "", ...props }: TextareaProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label text-ink">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? true : undefined}
        {...props}
        className={[
          "rounded-sm border bg-surface px-3 py-2 text-body text-ink",
          "placeholder:text-ink-faint",
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
