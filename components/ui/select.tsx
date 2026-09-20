import type { SelectHTMLAttributes } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
}

export function Select({
  id,
  label,
  options,
  placeholder,
  error,
  className = "",
  ...props
}: SelectProps) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label text-ink">
        {label}
      </label>
      <select
        id={id}
        aria-describedby={errorId}
        aria-invalid={error ? true : undefined}
        {...props}
        className={[
          "h-[var(--control-h)] rounded-sm border bg-surface px-3 text-body text-ink",
          error ? "border-danger" : "border-hairline",
          className,
        ].join(" ")}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
