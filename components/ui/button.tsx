import type { ButtonHTMLAttributes } from "react";

// PRD section 8.3. One primary action per screen; destructive is a text button
// everywhere except inside a confirmation dialog.
type ButtonVariant = "primary" | "secondary" | "destructive";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "bg-surface text-ink border border-hairline hover:bg-surface-sunk",
  destructive: "bg-surface text-danger border border-hairline hover:bg-surface-sunk",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={[
        "inline-flex h-[var(--control-h)] items-center justify-center rounded-sm px-4",
        "text-label transition-quiet disabled:opacity-60",
        VARIANT_CLASSES[variant],
        className,
      ].join(" ")}
    />
  );
}
