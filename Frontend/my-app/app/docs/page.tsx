"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { Icon, Name, Panel, cn } from "@/components/ui";

/* ------------------------------------------------------------------ data */

const CHAPTERS = [
  { id: "overview", n: "01", label: "How the system works" },
  { id: "files", n: "02", label: "The files you provide" },
  { id: "excel", n: "03", label: "Order Excel sheet" },
  { id: "mockup", n: "04", label: "Mockup layer template" },
  { id: "pattern", n: "05", label: "Pattern layer template" },
  { id: "options", n: "06", label: "Options reference" },
  { id: "running", n: "07", label: "Running a job" },
  { id: "output", n: "08", label: "What you get back" },
  { id: "trouble", n: "09", label: "Troubleshooting" },
];

const MOCKUP_PARTS: Array<[string, string, string]> = [
  ["Front panel", "Front", "Any job. Also accepts Front View."],
  ["Back panel", "Back", "Any job. Also accepts Back View."],
  ["Neck", "Neck", "Any job. Also accepts Collar or Rib."],
  ["Sleeve", "Short Sleeve / Long Sleeve", "Left Sleeve and Right Sleeve are used when the two sides differ."],
  ["Front halves", "Front Left / Front Right", "Full Button Jersey only."],
  ["Button strip", "Patti", "Full Button Jersey only."],
  ["Rib and cuff", "Rib & Cuff", "Takes the colour the designer drew. Rib Cuff and Cuff also match."],
  ["Placket", "Placket", "Only when the Placket checkbox is ticked."],
  ["Twill tape", "Twill Tape", "Only when the Twill Tape checkbox is ticked."],
  ["Tukdi", "Tukdi", "Only when the Tukdi checkbox is ticked."],
  ["Hood, outer", "Outside Hood", "Hoodie only. Needs Left and Right child groups."],
  ["Hood, inner", "Inside Hood", "Hoodie only. Needs Left and Right child groups."],
  ["Hood border", "Border", "Hoodie only."],
];

const MOCKUP_TEXT: Array<[string, string, string]> = [
  [
    "Garment silhouette",
    "base-path",
    "The single most important name. Every panel design group needs it, drawn at 3pt. The panel takes its fill and its scale from this path.",
  ],
  ["Player name", "NAME", "Any text frame whose name contains NAME. Filled from the Name columns."],
  ["Player number", "NUMBER", "Any text frame whose name contains NUMBER. NUM and # also match."],
  ["Logo slot", "LOGO", "Swapped for the group named in the Logo column of that row."],
  ["Sleeve logos", "LEFT SLEEVE LOGO / RIGHT SLEEVE LOGO", "Used when the two sleeves carry different logos."],
  ["Size tag", "LOCAL TAG group with a SIZE text frame inside", "Only when the LOCAL TAG option is ticked. Both names are required."],
  ["Back label", "Back Label", "Placed automatically when the name exists inside the Back design. No name means no label, nothing else changes."],
  ["Sleeve bottom line", "rib / cuff / box", "Optional. Used by the Match sleeve bottom line option, which tries geometry first."],
];

const MOCKUP_RESERVED: Array<[string, string]> = [
  ["design_clip_group", "The group holding the pasted mockup artwork inside each panel clip."],
  ["TAG-MASK", "The LOCAL TAG clipping path, renamed while the clip is rebuilt."],
  ["MOCK_ prefix", "Every mockup swatch is renamed with this prefix at the start of a job so mockup and pattern swatches cannot collide."],
];

const MOCKUP_MATCH: Array<[string, string, string]> = [
  ["Center design match", "Center", "Same name on Front Left and Front Right."],
  ["Pattern seam match", "Pattern", "Same name on Front Left and Front Right."],
  ["Front and Back stripes", "Match_", "Any name starting with Match_, on both Front Left and Back."],
  [
    "Side seam match",
    "Front side match + Back side match",
    "Or the explicit pairs Front Left side match with Back Right side match, and Front Right side match with Back Left side match.",
  ],
  [
    "Armhole match",
    "armhole match group with unit 1, unit 2 inside",
    "Needed on the Back view and on each sleeve view. Use unit left 1 and unit right 1 where the two sides are separate shapes.",
  ],
  [
    "Side artwork kept on its seam",
    "side, or side left / side right",
    "Front and Back only, and only in the second design scaling mode. Name it, or write the word in the object Note when the name is already taken.",
  ],
  [
    "Shoulder band turned onto the shoulder line",
    "shoulder, or shoulder left / shoulder right",
    "Front and Back only. Always active, and it does nothing unless a piece carries the mark. Name it, or write the word in the object Note when the name is already taken.",
  ],
  [
    "Hood center match",
    "Center inside Outside Hood, in both the Right and the Left half",
    "The Right half copy is the one that is kept.",
  ],
];

