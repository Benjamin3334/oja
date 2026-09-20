"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface NavLinkProps {
  href: string;
  label: string;
  // A already-rendered element, not a component. A component is a function, and
  // functions cannot cross the server/client boundary as props; an element can,
  // because it serialises.
  icon: ReactNode;
}

// The only client component in the shell. It exists solely because marking the
// active item needs usePathname, which is a client hook. Keeping it this small
// leaves the sidebar and the layout around it as Server Components.
export function NavLink({ href, label, icon }: NavLinkProps) {
  const pathname = usePathname();
  const isActive =
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      // Announces the active item to a screen reader, so the state is not
      // carried by colour alone (PRD section 8.4).
      aria-current={isActive ? "page" : undefined}
      className={[
        "flex items-center gap-3 rounded-sm px-3 py-2 text-body transition-quiet",
        isActive
          ? "bg-accent-soft text-accent"
          : "text-ink-muted hover:bg-surface-sunk hover:text-ink",
      ].join(" ")}
    >
      {icon}
      {label}
    </Link>
  );
}
