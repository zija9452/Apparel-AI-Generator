"use client";

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { Alert, CheckBox, Icon, Name, Panel, cn } from "@/components/ui";

const ALL_COLUMNS = [
  "Size",
  "Sleeve",
  "Front Name",
  "Front Number",
  "Front Logo",
  "Back Name",
  "Back Number",
  "Back Logo",
  "Sleeve Number",
  "Neck Name",
] as const;

const SCENARIOS: Record<
  string,
  { label: string; keep: string[]; note: string }
> = {
  back: {
    label: "Back only (Name + Number)",
    keep: ["Size", "Sleeve", "Back Name", "Back Number"],
    note: "Most common order: plain front, player name and number on the back. Only 4 columns needed, delete the rest.",
  },
  front: {
    label: "Front only",
    keep: ["Size", "Sleeve", "Front Name", "Front Number"],
    note: "Personalization on the front only. The back columns are not needed.",
  },
  fb: {
    label: "Front + Back",
    keep: ["Size", "Sleeve", "Front Name", "Front Number", "Back Name", "Back Number"],
    note: "Front and back can each have their own text, e.g. a small number on the front and a big one on the back.",
  },
  logo: {
    label: "Front + Logo",
    keep: ["Size", "Sleeve", "Front Name", "Front Number", "Front Logo"],
    note: "A sponsor/team logo that changes per row. The cell value must be the exact name of a group inside your uploaded Logo Library (.ai) file. See Section 2.",
  },
  full: {
    label: "Full (Sleeves + Neck too)",
    keep: [...ALL_COLUMNS],
    note: "Keep the template exactly as it is, delete nothing. (Sleeve Number and Neck Name columns will start working after the parser upgrade.)",
  },
};

const SAMPLE_ROWS = [
  ["Large", "Half", "ALI", "7", "Red Logo", "ALI", "07", "", "7", ""],
  ["Large", "Half", "HAMZA", "10", "Red Logo", "HAMZA", "10", "", "10", ""],
  ["Medium", "Full", "RAZA", "23", "White Logo", "RAZA", "23", "", "23", ""],
  ["Medium", "Half", "USMAN", "5", "White Logo", "USMAN", "05", "", "5", ""],
  ["Small", "Half", "BILAL", "11", "", "BILAL", "11", "", "11", ""],
];

// Which cells of the demo matrix the (future) mockup scan would pre-check,
// and which parts have no placeholder in the mockup at all.
const MATRIX_PARTS = [
  { part: "Front", cells: { name: "on", number: "on", logo: "off" } },
  { part: "Back", cells: { name: "on", number: "on", logo: "off" } },
  { part: "Left Sleeve", cells: { name: "missing", number: "on", logo: "missing" } },
  { part: "Right Sleeve", cells: { name: "missing", number: "on", logo: "on" } },
  { part: "Neck", cells: { name: "missing", number: "missing", logo: "missing" } },
] as const;

type CellState = "on" | "off" | "missing";

const SECTIONS = [
  { id: "sheet", n: "01", label: "The sheet" },
  { id: "logos", n: "02", label: "Logo columns" },
  { id: "rules", n: "03", label: "3 rules" },
  { id: "scenarios", n: "04", label: "Order types" },
  { id: "form", n: "05", label: "Checkbox form" },
  { id: "status", n: "06", label: "Today vs later" },
];