const PATTERN_PARTS: Array<[string, string]> = [
  ["Front", "XL Front"],
  ["Back", "XL Back"],
  ["Neck", "XL Neck"],
  ["Front halves, Full Button Jersey", "XL Front Left, XL Front Right"],
  ["Button strip, Full Button Jersey", "XL Patti"],
  ["Sleeve", "XL Short Sleeve, XL Long Sleeve"],
  ["Sleeve when sides differ", "XL Left Sleeve, XL Right Sleeve"],
  ["Rib and cuff", "XL Rib & Cuff"],
  ["Hood, Hoodie", "XL Hood, with Left and Right child groups"],
  ["Pocket, Hoodie", "XL Pocket"],
  ["Border, Hoodie", "XL Border"],
];

const SIZE_WORDS: Array<[string, string, string]> = [
  ["XS", "XS", "XS Front"],
  ["S", "Small", "Small Front"],
  ["M", "Medium", "Medium Front"],
  ["L", "Large", "Large Front"],
  ["XL", "XL", "XL Front"],
  ["XXL or 2XL", "2XL", "2XL Front"],
  ["XXXL or 3XL", "3XL", "3XL Front"],
  ["XXXXL or 4XL", "4XL", "4XL Front"],
  ["YXS, YS, YM, YL, YXL", "The same youth code", "YM Front"],
  ["AXS, AS, AM, AL, AXL, A2XL", "The same code without the A", "AM becomes Medium Front"],
  ["Anything else, for example 5XL", "Used exactly as written", "5XL Front"],
];

