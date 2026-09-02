import Link from "next/link";
import type { ReactNode } from "react";
import ThemeToggle from "./ThemeToggle";
import { Icon, cn } from "./ui";

const NAV = [
  { href: "/", label: "Orchestrator", key: "app" },
  { href: "/home", label: "Home", key: "home" },
  { href: "/docs", label: "Docs", key: "docs" },
  { href: "/order-guide", label: "Order Guide", key: "guide" },
];

export default function AppHeader({
  active,
  actions,
}: {
  active: "home" | "app" | "guide" | "docs";
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
        <Link href="/" className="group flex items-center gap-3">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-brand to-accent text-white shadow-[0_8px_20px_-10px_var(--brand)]">
            <Icon.Logo className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-bold tracking-tight text-ink">
              <span className="text-gradient">JnS</span> Apparel 
            </span>
            <span className="block text-xs font-medium tracking-wide text-faint">
              Excel + Mockup + Pattern → print-ready files
            </span>
          </span>
        </Link>

        <nav className="order-3 flex items-center gap-1 rounded-xl border border-line bg-surface-2 p-1 sm:order-0 sm:ml-4">
          {NAV.map((n) => (
            <Link
              key={n.key}
              href={n.href}
              aria-current={active === n.key ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                active === n.key
                  ? "bg-surface text-ink shadow-(--shadow-soft)"
                  : "text-muted hover:text-ink"
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {actions}
          <span className="hidden items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted lg:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            v1.0
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
