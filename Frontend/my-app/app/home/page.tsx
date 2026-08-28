import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { Icon, Panel } from "@/components/ui";

const CHIPS = [
  { icon: <Icon.Ruler className="h-3.5 w-3.5" />, label: "Seam & armhole matching" },
  { icon: <Icon.Type className="h-3.5 w-3.5" />, label: "Name / number / logo personalization" },
  { icon: <Icon.Shirt className="h-3.5 w-3.5" />, label: "Jersey · Full-button · Hoodie" },
  { icon: <Icon.Download className="h-3.5 w-3.5" />, label: "One ZIP, ready to print" },
];

const FEATURES = [
  {
    icon: <Icon.Sheet className="h-4 w-4" />,
    tile: "bg-gradient-to-br from-brand to-accent",
    title: "Reads your order sheet as it is",
    desc: "One row per piece. Column names decide the print location, so Back Number prints on the back. Keep the columns you use and delete the rest.",
  },
  {
    icon: <Icon.Layers className="h-4 w-4" />,
    tile: "bg-gradient-to-br from-brand to-accent",
    title: "Builds every size from the master pattern",
    desc: "Each graded cut piece is duplicated, filled with its design, tagged, laid out on its own artboard and exported at production scale.",
  },
  {
    icon: <Icon.Ruler className="h-4 w-4" />,
    tile: "bg-gradient-to-br from-brand to-accent",
    title: "Lines up designs across seams",
    desc: "Placket, side seam, armhole and hood center matching, each with a simulated sewing overlap so the artwork meets exactly once the piece is sewn.",
  },
  {
    icon: <Icon.Type className="h-4 w-4" />,
    tile: "bg-gradient-to-br from-brand to-accent",
    title: "Personalizes text and logos per row",
    desc: "Names, numbers and per row logos are placed, fitted and color matched to the mockup, including the size tag on every piece.",
  },
  {
    icon: <Icon.Warn className="h-4 w-4" />,
    tile: "bg-gradient-to-br from-brand to-accent",
    title: "Stops before it wastes a run",
    desc: "Missing fonts or missing layer names pause the job up front and tell you exactly what to rename, instead of failing 20 minutes in.",
  },
  {
    icon: <Icon.Download className="h-4 w-4" />,
    tile: "bg-gradient-to-br from-brand to-accent",
    title: "Hands back one print-ready ZIP",
    desc: "Every exported piece, the production plan, the debug log and any warnings that need a human eye, packed in a single download.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Upload data",
    desc: "Order Excel, design mockup and the master pattern.",
    icon: <Icon.Upload className="h-4 w-4" />,
    tile: "bg-gradient-to-br from-brand to-accent",
  },
  {
    step: "02",
    title: "AI analysis",
    desc: "Columns are mapped to the mockup's layers and sizes.",
    icon: <Icon.Spark className="h-4 w-4" />,
    tile: "bg-gradient-to-br from-brand to-accent",
  },
  {
    step: "03",
    title: "Production plan",
    desc: "A machine-readable JSON plan is generated for the run.",
    icon: <Icon.Sheet className="h-4 w-4" />,
    tile: "bg-gradient-to-br from-brand to-accent",
  },
  {
    step: "04",
    title: "Illustrator render",
    desc: "Pieces are built, matched, laid out and exported.",
    icon: <Icon.Layers className="h-4 w-4" />,
    tile: "bg-gradient-to-br from-brand to-accent",
  },
];