const OPTIONS: Array<{ name: string; does: string; needs: ReactNode; missing: string }> = [
  {
    name: "Full Button Jersey",
    does: "Front is built as two separate pieces and a Patti (button strip) is added, sized per size.",
    needs: (
      <>
        Mockup groups <Name>Front Left</Name> and <Name>Front Right</Name>, and pattern pieces{" "}
        <Name>{"{Size} Front Left"}</Name>, <Name>{"{Size} Front Right"}</Name>,{" "}
        <Name>{"{Size} Patti"}</Name>.
      </>
    ),
    missing: "The job runs as a normal jersey with a single front panel.",
  },
  {
    name: "Center design match",
    does: "Joins a design that crosses the button placket seam so it lines up across Front Left and Front Right, using a 2.25in placket overlap.",
    needs: (
      <>
        A group or layer named exactly <Name>Center</Name> in the mockup, same name on both sides.
      </>
    ),
    missing: "The job pauses before rendering and offers Continue without Center Match.",
  },
  {
    name: "Front and Back stripes match",
    does: "Moves the Back stripe artwork so it sits where the Front Left artwork sits.",
    needs: (
      <>
        A shape whose name starts with <Name>Match_</Name>, present on both Front Left and Back.
        Front Left is measured, Back is the one adjusted.
      </>
    ),
    missing: "The job still runs and simply leaves the Back alone.",
  },
  {
    name: "Pattern seam match",
    does: "Shifts the striped or background artwork on the two front halves so it stays continuous across the placket seam.",
    needs: (
      <>
        A group or layer named exactly <Name>Pattern</Name> on both sides. There is no
        size-guessing fallback, so the name has to be exact.
      </>
    ),
    missing: "The job pauses before rendering and offers Continue without Pattern Match.",
  },
  {
    name: "Hoodie",
    does: "Runs the normal Front, Back and Sleeve flow and additionally builds Outside Hood, Inside Hood, Border and Pocket. The neck piece is dropped, since a hoodie has no neckline.",
    needs: (
      <>
        Pattern: <Name>{"{Size} Hood"}</Name> with <Name>Left</Name> and <Name>Right</Name>{" "}
        children, <Name>{"{Size} Pocket"}</Name>, <Name>{"{Size} Border"}</Name>. Mockup:{" "}
        <Name>Outside Hood</Name>, <Name>Inside Hood</Name> (each with Left and Right children) and
        a <Name>Border</Name> design group.
      </>
    ),
    missing: "The job pauses before rendering and offers Continue without Hoodie parts.",
  },
  {
    name: "Hood center design match",
    does: "Lines up a design that crosses the hood center seam across the two halves of the Outside Hood, using a 19mm simulated sewing overlap (14mm sewing plus the 5mm gap).",
    needs: (
      <>
        <Name>Center</Name> inside both the Right and the Left half of the mockup&apos;s{" "}
        <Name>Outside Hood</Name> group. The Right half copy is kept and re-centered.
      </>
    ),
    missing: "The job pauses before rendering. Inside Hood is never matched either way.",
  },
  {
    name: "Armhole side sleeve matching",
    does: "Aligns side panel artwork across the armhole seam so the body and the sleeve meet exactly when sewn. Only the Back panel right side is measured and it is mirrored to the left.",
    needs: (
      <>
        A mockup group named <Name>armhole match</Name> containing <Name>unit 1</Name>,{" "}
        <Name>unit 2</Name> and so on, present on the Back view and on each sleeve view. Use{" "}
        <Name>unit left 1</Name> and <Name>unit right 1</Name> where the two sides are separate
        shapes.
      </>
    ),
    missing: "The job pauses before rendering. Parts that cannot be matched are always rendered normally and listed at the end.",
  },
  {
    name: "Front and Back side seam match",
    does: "Joins a design that crosses the torso side seam so it lines up across Front and Back, using a 14mm simulated sewing overlap.",
    needs: (
      <>
        <Name>Front side match</Name> with <Name>Back side match</Name> for one seam, or the
        explicit pairs <Name>Front Left side match</Name> with <Name>Back Right side match</Name>{" "}
        and <Name>Front Right side match</Name> with <Name>Back Left side match</Name> for both
        seams.
      </>
    ),
    missing: "The job pauses before rendering and offers Continue without Side-Seam Match.",
  },
  {
    name: "LOCAL TAG",
    does: "Personalizes the size letter on the tag and pins the bordered box to a fixed width: 3in for adult sizes and 2.5in for youth sizes.",
    needs: (
      <>
        A mockup group named exactly <Name>LOCAL TAG</Name> with a text frame named{" "}
        <Name>SIZE</Name> inside it.
      </>
    ),
    missing: "The job pauses before rendering. Continuing leaves every tag exactly as drawn in the mockup.",
  },
  {
    name: "Neck contrast text",
    does: "Forces the text, and any label, size or logo shape, on the Neck, Collar and Rib pieces to pure white or pure black, whichever reads against that panel color. It measures the panel fill, so a dark neck gets white text and a light neck gets black.",
    needs: (
      <>
        Nothing extra in the files. The panel color is read from the neck design group&apos;s{" "}
        <Name>base-path</Name>, which every part needs anyway.
      </>
    ),
    missing: "The neck renders exactly as drawn in the mockup and the pattern, with no recoloring at all.",
  },
  {
    name: "Logo personalization",
    does: "Swaps the logo on a part for the artwork named in that row of the Excel sheet.",
    needs: (
      <>
        A Logo Library <Name>.ai</Name> file uploaded with the job, where every logo is its own
        named layer or group. The Excel cell must carry that exact name.
      </>
    ),
    missing: "The Logo columns are ignored and every part keeps the mockup logo. A name that matches nothing is recorded as a warning, never guessed.",
  },
  {
    name: "Match sleeve bottom line to test print",
    does: "Keeps the rib and cuff line at the same distance from the sleeve bottom, and the same height, as the mockup instead of a fixed size.",
    needs: "Nothing extra in the files.",
    missing: "The line scales normally with the rest of the design.",
  },
  {
    name: "Design scaling",
    does: "Decides how the mockup design is fitted onto each pattern panel. The default takes one scale amount from height and applies it to both directions, so the artwork keeps its proportions.",
    needs: (
      <>
        The second mode also moves any Front or Back artwork marked <Name>side</Name> back onto its
        own side seam, either by layer name or by the object Note. The artwork is only moved
        sideways, never stretched.
      </>
    ),
    missing: "Not applicable, one of the two modes is always active.",
  },
  {
    name: "Extra parts",
    does: "Adds Placket, Twill Tape or Tukdi to the plan. These are one shared piece per job, not one per size.",
    needs: (
      <>
        A design group in the mockup and a pattern piece with the same name:{" "}
        <Name>Placket</Name>, <Name>Twill Tape</Name>, <Name>Tukdi</Name>.
      </>
    ),
    missing: "The part is left out of the plan entirely.",
  },
];