function SectionTitle({ n, title, sub }: { n: string; title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="flex items-baseline gap-3 text-lg font-bold tracking-tight text-ink">
        <span className="font-mono text-xs font-bold text-brand">{n}</span>
        {title}
      </h2>
      {sub && <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

export default function OrderGuide() {
  const [scenario, setScenario] = useState<string>("back");
  const [warning, setWarning] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    MATRIX_PARTS.forEach((row) => {
      (Object.keys(row.cells) as Array<keyof typeof row.cells>).forEach((f) => {
        init[`${row.part}-${f}`] = row.cells[f] === "on";
      });
    });
    return init;
  });

  const toggle = (part: string, field: string, state: CellState) => {
    const key = `${part}-${field}`;
    const next = !checks[key];
    setChecks({ ...checks, [key]: next });
    if (state === "missing" && next) {
      setWarning(
        `The mockup's "${part}" group has no ${field.toUpperCase()} text frame, so nothing can print there. Ask the designer to add a placeholder in the mockup first.`
      );
    } else {
      setWarning(null);
    }
  };

  const keep = SCENARIOS[scenario].keep;

  return (
    <div className="min-h-screen">
      <AppHeader
        active="guide"
        actions={
          <a
            href="/Standard_Order_Template.xlsx"
            download
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-[0.875rem] font-bold text-white shadow-[0_8px_20px_-10px_var(--brand)] transition-colors hover:bg-brand-strong"
          >
            <Icon.Download className="h-4 w-4" />
            <span className="hidden sm:inline">Template (.xlsx)</span>
          </a>
        }
      />

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-line bg-aurora">
        <div className="pointer-events-none absolute inset-0 bg-blueprint opacity-60" />
        <div className="relative mx-auto max-w-7xl px-5 py-10 sm:py-14">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-[0.75rem] font-semibold tracking-wide text-muted backdrop-blur">
            <Icon.Book className="h-3.5 w-3.5 text-brand" />
            Documentation
          </span>
          <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight text-ink sm:text-4xl">
            How to fill the <span className="text-gradient">Order Excel</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            One row per piece, one column per print location. Keep the columns you use, delete the
            rest, and the parser does the mapping for you.
          </p>

          <nav className="mt-6 flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface/80 px-3 py-1.5 text-xs font-medium text-ink backdrop-blur transition-colors hover:border-brand/50 hover:text-brand-ink"
              >
                <span className="font-mono text-[0.6875rem] text-faint">{s.n}</span>
                {s.label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-12 px-5 pb-24 pt-10">
        {/* 1. Sheet preview */}
        <section id="sheet" className="scroll-mt-24">
          <SectionTitle
            n="01"
            title="What the Excel file looks like inside"
            sub="The Orders sheet. Row 3 holds the headers, every row after it is one physical piece."
          />
          <Panel className="overflow-hidden">
            <div className="custom-scrollbar overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse font-mono text-xs">
                <tbody>
                  <tr>
                    <td className="w-8 border border-line bg-surface-3 px-2 py-1.5 text-center text-faint">
                      1
                    </td>
                    <td
                      colSpan={10}
                      className="border border-line px-3 py-1.5 font-sans font-bold text-brand"
                    >
                      ABC SPORTS - Team Jersey Order 2026
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-line bg-surface-3 px-2 py-1.5 text-center text-faint">
                      3
                    </td>
                    {ALL_COLUMNS.map((c) => (
                      <td
                        key={c}
                        className="whitespace-nowrap border border-line bg-brand px-3 py-1.5 text-center font-bold text-white"
                      >
                        {c}
                      </td>
                    ))}
                  </tr>
                  {SAMPLE_ROWS.map((row, i) => (
                    <tr key={i} className={i % 2 ? "bg-surface-2" : ""}>
                      <td className="border border-line bg-surface-3 px-2 py-1.5 text-center text-faint">
                        {i + 4}
                      </td>
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className="border border-line px-3 py-1.5 text-center tabular-nums text-ink"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-ok" />
              Size is required, never delete it
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-brand" />
              All other columns optional, delete what you don&apos;t use
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-warn" />
              Number cells are Text format, so &quot;07&quot; keeps its zero
            </span>
          </div>
        </section>

        {/* 2. Logo columns */}
        <section id="logos" className="scroll-mt-24">
          <SectionTitle
            n="02"
            title="Logo columns"
            sub="Optional. Needs the Logo Library file uploaded on the main page."
          />
          <Panel className="space-y-3 p-5">
            <p className="text-sm leading-relaxed text-ink">
              Any <Name>&lt;Part&gt; Logo</Name> column swaps in a specific logo per row. Supported
              names: <Name>Front Logo</Name>, <Name>Back Logo</Name>, <Name>Neck Logo</Name>,{" "}
              <Name>Left Sleeve Logo</Name>, <Name>Right Sleeve Logo</Name> and{" "}
              <Name>Sleeve Logo</Name> (same logo on both sleeves).
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-[0.8125rem] leading-relaxed text-muted">
              <li>
                The cell value is not a color or a file. It is the exact{" "}
                <strong className="text-ink">name</strong> of a logo inside your Logo Library file
                (e.g. <span className="font-mono">Red Logo</span>). Case and spacing don&apos;t
                matter, but the spelling must match.
              </li>
              <li>
                Build the Logo Library as one normal <span className="font-mono">.ai</span> file
                where each logo is its own named Layer or Group. One file can hold every logo
                you&apos;ll ever need.
              </li>
              <li>
                On the upload page, tick{" "}
                <strong className="text-ink">&quot;Logo personalization&quot;</strong> and attach
                that Logo Library file. Leave it unchecked and the Logo columns are simply ignored:
                every part keeps the mockup&apos;s own logo as-is.
              </li>
              <li>
                If a Logo Library file wasn&apos;t uploaded, or a name in Excel doesn&apos;t match
                any group in it, that one part keeps the mockup&apos;s own logo and a warning is
                recorded. It never guesses and never leaves a part blank.
              </li>
            </ol>
          </Panel>
        </section>

        {/* 3. Three rules */}
        <section id="rules" className="scroll-mt-24">
          <SectionTitle n="03" title="Only 3 rules to remember" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                icon: <Icon.Sheet className="h-4 w-4" />,
                title: "One row per piece",
                desc: "10 jerseys = 10 rows. The Size column is required. Sleeve is Half or Full (empty means Half).",
              },
              {
                icon: <Icon.Type className="h-4 w-4" />,
                title: "Column name = print location",
                desc: "“Back Number” prints on the back, “Front Name” prints on the front. The system reads the column name, no other setting needed.",
              },
              {
                icon: <Icon.Layers className="h-4 w-4" />,
                title: "Delete what you don't use",
                desc: "The template has every possible column. For each order keep only the ones you need and delete the rest, see the demo below.",
              },
            ].map((r) => (
              <Panel key={r.title} className="p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  {r.icon}
                </span>
                <p className="mt-3 text-sm font-semibold text-ink">{r.title}</p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{r.desc}</p>
              </Panel>
            ))}
          </div>
        </section>

        {/* 4. Scenario switcher */}
        <section id="scenarios" className="scroll-mt-24">
          <SectionTitle
            n="04"
            title="Pick your order type"
            sub="Tap a type to see exactly which columns to keep and which to delete."
          />
          <Panel className="p-5">
            <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Order scenario">
              {Object.entries(SCENARIOS).map(([key, s]) => (
                <button
                  key={key}
                  onClick={() => setScenario(key)}
                  aria-pressed={scenario === key}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-[0.875rem] font-semibold transition-all",
                    scenario === key
                      ? "border-brand bg-brand text-white shadow-[0_8px_20px_-12px_var(--brand)]"
                      : "border-line bg-surface text-muted hover:border-brand/50 hover:text-brand-ink"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_COLUMNS.map((col) => {
                const kept = keep.includes(col);
                return (
                  <span
                    key={col}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 font-mono text-xs transition-colors",
                      kept
                        ? "border-ok/50 bg-ok-soft text-ok-ink"
                        : "border-danger/40 bg-danger-soft text-danger-ink line-through opacity-80"
                    )}
                  >
                    {col}
                    <span className="ml-1.5 font-sans text-[0.6875rem] no-underline">
                      {kept ? "keep" : "delete"}
                    </span>
                  </span>
                );
              })}
            </div>
            <p className="mt-4 text-[0.8125rem] leading-relaxed text-muted">{SCENARIOS[scenario].note}</p>
          </Panel>
        </section>

        {/* 5. Checkbox form demo */}
        <section id="form" className="scroll-mt-24">
          <SectionTitle
            n="05"
            title="The checkbox form, try it yourself"
            sub="A small step that will live on this website (nothing to do in Excel). When you upload the mockup .ai file, the system scans it and shows this form already ticked. You just confirm it."
          />
          <Panel className="p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink">Where is the personalization?</p>
              <span className="rounded-full border border-ok/50 bg-ok-soft px-2.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wider text-ok-ink">
                Pre-filled from mockup scan
              </span>
              <span className="rounded-full border border-warn/50 bg-warn-soft px-2.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wider text-warn-ink">
                Preview, coming soon
              </span>
            </div>
            <div className="custom-scrollbar overflow-x-auto">
              <table className="w-full max-w-md text-sm">
                <thead>
                  <tr className="text-[0.6875rem] uppercase tracking-wider text-faint">
                    <th className="py-2 text-left font-bold">Part</th>
                    <th className="py-2 font-bold">Name</th>
                    <th className="py-2 font-bold">Number</th>
                    <th className="py-2 font-bold">Logo</th>
                  </tr>
                </thead>
                <tbody>
                  {MATRIX_PARTS.map((row) => (
                    <tr key={row.part} className="border-t border-line">
                      <td className="py-2.5 font-medium text-ink">{row.part}</td>
                      {(["name", "number", "logo"] as const).map((f) => (
                        <td key={f} className="py-2.5 text-center">
                          <CheckBox
                            aria-label={`${row.part} ${f}`}
                            checked={checks[`${row.part}-${f}`]}
                            onChange={() => toggle(row.part, f, row.cells[f])}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {warning && (
              <div className="mt-4">
                <Alert tone="warn" title="That part has no placeholder in the mockup">
                  <p>{warning}</p>
                </Alert>
              </div>
            )}
            <ol className="mt-5 list-decimal space-y-2 pl-5 text-[0.8125rem] leading-relaxed text-muted">
              <li>
                Upload the mockup, the system scans it in about 10 seconds to find NAME / NUMBER /
                LOGO text frames in each part.
              </li>
              <li>
                The form arrives pre-ticked, so for most orders you just press{" "}
                <span className="font-bold text-ok-ink">Confirm</span>.
              </li>
              <li>
                Tick something the mockup doesn&apos;t have (try Neck above) and you get a warning{" "}
                <em>before</em> rendering, not after 20 minutes of Illustrator.
              </li>
            </ol>
          </Panel>
        </section>

        {/* 6. Status */}
        <section id="status" className="scroll-mt-24">
          <SectionTitle n="06" title="What works today vs. later" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Panel className="p-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/50 bg-ok-soft px-2.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wider text-ok-ink">
                <Icon.Check className="h-3 w-3" />
                Works today
              </span>
              <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
                Size, Sleeve, Front Name, Front Number, Back Name, Back Number. This template was
                tested against the real parser: &quot;07&quot; kept its zero and the Colors sheet
                parsed correctly.
              </p>
            </Panel>
            <Panel className="p-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/50 bg-ok-soft px-2.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wider text-ok-ink">
                <Icon.Check className="h-3 w-3" />
                Works with logo library
              </span>
              <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
                Front Logo, Back Logo, Neck Logo, Left/Right Sleeve Logo, Sleeve Logo. See Section
                2. Without the checkbox and the file, these columns are ignored and every part keeps
                the mockup&apos;s own logo.
              </p>
            </Panel>
            <Panel className="p-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/50 bg-warn-soft px-2.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wider text-warn-ink">
                <Icon.Clock className="h-3 w-3" />
                Coming later
              </span>
              <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
                Sleeve Number and Neck Name columns, and the auto-scan checkbox form in Section 5.
                Until then, delete those columns or leave them empty, no harm either way.
              </p>
            </Panel>
          </div>
          <p className="mt-3 text-xs text-faint">
            The Colors sheet is optional (for exact CMYK values). Delete it if not needed.
          </p>
        </section>
      </main>
    </div>
  );
}
