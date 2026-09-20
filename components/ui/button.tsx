import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

// PRD section 8.3. One primary action per screen; destructive is a text button
// everywhere except inside a confirmation dialog.
type ButtonVariant = "primary" | "secondary" | "destructive";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "bg-surface text-ink border border-hairline hover:bg-surface-sunk",
  destructive: "bg-surface text-danger border border-hairline hover:bg-surface-sunk",
};

const BASE_CLASSES = [
  "inline-flex h-[var(--control-h)] items-center justify-center rounded-sm px-4",
  "text-label transition-quiet disabled:opacity-60",
].join(" ");

function classesFor(variant: ButtonVariant, className: string): string {
  return [BASE_CLASSES, VARIANT_CLASSES[variant], className].join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonProps) {
  return <button {...props} className={classesFor(variant, className)} />;
}

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
}

// A link wearing a button. It shares the class table above so the two cannot
// drift apart, and it stays an anchor because "Add product" is a navigation:
// rendering it as a button with an onClick would break middle-click, copy
// link address, and the keyboard behaviour a link is expected to have.
export function LinkButton({
  href,
  variant = "secondary",
  className = "",
  ...props
}: LinkButtonProps) {
  return (
    <Link href={href} {...props} className={classesFor(variant, className)} />
  );
}