const ZIP_FILES: Array<[string, string]> = [
  ["production_ready_order.ai", "The master Illustrator file with every piece laid out on its own artboard at production scale."],
  ["{Size}_{Part}_Item{N}.jpg", "A preview render of each exported piece, for checking before print."],
  ["production_plan.json", "The machine-readable plan the run was built from: sizes, parts, quantities and every text replacement."],
  ["debug_log.txt", "The full run log, including every measurement and every decision the script took."],
  ["sleeve_match_warnings.txt", "Present only when armhole matching had to skip a part."],
  ["back_label_warnings.txt", "Present only when a Back Label fell back to a secondary position."],
  ["hoodie_warnings.txt", "Present only when a hoodie part needed manual attention."],
  ["parm_errors.txt", "Present only when a panel FAILED with Illustrator error 1346458189 ('PARM') and was still broken after three full rebuilds. Lists the size, panel and step - those panels are incomplete and must be finished by hand."],
];

const TROUBLE: Array<[string, string]> = [
  [
    "Rib and cuff printed in the wrong colour",
    "The mockup has no Rib & Cuff group, so the piece kept the stock fill from the pattern file. Add the group and re-run.",
  ],
  [
    "A design did not line up across a seam",
    "The matching layer name did not match exactly. Names are read with spacing and capitals ignored, but the words themselves have to be right. Check the name against the option in chapter 6.",
  ],
  [
    "Fonts look wrong in the output",
    "The job warned that a font was missing and it was continued anyway, so Illustrator substituted a default. Install the font on this PC, or upload it with the job, then run again.",
  ],
  [
    "A size printed nothing",
    "The pattern file has no group for that size, for example the Excel says Large but the pattern says L only on some pieces. Size words and their short forms are treated as the same, but the piece name after the size has to match chapter 5. Preflight now catches this before the render and pauses the job with the exact names it could not find, so this should only appear on a job that was continued past that pause.",
  ],
  [
    "A number lost its leading zero",
    "The Excel cell was not in Text format. The supplied template already sets Text on the Number columns for 200 rows.",
  ],
  [
    "A logo did not change",
    "Either the Logo personalization box was left unchecked, the Logo Library file was not attached, or the cell value does not match any layer name inside that file.",
  ],
  [
    "The run seems frozen for several minutes",
    "The first stage of a large order builds an internal index of the pattern file and can take a long while with no visible movement. A run that genuinely stops updating is killed automatically after the watchdog timeout.",
  ],
];

/* ------------------------------------------------------------ components */

