"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "oja-theme";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

// System is the default, so the app follows the operating system for anyone who
// never touches this. Choosing light or dark writes data-theme onto <html>,
// which the CSS in globals.css reads; choosing system removes the attribute and
// lets the prefers-color-scheme media query take over again.
function apply(theme: Theme) {
  const root = document.documentElement;

  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

export function ThemeToggle() {
  // Starts as system and is corrected in the effect below. Rendering the stored
  // value directly would mismatch the server-rendered markup, because the
  // server cannot read localStorage - that is a hydration error, not a
  // preference problem.
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        setTheme(stored);
      }
    } catch {
      // Private browsing, or storage blocked. The inline script in the layout
      // already dealt with the visual result; this is only the control state.
    }
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    apply(next);

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies to this page; it just will not be remembered.
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-1 rounded-sm border border-hairline bg-surface p-1"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const isSelected = theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={option.label}
            title={option.label}
            onClick={() => choose(option.value)}
            className={[
              "flex size-8 items-center justify-center rounded-sm transition-quiet",
              isSelected
                ? "bg-accent-soft text-accent"
                : "text-ink-muted hover:bg-surface-sunk hover:text-ink",
            ].join(" ")}
          >
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
