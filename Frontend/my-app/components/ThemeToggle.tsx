"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "./ui";

type Theme = "light" | "dark";

/** The theme lives on <html data-theme>, set before first paint by the inline
 *  script in layout.tsx. Reading it through useSyncExternalStore keeps this
 *  component in step with that attribute without copying it into state, so
 *  there is no effect writing state on mount and no hydration mismatch. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

const getSnapshot = (): Theme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

const getServerSnapshot = (): Theme => "light";

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode, the choice just will not persist */
    }
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-brand/50 hover:text-brand"
    >
      {theme === "dark" ? <Icon.Sun className="h-4 w-4" /> : <Icon.Moon className="h-4 w-4" />}
    </button>
  );
}