function Chapter({
  id,
  n,
  title,
  intro,
  children,
}: {
  id: string;
  n: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-5">
        <p className="font-mono text-[0.75rem] font-bold text-brand">Chapter {n}</p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-ink sm:text-2xl">{title}</h2>
        {intro && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{intro}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <Panel className="overflow-hidden">
      <div className="custom-scrollbar overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              {head.map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-faint"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line/70 last:border-0">
                {r.map((cell, j) => (
                  <td
                    key={j}
                    className={cn(
                      "px-4 py-3 align-top text-[0.8125rem] leading-relaxed",
                      j === 0 ? "font-semibold text-ink" : "text-muted"
                    )}
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
  );
}

function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border p-4 text-[0.8125rem] leading-relaxed",
        tone === "warn"
          ? "border-warn/40 bg-warn-soft text-warn-ink"
          : "border-brand/25 bg-brand-soft text-brand-ink"
      )}
    >
      {tone === "warn" ? (
        <Icon.Warn className="mt-px h-4 w-4 shrink-0" />
      ) : (
        <Icon.Book className="mt-px h-4 w-4 shrink-0" />
      )}
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function Docs() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="min-h-screen">
      <AppHeader active="docs" />

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-line bg-aurora">
        <div className="pointer-events-none absolute inset-0 bg-blueprint opacity-60" />
        <div className="relative mx-auto max-w-7xl px-5 py-12 sm:py-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-[0.75rem] font-semibold tracking-wide text-muted backdrop-blur">
            <Icon.Book className="h-3.5 w-3.5 text-brand" />
            Production handbook
          </span>
          <h1 className="mt-5 max-w-3xl text-3xl font-black leading-tight tracking-tight text-ink sm:text-5xl">
            How every part of the <span className="text-gradient">automation</span> works
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Nine chapters covering the files you prepare, the exact layer names the system looks
            for, what each option does, and what comes back in the ZIP. Everything here matches the
            behaviour of the current automation.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-5 pb-24 pt-10">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          {/* Chapter rail */}
          <aside className="lg:col-span-3">
            <nav className="lg:sticky lg:top-24">
              <p className="mb-3 text-[0.75rem] font-bold uppercase tracking-[0.18em] text-faint">
                Chapters
              </p>
              <ol className="space-y-1">
                {CHAPTERS.map((c) => (
                  <li key={c.id}>
                    <a
                      href={`#${c.id}`}
                      className="flex gap-2.5 rounded-lg px-3 py-2 text-[0.875rem] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      <span className="font-mono text-[0.75rem] text-faint">{c.n}</span>
                      {c.label}
                    </a>
                  </li>
                ))}
              </ol>
              <Link
                href="/order-guide"
                className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-[0.875rem] font-semibold text-ink transition-colors hover:border-brand/50"
              >
                <Icon.Sheet className="h-4 w-4 text-brand" />
                Interactive Excel guide
              </Link>
            </nav>
          </aside>

          {/* Chapters */}
          <div className="space-y-14 lg:col-span-9">
            <Chapter
              id="overview"
              n="01"
              title="How the system works"
              intro="The system takes an order sheet and two Illustrator files, and returns one folder of print-ready cut pieces. Illustrator is driven by the job itself, so nobody has to open or touch it during the run."
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  {
                    n: "Stage 1",
                    t: "Read the order",
                    d: "The Excel sheet is parsed into rows. Each row is one physical piece, with its size, sleeve length and any name, number or logo.",
                  },
                  {
                    n: "Stage 2",
                    t: "Build the plan",
                    d: "Rows are grouped by size and turned into a production plan: which parts to build, how many of each, and exactly which text goes on them.",
                  },
                  {
                    n: "Stage 3",
                    t: "Preflight",
                    d: "Fonts and layer names are checked before anything is rendered. Anything missing pauses the job and asks you what to do.",
                  },
                  {
                    n: "Stage 4",
                    t: "Render and pack",
                    d: "Every piece is built from the pattern, filled with the mockup design, personalized, seam-matched, laid out and exported, then zipped.",
                  },
                ].map((s) => (
                  <Panel key={s.n} className="p-5">
                    <p className="font-mono text-[0.75rem] font-bold text-brand">{s.n}</p>
                    <p className="mt-1 text-sm font-bold text-ink">{s.t}</p>
                    <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">{s.d}</p>
                  </Panel>
                ))}
              </div>

              <Note>
                <p>
                  <strong>Two Illustrator files, two different jobs.</strong> The{" "}
                  <strong>mockup</strong> (also called the test print) carries the artwork and the
                  colours. The <strong>master pattern</strong> carries the real cut shapes for every
                  size. The system copies design from the first onto the shapes of the second.
                </p>
              </Note>

              <Note tone="warn">
                <p>
                  Keep Illustrator closed before starting a job. A full order takes roughly 20 to 30
                  minutes, and the first stage can sit at a low percentage for several minutes while
                  the pattern file is indexed. If the run ever stops reporting progress it is shut
                  down automatically rather than left hanging.
                </p>
              </Note>
            </Chapter>

            <Chapter
              id="files"
              n="02"
              title="The files you provide"
              intro="Three files are required on every job. Two more are optional and only matter for specific features."
            >
              <Table
                head={["File", "Format", "Required", "What it is for"]}
                rows={[
                  [
                    "Orders Excel",
                    ".xlsx",
                    "Yes",
                    "One row per piece: size, sleeve length, and any personalization.",
                  ],
                  [
                    "Design mockup",
                    ".ai",
                    "Yes",
                    "The approved test print. Every part view, its colours, its artwork and its text placeholders.",
                  ],
                  [
                    "Master pattern",
                    ".ai",
                    "Yes",
                    "The graded cut pieces, one group per size and part.",
                  ],
                  [
                    "Fonts",
                    "Any font file",
                    "Optional",
                    "Only needed when a font used in the mockup is not installed on this PC.",
                  ],
                  [
                    "Logo Library",
                    ".ai",
                    "Optional",
                    "One file holding every logo as its own named layer or group. Needed only when the Excel has Logo columns.",
                  ],
                ]}
              />

              <h3 className="pt-2 text-sm font-bold text-ink">Templates to work from</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  {
                    href: "/Standard_Order_Template.xlsx",
                    title: "Order template",
                    desc: "The Excel sheet, with every column and sample rows.",
                  },
                  {
                    href: "/Mockup_Naming_Reference.xlsx",
                    title: "Mockup naming reference",
                    desc: "Every layer name the mockup can carry, with accepted spellings.",
                  },
                  {
                    href: "/Pattern_Naming_Reference.xlsx",
                    title: "Pattern naming reference",
                    desc: "Group names per size, size prefixes and size tag words.",
                  },
                ].map((d) => (
                  <a
                    key={d.href}
                    href={d.href}
                    download
                    className="group flex items-start gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand/50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-accent text-white">
                      <Icon.Download className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-[0.875rem] font-semibold text-ink">{d.title}</span>
                      <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-muted">
                        {d.desc}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </Chapter>

            <Chapter
              id="excel"
              n="03"
              title="Order Excel sheet"
              intro="The sheet named Orders is the one that is read. The title sits in the first row, the column headers in row three, and the data from row four down."
            >
              <Table
                head={["Rule", "Detail"]}
                rows={[
                  ["One row per piece", "Ten jerseys means ten rows, not one row with a quantity of ten."],
                  [
                    "Size is required",
                    "The value has to name a size the pattern file also has. Short forms are accepted, so L and Large are treated as the same size.",
                  ],
                  [
                    "Sleeve is a length, not personalization",
                    "A bare Sleeve column holds Half or Full. An empty cell counts as Half.",
                  ],
                  [
                    "Personalization columns are named Part plus Field",
                    "The part is Front, Back, Neck, Left Sleeve, Right Sleeve, or Sleeve for both. The field is Name, Number or Logo. Front Name and Back Number are the two most common.",
                  ],
                  [
                    "Unprefixed columns are allowed",
                    "A plain Name or Number column is routed automatically. Serial columns such as Sr No or S.No are ignored.",
                  ],
                  [
                    "Numbers keep their leading zero",
                    "The Number columns are pre-set to Text format, so 07 stays 07.",
                  ],
                  [
                    "A Logo cell is a name, not a file",
                    "The value has to match a layer or group name inside the Logo Library file. Spacing and capitals do not matter.",
                  ],
                  [
                    "The Colors sheet is optional",
                    "Use it only when exact CMYK values are needed. Delete it otherwise.",
                  ],
                ]}
              />

              <Note tone="warn">
                <p>
                  <strong>Fully supported today:</strong> Front and Back name and number, and logos
                  on Front, Back, Neck and the sleeves. Neck and sleeve <em>name and number</em>{" "}
                  columns are read by the parser but are not yet rebuilt from Excel the way Front and
                  Back are, so treat them as not supported and leave them out.
                </p>
              </Note>

              <p className="text-xs text-muted">
                The{" "}
                <Link href="/order-guide" className="font-semibold text-brand-ink hover:underline">
                  interactive Excel guide
                </Link>{" "}
                shows the same rules with a live column picker and a downloadable template.
              </p>
            </Chapter>

            <Chapter
              id="mockup"
              n="04"
              title="Mockup layer template"
              intro="This is the naming contract for the test print file. Names are read with spacing, capitals and punctuation ignored, so Rib & Cuff, Rib Cuff and rib&cuff are the same name. The words themselves have to be right."
            >
              <h3 className="text-sm font-bold text-ink">Part views</h3>
              <Table
                head={["Piece", "Name in the mockup", "Notes"]}
                rows={MOCKUP_PARTS.map((r) => [r[0], <Name key={r[1]}>{r[1]}</Name>, r[2]])}
              />

              <h3 className="pt-2 text-sm font-bold text-ink">Inside each design group</h3>
              <Table
                head={["Purpose", "Name inside the part group", "Notes"]}
                rows={MOCKUP_TEXT.map((r) => [r[0], <Name key={r[1]}>{r[1]}</Name>, r[2]])}
              />

              <h3 className="pt-2 text-sm font-bold text-ink">Matching layers</h3>
              <Table
                head={["Feature", "Name in the mockup", "Where it has to sit"]}
                rows={MOCKUP_MATCH.map((r) => [r[0], <Name key={r[1]}>{r[1]}</Name>, r[2]])}
              />

              <Note>
                <p>
                  A matching layer is only ever read when its option is ticked on the upload form.
                  Anything the system cannot find is reported before the render starts, never
                  guessed.
                </p>
              </Note>

              <h3 className="pt-2 text-sm font-bold text-ink">
                When one piece has to serve two features
              </h3>
              <p>
                A layer carries one name, so a piece that two features both need can run out of
                room. The usual case is a shoulder band that is also an armhole matching unit: its
                name has to stay <Name>unit 1</Name>, because armhole matching pairs the body unit
                with the sleeve unit by that exact name, so renaming it <Name>shoulder</Name> would
                quietly break the pairing.
              </p>
              <p>
                For <Name>side</Name> and <Name>shoulder</Name> the system therefore reads two
                places, in this order:
              </p>
              <ol className="ml-4 list-decimal space-y-1">
                <li>
                  the <strong>layer name</strong>, which is all a plain piece ever needs;
                </li>
                <li>
                  the <strong>object Note</strong> in Illustrator&apos;s Attributes panel, used only
                  when the name does not carry the word.
                </li>
              </ol>
              <p>
                So a plain shoulder band can simply be named <Name>shoulder</Name>, and a band that
                is also an armhole unit keeps the name <Name>unit 1</Name> and carries{" "}
                <Name>shoulder</Name> in its Note. The same rule applies to <Name>side</Name>.
                Because the two places are read separately, one piece can even be named{" "}
                <Name>side</Name> and noted <Name>shoulder</Name>, and both will act on it. Left and
                right are optional in either place, for example <Name>side right</Name>, and a
                number may be added when a panel carries several, for example <Name>side 2</Name>.
              </p>

              <h3 className="pt-2 text-sm font-bold text-ink">Reserved names, never use these</h3>
              <Table
                head={["Name", "What the system uses it for"]}
                rows={MOCKUP_RESERVED.map((r) => [<Name key={r[0]}>{r[0]}</Name>, r[1]])}
              />
            </Chapter>

            <Chapter
              id="pattern"
              n="05"
              title="Pattern layer template"
              intro="Every cut piece in the master pattern is found by the size word followed by the part name. XL Front, Medium Back, Large Short Sleeve, and so on."
            >
              <Table
                head={["Piece", "Group name, using XL as the example"]}
                rows={PATTERN_PARTS.map((r) => [r[0], <Name key={r[1]}>{r[1]}</Name>])}
              />

              <Note>
                <p>
                  <strong>Shared pieces carry no size.</strong> Placket, Twill Tape and Tukdi are
                  built once for the whole job, so their groups are named{" "}
                  <Name>Placket</Name>, <Name>Twill Tape</Name> and <Name>Tukdi</Name> with no size
                  in front. Patti is the exception among the extras: its length changes per size, so
                  it is named per size.
                </p>
              </Note>

              <h3 className="pt-2 text-sm font-bold text-ink">
                Size code in the order sheet, size word in the pattern
              </h3>
              <Table
                head={["Order sheet says", "Pattern prefix must be", "Example group"]}
                rows={SIZE_WORDS.map((r) => [r[0], r[1], <Name key={r[2]}>{r[2]}</Name>])}
              />

              <Note>
                <p>
                  <strong>Nothing else is needed inside a pattern piece.</strong> There is no{" "}
                  <Name>base-path</Name> here, that name belongs to the mockup. The system takes the
                  largest path in the group as the cut shape, pins its outline to 3pt itself, and
                  rewrites the small size tag text on the piece, so a tag still reading X-Large is
                  corrected automatically.
                </p>
              </Note>
            </Chapter>

            <Chapter
              id="options"
              n="06"
              title="Options reference"
              intro="Every checkbox on the upload form, what it changes, what it needs in the files, and what happens when that is missing. Click a row to open it."
            >
              <div className="space-y-2">
                {OPTIONS.map((o) => {
                  const isOpen = open === o.name;
                  return (
                    <Panel key={o.name} className="overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : o.name)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-2"
                      >
                        <span className="text-sm font-bold text-ink">{o.name}</span>
                        <span
                          className={cn(
                            "text-faint transition-transform",
                            isOpen && "rotate-90"
                          )}
                        >
                          <Icon.Arrow className="h-4 w-4" />
                        </span>
                      </button>
                      {isOpen && (
                        <div className="animate-fade-up space-y-3 border-t border-line px-5 py-4">
                          <div>
                            <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-faint">
                              What it does
                            </p>
                            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{o.does}</p>
                          </div>
                          <div>
                            <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-faint">
                              What it needs
                            </p>
                            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{o.needs}</p>
                          </div>
                          <div>
                            <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-faint">
                              If it is missing
                            </p>
                            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{o.missing}</p>
                          </div>
                        </div>
                      )}
                    </Panel>
                  );
                })}
              </div>
            </Chapter>

            <Chapter
              id="running"
              n="07"
              title="Running a job"
              intro="Once the files are attached and the options are ticked, the run reports back continuously until the ZIP is ready."
            >
              <Table
                head={["Stage on the progress bar", "What is happening"]}
                rows={[
                  ["Upload and parse", "Files are received, the Excel is read and the plan is built."],
                  [
                    "Preflight checks",
                    "Fonts and the layer names for every ticked option are verified against the mockup, and every panel the order asks for is verified against the pattern file.",
                  ],
                  [
                    "Illustrator render",
                    "The longest stage. Each size is built, personalized, matched, laid out and exported.",
                  ],
                  ["Package ZIP", "Previews, the plan, the log and any warnings are zipped together."],
                ]}
              />

              <h3 className="pt-2 text-sm font-bold text-ink">When a job pauses</h3>
              <Table
                head={["Choice", "What it does"]}
                rows={[
                  [
                    "Continue",
                    "Runs the job without that one feature. Everything else is built normally. The affected artwork is left exactly where the mockup had it. On a missing-pattern-piece pause it instead leaves those pieces out of the order file entirely.",
                  ],
                  [
                    "Run again",
                    "Offered for missing fonts. Install the fonts on this PC first, then use this so the run starts over with them available.",
                  ],
                  [
                    "Stop execution",
                    "Cancels the job. Nothing is generated and no files are produced.",
                  ],
                ]}
              />

              <Note tone="warn">
                <p>
                  A paused job cannot swap its own mockup file. If a layer name has to be corrected,
                  fix the mockup in Illustrator and upload a new job. Continuing renders the job
                  without that feature.
                </p>
              </Note>
            </Chapter>

            <Chapter
              id="output"
              n="08"
              title="What you get back"
              intro="One ZIP per job, containing the production file itself plus everything needed to check it."
            >
              <Table
                head={["File", "What it is"]}
                rows={ZIP_FILES.map((r) => [<Name key={r[0]}>{r[0]}</Name>, r[1]])}
              />
              <Note>
                <p>
                  Warnings never stop a job. Anything that needed a human eye is listed on screen at
                  the end and written into the ZIP, so a piece is never silently changed.
                </p>
              </Note>
            </Chapter>

            <Chapter
              id="trouble"
              n="09"
              title="Troubleshooting"
              intro="The issues that come up most often, and what each one means."
            >
              <Table head={["Symptom", "Cause and fix"]} rows={TROUBLE.map((r) => [r[0], r[1]])} />
              <Note>
                <p>
                  Every run writes a full <Name>debug_log.txt</Name> into the ZIP. It records every
                  measurement and every decision, so an unexpected result can always be traced back
                  to the exact step that produced it.
                </p>
              </Note>
            </Chapter>

            <div className="rounded-2xl border border-line bg-surface-2 p-6 text-center">
              <p className="text-sm font-bold text-ink">Ready to run an order?</p>
              <p className="mx-auto mt-1.5 max-w-lg text-[0.8125rem] leading-relaxed text-muted">
                Have the Excel, the mockup and the master pattern ready, then open the orchestrator
                and attach them.
              </p>
              <Link
                href="/"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-accent px-5 py-2.5 text-[0.875rem] font-bold text-white transition-all hover:brightness-110"
              >
                <Icon.Upload className="h-4 w-4" />
                Open the orchestrator
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
