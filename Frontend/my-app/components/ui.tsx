import type { ReactNode, InputHTMLAttributes, SVGProps } from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ icons */

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

export const Icon = {
  Logo: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
    </svg>
  ),
  Sheet: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M4 4h16v16H4z" />
      <path d="M4 10h16M4 15h16M10 4v16" />
    </svg>
  ),
  Shirt: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M9 3 4 5.5 6 10l2-1v11h8V9l2 1 2-4.5L15 3a3 3 0 0 1-6 0Z" />
    </svg>
  ),
  Pattern: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M3 7h18M3 12h18M3 17h18" />
      <path d="M7 3v18M17 3v18" opacity=".45" />
    </svg>
  ),
  Type: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M4 6V4h16v2M9 20h6M12 4v16" />
    </svg>
  ),
  Ruler: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="m3 15 6-6 6 6-6 6z" />
      <path d="m15 9 6-6" />
      <path d="M6 12l1.5 1.5M9 9l1.5 1.5M12 6l1.5 1.5" opacity=".6" />
    </svg>
  ),
  Layers: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" opacity=".6" />
    </svg>
  ),
  Spark: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M12 3v4M12 17v4M4.9 7.1l2.8 2.8M16.3 14.1l2.8 2.8M3 12h4M17 12h4M4.9 16.9l2.8-2.8M16.3 9.9l2.8-2.8" />
    </svg>
  ),
  Download: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
    </svg>
  ),
  Copy: (p: IconProps) => (
    <svg {...base} {...p}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  ),
  Check: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="m4 12.5 5 5L20 6.5" />
    </svg>
  ),
  Warn: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  Stop: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9h6v6H9z" />
    </svg>
  ),
  Refresh: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  ),
  Arrow: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  Book: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M8 7h7M8 11h7" opacity=".6" />
    </svg>
  ),
  Sun: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  Moon: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  ),
  Upload: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M12 17V5M7 9l5-5 5 5M4 20h16" />
    </svg>
  ),
  Clock: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
};

/* ------------------------------------------------------------- form atoms */

/** Native checkbox (name/value/checked/onChange untouched) with a styled box. */
export function CheckBox({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="relative inline-flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center">
      <input
        type="checkbox"
        {...rest}
        className={cn(
          "peer h-[1.125rem] w-[1.125rem] cursor-pointer appearance-none rounded-[6px] border border-line-strong bg-surface transition-colors",
          "hover:border-brand/60 checked:border-brand checked:bg-brand",
          className
        )}
      />
      <svg
        viewBox="0 0 12 12"
        aria-hidden="true"
        className="pointer-events-none absolute h-3 w-3 text-white opacity-0 transition-opacity peer-checked:opacity-100"
      >
        <path
          d="M2 6.2 4.6 8.8 10 3.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Native radio with a styled dot. */
export function RadioDot({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="relative inline-flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center">
      <input
        type="radio"
        {...rest}
        className={cn(
          "peer h-[1.125rem] w-[1.125rem] cursor-pointer appearance-none rounded-full border border-line-strong bg-surface transition-colors",
          "hover:border-brand/60 checked:border-[5px] checked:border-brand",
          className
        )}
      />
    </span>
  );
}

/** An exact Illustrator layer / column name the user must type character-for-character. */
export function Name({ children }: { children: ReactNode }) {
  return (
    <code className="mx-0.5 rounded-md border border-line bg-surface-3 px-1.5 py-[1px] font-mono text-xs font-semibold text-ink">
      {children}
    </code>
  );
}

/** "Requires: …" strip under an option's description. */
export function Requires({ children }: { children: ReactNode }) {
  return (
    <span className="mt-2 flex gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
      <Icon.Layers className="mt-[1px] h-3.5 w-3.5 shrink-0 text-faint" />
      <span>{children}</span>
    </span>
  );
}

/* ----------------------------------------------------------------- layout */

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface shadow-[var(--shadow-soft)]",
        className
      )}
    >
      {children}
    </div>
  );
}

/** `accent` paints the tile in one of the section hues (used on the landing
 *  page); "plain" keeps the single brand colour, which is what the working
 *  pages use so the form doesn't turn into a rainbow. */
export function SectionHead({
  step,
  title,
  hint,
  icon,
}: {
  step: string;
  title: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent text-white">
        {icon ?? <span className="font-mono text-xs font-bold">{step}</span>}
      </span>
      <div>
        <h3 className="flex items-baseline gap-2 text-base font-bold tracking-tight text-ink">
          <span className="font-mono text-xs font-bold text-faint">{step}</span>
          {title}
        </h3>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- alerts */

type Tone = "warn" | "danger" | "info" | "muted";

const TONES: Record<Tone, { wrap: string; title: string; body: string }> = {
  warn: {
    wrap: "border-warn/40 bg-warn-soft",
    title: "text-warn-ink",
    body: "text-warn-ink/85",
  },
  danger: {
    wrap: "border-danger/40 bg-danger-soft",
    title: "text-danger-ink",
    body: "text-danger-ink/85",
  },
  info: {
    wrap: "border-brand/30 bg-brand-soft",
    title: "text-brand-ink",
    body: "text-brand-ink/85",
  },
  muted: {
    wrap: "border-line bg-surface-2",
    title: "text-ink",
    body: "text-muted",
  },
};

export function Alert({
  tone = "warn",
  title,
  children,
  actions,
}: {
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div
      className={cn(
        "animate-fade-up space-y-3 rounded-xl border p-4 shadow-[var(--shadow-soft)]",
        t.wrap
      )}
    >
      <p className={cn("flex items-start gap-2 text-sm font-semibold", t.title)}>
        {tone === "muted" ? (
          <Icon.Stop className="mt-px h-4 w-4 shrink-0" />
        ) : (
          <Icon.Warn className="mt-px h-4 w-4 shrink-0" />
        )}
        <span>{title}</span>
      </p>
      <div className={cn("space-y-2 text-sm leading-relaxed", t.body)}>{children}</div>
      {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- buttons */

const BTN =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50";

export const btn = {
  primary: cn(
    BTN,
    "bg-brand text-white shadow-[0_6px_18px_-8px_var(--brand)] hover:bg-brand-strong"
  ),
  success: cn(
    BTN,
    "bg-ok text-white shadow-[0_6px_18px_-8px_var(--ok)] hover:brightness-95"
  ),
  danger: cn(BTN, "bg-danger text-white hover:brightness-95"),
  ghost: cn(
    BTN,
    "border border-line-strong bg-surface text-ink hover:border-brand/50 hover:text-brand-ink"
  ),
};