const HANDLES = [
  {
    title: "Garment types",
    items: ["Normal jersey", "Full Button Jersey with Patti", "Hoodie with hood, border and pocket"],
  },
  {
    title: "Matching options",
    items: [
      "Center design across the button placket",
      "Front and Back across the side seam",
      "Body and sleeve across the armhole",
      "Hood center across the two hood halves",
    ],
  },
  {
    title: "Personalization",
    items: [
      "Front and Back name and number",
      "Per row logos from a logo library file",
      "LOCAL TAG size letter, 3in adult and 2.5in youth",
    ],
  },
  {
    title: "Safety checks",
    items: [
      "Missing font detection before rendering",
      "Missing layer names pause the job",
      "Warnings listed per part at the end",
    ],
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <AppHeader active="home" />

      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden border-b border-line bg-aurora">
        <div className="pointer-events-none absolute inset-0 bg-blueprint opacity-60" />
        <div className="relative mx-auto max-w-7xl px-5 py-16 sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-[0.75rem] font-semibold tracking-wide text-muted backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse-ring rounded-full bg-brand" />
            Illustrator-native production automation
          </span>

          <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[1.05] tracking-tight text-ink sm:text-6xl">
            From order sheet to{" "}
            <span className="text-gradient">print-ready cut pieces</span>, without touching
            Illustrator.
          </h1>

          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Upload the order Excel, the design mockup and the master pattern. Every size is built,
            personalized, seam-matched and laid out automatically, then handed back as one
            print-ready ZIP.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-accent px-5 py-3 text-sm font-bold text-white shadow-[0_14px_34px_-14px_var(--brand)] transition-all hover:brightness-110 active:scale-[0.99]"
            >
              <Icon.Spark className="h-4 w-4" />
              Start a production job
            </Link>
            <Link
              href="/order-guide"
              className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-5 py-3 text-sm font-bold text-ink transition-colors hover:border-brand/50 hover:text-brand-ink"
            >
              <Icon.Book className="h-4 w-4" />
              Read the order guide
            </Link>
          </div>

          <div className="mt-9 flex flex-wrap gap-2.5">
            {CHIPS.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface/80 px-3 py-1.5 text-xs font-medium text-ink backdrop-blur"
              >
                <span className="text-brand">{c.icon}</span>
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- features */}
      <section className="mx-auto max-w-7xl px-5 py-16">
        <p className="text-[0.75rem] font-bold uppercase tracking-[0.18em] text-faint">
          What the system does
        </p>
        <h2 className="mt-2 max-w-2xl text-2xl font-black tracking-tight text-ink sm:text-3xl">
          The whole run, from spreadsheet to cutting table
        </h2>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Panel
              key={f.title}
              className="p-5 transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${f.tile}`}
              >
                {f.icon}
              </span>
              <h3 className="mt-4 text-[1rem] font-bold tracking-tight text-ink">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{f.desc}</p>
            </Panel>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ flow */}
      <section className="border-y border-line bg-surface-2">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <p className="text-[0.75rem] font-bold uppercase tracking-[0.18em] text-faint">
            How a job runs
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-ink sm:text-3xl">
            Four steps, one download
          </h2>

          <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li
                key={s.step}
                className="relative rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-soft)]"
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl text-white ${s.tile}`}
                >
                  {s.icon}
                </span>
                <p className="mt-4 font-mono text-[0.75rem] font-bold text-faint">{s.step}</p>
                <p className="text-sm font-bold text-ink">{s.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* --------------------------------------------------------- handles */}
      <section className="mx-auto max-w-7xl px-5 py-16">
        <p className="text-[0.75rem] font-bold uppercase tracking-[0.18em] text-faint">
          What it handles
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-ink sm:text-3xl">
          Every option the shop floor actually asks for
        </h2>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {HANDLES.map((h) => (
            <Panel key={h.title} className="overflow-hidden">
              <span className="rule-brand block h-1 w-full" aria-hidden="true" />
              <div className="p-5">
                <h3 className="text-sm font-bold tracking-tight text-ink">{h.title}</h3>
                <ul className="mt-3 space-y-2">
                  {h.items.map((i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted">
                      <Icon.Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------- agent download */}
      {/* Illustrator is a Windows program - it cannot run on the server, so
          the rendering half installs on the designer's own PC. This is where
          they get it. One install per machine, then it starts by itself. */}
      <section className="mx-auto max-w-7xl px-5 pb-16">
        <Panel className="overflow-hidden">
          <div className="grid gap-8 p-8 sm:p-10 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-2xs font-bold uppercase tracking-wider text-faint">
                <Icon.Layers className="h-3.5 w-3.5" />
                One-time setup, per PC
              </span>
              <h2 className="mt-4 text-2xl font-black tracking-tight text-ink sm:text-3xl">
                Install the agent on the PC that has Illustrator
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                The website plans the order, but Illustrator itself runs on your machine — so a
                small agent does the building here. Your pattern and mockup never leave the PC, and
                finished orders land in <code className="font-mono text-xs">C:\Production</code>.
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                Install it once. After that it starts on its own every time you log in, with
                nothing to open and nothing to remember.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <a
                  href="/AIApparelAgent.zip"
                  download
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-accent px-5 py-3 text-sm font-bold text-white shadow-[0_14px_34px_-14px_var(--brand)] transition-all hover:brightness-110"
                >
                  <Icon.Download className="h-4 w-4" />
                  Download the agent
                  <span className="font-mono text-xs font-medium opacity-80">233 KB</span>
                </a>
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-5 py-3 text-sm font-bold text-ink transition-colors hover:border-brand/50 hover:text-brand-ink"
                >
                  <Icon.Book className="h-4 w-4" />
                  Read the handbook
                </Link>
              </div>

              <p className="mt-4 text-xs text-faint">
                Windows, with Adobe Illustrator. Chrome or Edge. Everything else the
                installer sets up on its own.
              </p>
            </div>

            <ol className="space-y-4 lg:col-span-2">
              {[
                {
                  n: "1",
                  t: "Unzip it",
                  d: (
                    <>
                      Anywhere you like — <code className="font-mono text-xs">Downloads</code> is
                      fine.
                    </>
                  ),
                },
                {
                  n: "2",
                  t: "Run the installer",
                  d: (
                    <>
                      Right-click <code className="font-mono text-xs">install-agent.ps1</code> →{" "}
                      <strong>Run with PowerShell</strong>. No admin rights needed.
                    </>
                  ),
                },
                {
                  n: "3",
                  t: "Paste the token",
                  d: <>It prints a pairing token. Paste it into the orchestrator, once.</>,
                },
              ].map((s) => (
                <li key={s.n} className="flex gap-3 rounded-2xl border border-line bg-surface-2 p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-accent text-xs font-black text-white">
                    {s.n}
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-ink">{s.t}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">{s.d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </Panel>
      </section>

      {/* ------------------------------------------------------------- cta */}
      <section className="mx-auto max-w-7xl px-5 pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-aurora p-8 text-center shadow-[var(--shadow-lift)] sm:p-12">
          <div className="pointer-events-none absolute inset-0 bg-blueprint opacity-50" />
          <div className="relative">
            <h2 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              Ready to run an order?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
              Have the order Excel, the mockup and the master pattern ready. The job takes it from
              there and tells you the moment something needs your attention.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-accent px-5 py-3 text-sm font-bold text-white shadow-[0_14px_34px_-14px_var(--brand)] transition-all hover:brightness-110"
              >
                <Icon.Upload className="h-4 w-4" />
                Open the orchestrator
              </Link>
              <a
                href="/Standard_Order_Template.xlsx"
                download
                className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-5 py-3 text-sm font-bold text-ink transition-colors hover:border-brand/50 hover:text-brand-ink"
              >
                <Icon.Download className="h-4 w-4" />
                Download the Excel template
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-faint">
          <span>AI Apparel Production Orchestrator, v1.0</span>
          <span className="flex items-center gap-4">
            <Link href="/" className="hover:text-ink">
              Orchestrator
            </Link>
            <Link href="/order-guide" className="hover:text-ink">
              Order Guide
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
