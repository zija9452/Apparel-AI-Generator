"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { OPTION_DIAGRAMS } from "@/components/OptionDiagrams";
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
  ["Front panel", "Front", "Any job. Front View also matches."],
  ["Back panel", "Back", "Any job. Back View also matches."],
  ["Neck", "Neck", "Any job. Collar and Rib also match."],
  [
    "Sleeve",
    "Short Sleeve / Long Sleeve",
    "SS and LS also match, and Full Sleeve means a long one. A bare Sleeve or Sleeves is the last thing tried, so a named length always wins over a shared group.",
  ],
  [
    "Sleeve, per side",
    "Left Sleeve / Right Sleeve",
    "Used when the two sides differ. Sleeve Right, Right Short Sleeve, Short Sleeve Right, SS Right and Right SS all match too, and the same forms with LS or Long.",
  ],
  ["Front halves", "Front Left / Front Right", "Full Button Jersey only. Left Front and Right Front also match."],
  ["Button strip", "Patti", "Full Button Jersey only."],
  [
    "Rib and cuff",
    "Rib & Cuff",
    "Takes the colour the designer drew. Rib and Cuff, Cuff & Rib, Cuff and Rib, a bare Cuff and a bare Rib all match.",
  ],
  ["Placket", "Placket", "Only when the Placket checkbox is ticked."],
  ["Twill tape", "Twill Tape", "Only when the Twill Tape checkbox is ticked."],
  ["Tukdi", "Tukdi", "Only when the Tukdi checkbox is ticked."],
  [
    "Hood, outer",
    "Outside Hood",
    "Hoodie and Hoodie Jersey. Hood Outside also matches. Needs one child carrying the word Left and one carrying Right - a size in the name is fine, so 2XL Right Hood works.",
  ],
  ["Hood, inner", "Inside Hood", "The same, and Hood Inside also matches."],
  ["Hood border", "Border", "Hoodie and Hoodie Jersey."],
];

const MOCKUP_TEXT: Array<[string, string, string]> = [
  [
    "Garment silhouette",
    "base-path",
    "The single most important name. Every panel design group needs it, drawn at 3pt. The panel takes its fill and its scale from this path. base_path and basepath also match - but only those three spellings, so Base Path with a space does not.",
  ],
  ["Player name", "NAME", "Any text frame whose name contains NAME. PLAYER NAME and NAME_LAYER also match. Filled from the Name columns."],
  ["Player number", "NUMBER", "Any text frame whose name contains NUMBER. PLAYER NUMBER, NUM and # also match."],
  ["Logo slot", "LOGO", "Any item whose name contains logo. Swapped for the group named in the Logo column of that row."],
  ["Sleeve logos", "LEFT SLEEVE LOGO / RIGHT SLEEVE LOGO", "Used when the two sleeves carry different logos."],
  ["Size tag", "LOCAL TAG group with a SIZE text frame inside", "Only when the LOCAL TAG option is ticked. Both names are required."],
  [
    "Back label",
    "Back Label",
    "Placed automatically when the name exists inside the Back design. Matched on a name STARTING with Back Label, so Back Label 2 works; only spaces are ignored here, so Back-Label does not. No name means no label, nothing else changes.",
  ],
  ["Sleeve bottom line", "rib / cuff / box", "Any item whose name contains one of those words. Used by the Match sleeve bottom line option, which tries geometry first."],
  [
    "Test print size tags",
    "remove",
    "Anything named remove, or starting with it, is deleted before the design is placed. This is where the small on-mockup size tags such as S-outside go, so they never ride along onto a cut piece.",
  ],
];

const MOCKUP_RESERVED: Array<[string, string]> = [
  ["design_clip_group", "The group holding the pasted mockup artwork inside each panel clip."],
  ["TAG-MASK", "The LOCAL TAG clipping path, renamed while the clip is rebuilt."],
  ["MOCK_ prefix", "Every mockup swatch is renamed with this prefix at the start of a job so mockup and pattern swatches cannot collide."],
];

const MOCKUP_MATCH: Array<[string, string, string]> = [
  ["Center design match", "Center", "Same name on Front Left and Front Right."],
  ["Pattern seam match", "Pattern", "Same name on Front Left and Front Right."],
  ["Front and Back stripes", "Match_", "Any name starting with Match, on both Front Left and Back - so Match_, Match_Front Right and a bare Match all count."],
  [
    "Side seam match",
    "Front side match + Back side match",
    "Or the explicit pairs Front Left side match with Back Right side match, and Front Right side match with Back Left side match.",
  ],
  [
    "Armhole match",
    "armhole match group with unit 1, unit 2 inside",
    "The group name has to be exactly armhole match; anything inside it whose name starts with unit is collected. Needed on the Back view and on each sleeve view, and pieces pair by that number. Use unit left 1 and unit right 1 where the two sides are separate shapes - both still pair with the body's unit 1.",
  ],
  [
    "Side artwork kept on its seam",
    "side, or side left / left side",
    "Front and Back only, and only in the second design scaling mode. Either word order works, and a number may be added when a panel carries several, for example side 2. Name it, or write the word in the object Note when the name is already taken.",
  ],
  [
    "Shoulder band turned onto the shoulder line",
    "shoulder, or shoulder left / left shoulder",
    "Front and Back only. Always active, and it does nothing unless a piece carries the mark. Same spelling freedom as side above. Name it, or write the word in the object Note when the name is already taken.",
  ],
  [
    "Hood center match",
    "Center inside Outside Hood, in both the Right and the Left half",
    "The Right half copy is the one that is kept.",
  ],
  [
    "Team name held to its mockup width",
    "team name",
    "Any panel. Read by the Team name keeps its width option. Spelling is free - Team name, teamname and TEAM_NAME all count - and it may be numbered, for example team name 2. Name it, or write the words in the object Note when the name is already taken.",
  ],
];

const PATTERN_PARTS: Array<[string, string, string]> = [
  ["Front", "XL Front", "-"],
  ["Back", "XL Back", "-"],
  ["Neck", "XL Neck", "-"],
  ["Front halves, Full Button Jersey", "XL Front Left, XL Front Right", "-"],
  ["Button strip, Full Button Jersey", "XL Patti", "-"],
  [
    "Sleeve",
    "XL Short Sleeve, XL Long Sleeve",
    "XL SS, XL Half Sleeve, XL Sleeve SS for a short one; XL LS, XL Full Sleeve, XL Sleeve LS for a long one. Unlike the mockup there is NO bare XL Sleeve fallback and a short name never expands to the other length - cutting a long sleeve from a short-sleeve piece is fabric in the bin, so the job logs CRITICAL instead of guessing.",
  ],
  [
    "Sleeve when sides differ",
    "XL Left Sleeve, XL Right Sleeve",
    "XL Sleeve Left, XL SS Left, XL Left SS, XL LS Left, XL Left LS, and the same forms on the right.",
  ],
  [
    "Rib and cuff",
    "XL Rib & Cuff",
    "XL Cuff and XL Rib are tried FIRST, ahead of the canonical name, then XL Rib and Cuff, XL Cuff & Rib, XL Cuff and Rib. On a pattern carrying both XL Rib & Cuff and XL Cuff, the short one is the piece that gets cut.",
  ],
  [
    "Hood, Hoodie and Hoodie Jersey",
    "XL Hood",
    "Needs one child carrying the word Left and one carrying Right. The size may be repeated on them, so XL Left Hood is fine.",
  ],
  ["Pocket, Hoodie only", "XL Pocket", "Never looked for on a Hoodie Jersey, so its absence is not a warning there."],
  ["Border, Hoodie and Hoodie Jersey", "XL Border", "-"],
];

const SIZE_WORDS: Array<[string, string, string]> = [
  ["XS, XSmall, or X-Small", "XS", "Extra Small, Adult XS, AXS"],
  ["S, or Small", "Small", "Adult Small, Adult S, AS"],
  ["M, Med, or Medium", "Medium", "Adult Medium, Adult Med, Adult M, AM"],
  ["L, Lg, or Large", "Large", "Adult Large, Adult Lg, Adult L, AL"],
  ["XL, XLarge, or X-Large", "XL", "Extra Large, Adult XL, AXL"],
  ["XXL, 2XL, XXLarge, or 2X-Large", "2XL", "Adult 2XL, Adult XXL, A2XL, AXXL"],
  ["XXXL, 3XL, XXXLarge, or 3X-Large", "3XL", "Adult 3XL, Adult XXXL, A3XL, AXXXL"],
  ["XXXXL, 4XL, or 4X-Large", "4XL", "Adult 4XL, Adult XXXXL, A4XL, AXXXXL"],
  [
    "YXS, YS, YM, YL, YXL - or Youth XS, Youth Small",
    "The same youth code",
    "Youth M for YM, Youth Lg for YL, Youth X-Large for YXL, and so on. No Adult or A form is ever tried on a youth size.",
  ],
  ["1T to 10T - or Toddler 4", "The same toddler code", "Toddler 4T, Toddler 4"],
  ["1M to 12M - or 6 Months, 6MO", "The same month code", "6 Months, 6 Month, Month 6, Infant 6M"],
  [
    "W-XS, W-S, W-M, W-L, W-XL, W-2XL",
    "The same women's code",
    "The separator does not matter: W-M, W M and WM are one size. Also Women M, Women's M, Womens M, Ladies M, Women Medium, W Med. Adult is optional and may sit on either side - Women Adult Large, Adult Women L.",
  ],
  [
    "W-YXXS, W-YXS, W-YS, W-YM, W-YL, W-YXL",
    "The same women's youth code",
    "Women YM, Women Youth M, Womens Youth Medium, Youth Women M, W Youth Lg. These six are the only women's sizes cut from the Youth Pattern.",
  ],
  ["AXS, AS, AM, AL, AXL, A2XL", "The same code without the A", "The A prefix just pairs visually with the youth Y; AM is Medium."],
  [
    "Anything else, for example 5XL or S/M",
    "Used exactly as written",
    "Nothing extra is tried, so the pattern must carry a panel under that exact name. Combined sizes like S/M are not a size family the job knows.",
  ],
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
    name: "Hoodie Jersey",
    does: "The same garment as Hoodie without the pocket. Runs the normal Front, Back and Sleeve flow (short or long sleeve) and additionally builds Outside Hood, Inside Hood and Border. The neck piece is dropped, since it has a hood. Like Hoodie, one Rib & Cuff is added per size automatically. The only difference is the Pocket: none is built, so the Local Tag also keeps its normal position instead of being shifted clear of one. Cannot be combined with Hoodie - checking one clears the other.",
    needs: (
      <>
        Pattern: <Name>{"{Size} Hood"}</Name> with <Name>Left</Name> and <Name>Right</Name>{" "}
        children, and <Name>{"{Size} Border"}</Name> &mdash; no <Name>Pocket</Name> piece is
        looked for. Mockup: <Name>Outside Hood</Name>, <Name>Inside Hood</Name> (each with Left
        and Right children) and a <Name>Border</Name> design group.
      </>
    ),
    missing: "The job pauses before rendering and offers Continue without Hoodie Jersey parts.",
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
    name: "Armhole correction method",
    does: "Decides how a unit is allowed to be corrected onto its target. Auto lets the machine choose: a unit left or unit right piece slides sideways, a centered unit slides up or down, and either is resized only when sliding cannot close the gap. The other three restrict it to one method - Left/right move only, Up/down move only, or Resize only, which scales the piece proportionally and never moves it.",
    needs: "Nothing extra in the files. It only appears once Armhole side sleeve matching is ticked.",
    missing:
      "Not applicable, one of the four is always active and Auto is the default. Anything the chosen method cannot fix is left exactly as drawn and reported at the end, never corrected a different way.",
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
    does: "Personalizes the size letter on the tag and pins the bordered box to a fixed width: 3in for adult sizes (including W-XS to W-2XL) and 2.5in for youth, toddler, month and women's youth sizes.",
    needs: (
      <>
        A mockup group named exactly <Name>LOCAL TAG</Name> with a text frame named{" "}
        <Name>SIZE</Name> inside it.
      </>
    ),
    missing: "The job pauses before rendering. Continuing leaves every tag exactly as drawn in the mockup.",
  },
  {
    name: "Get mockup neck Text color",
    does: "Colors the text on the Neck, Collar and Rib pieces with the color the mockup's own neck uses - fill and stroke both, taken from the appearance, so text with no plain color still comes out right. Matching is word by word on the text itself.",
    needs: (
      <>
        A group named <Name>Neck</Name> in the mockup, with the same wording as the
        pattern&apos;s neck piece.
      </>
    ),
    missing:
      "A word with no match in the mockup is left exactly as the pattern drew it. Left unticked, no neck text is recolored at all.",
  },
  {
    name: "Team name keeps its width",
    does: "Puts the team name back on the width percentage it had in the mockup, on every size. The design is fitted by height, and patterns grade wider faster than they grade taller, so the team name keeps its height but covers less and less of the panel as sizes go up - measured on one real pattern, 65% of a Small front against 49% of a 6XL. It resizes proportionally, keeps its top edge where it was, and centers on the panel.",
    needs: (
      <>
        The artwork marked <Name>team name</Name> in the mockup, either as the layer or group
        name or in its Attributes <Name>Note</Name>. Spelling is free &mdash;{" "}
        <Name>Team name</Name>, <Name>teamname</Name> and <Name>TEAM_NAME</Name> all count &mdash;
        and it may be numbered, for example <Name>team name 2</Name>, when a panel carries more
        than one.
      </>
    ),
    missing:
      "Nothing is resized and the job renders exactly as it did before the option existed. Anything else in the design is untouched either way.",
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
  {
    name: "Preview renders",
    does: "Chooses what the job writes out. The default, AI file only, skips the render phase - which on a heavy mockup is most of the runtime - and produces a far smaller ZIP. The second mode additionally renders every piece to a 300 dpi JPEG under its size folder.",
    needs: "Nothing extra in the files.",
    missing:
      "Not applicable, one of the two is always active. The Illustrator file is identical either way, with every piece on its own artboard, so previews can be exported from it by hand later.",
  },
];

const ZIP_FILES: Array<[string, string]> = [
  ["production_ready_order.ai", "The master Illustrator file with every piece laid out on its own artboard at production scale. A mockup over 5MB is split into one file per size instead - production_ready_order_Small.ai, _Medium.ai, and so on, with the shared accessories in the last one."],
  ["{Size}/{Size}{N}.jpg", "A preview render of each exported piece, for checking before print. Filed under its size folder and numbered across the whole size - S/Small1.jpg to S/Small15.jpg, then L/Large1.jpg and so on. debug_log.txt carries the 'EXPORT NAME:' line saying which panel each number is. Present only when the job was started with Output set to 'AI file + JPEG previews' (step 06); the default skips them, because rendering them is most of a heavy job's runtime and the Illustrator file is unchanged either way."],
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
        <table className="w-full min-w-160 border-collapse text-left">
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

/** A numbered resolution order. Used where the question is not "what is this
 *  name" but "what does the job try, and in which order, before it gives up". */
function Flow({ steps }: { steps: Array<{ title: string; body: ReactNode }> }) {
  return (
    <Panel className="p-5">
      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3.5">
            <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand font-mono text-[0.6875rem] font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-[0.8125rem] font-bold text-ink">{s.title}</p>
              <div className="space-y-1.5 text-[0.8125rem] leading-relaxed text-muted">
                {s.body}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/** The real list of names one lookup walks, in order, with the one that hit
 *  marked. Taken from runs against real pattern files, not written by hand. */
function Probe({
  caption,
  names,
  hit,
}: {
  caption: ReactNode;
  names: string[];
  hit: string;
}) {
  return (
    <Panel className="overflow-hidden">
      <p className="border-b border-line bg-surface-2 px-4 py-2.5 text-[0.8125rem] leading-relaxed text-muted">
        {caption}
      </p>
      <ol className="custom-scrollbar max-h-72 overflow-y-auto p-2">
        {names.map((n, i) => {
          const found = n === hit;
          return (
            <li
              key={n}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-1.5 font-mono text-xs",
                found ? "bg-ok-soft font-bold text-ok-ink" : "text-muted"
              )}
            >
              <span className="w-5 shrink-0 text-right text-faint">{i + 1}</span>
              <span className="min-w-0 break-all">{n}</span>
              {found && (
                <span className="ml-auto shrink-0 whitespace-nowrap text-[0.6875rem] font-bold uppercase tracking-wider">
                  found
                </span>
              )}
            </li>
          );
        })}
      </ol>
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
                    "Adult pattern",
                    ".ai",
                    "For adult sizes",
                    "The graded cut pieces, one group per size and part, for XS and up.",
                  ],
                  [
                    "Youth pattern",
                    ".ai",
                    "For youth sizes",
                    "The same, for youth YXS-YXL, the women's youth codes W-YXXS-W-YXL, toddler 1T-10T and months 1M-12M. Adult and youth are graded in separate files, so an order attaches whichever ones its own sizes need - one, or both.",
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
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand to-accent text-white">
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
              <h3 className="text-sm font-bold text-ink">How a name is resolved</h3>
              <p>
                Every lookup on this page runs the same five steps. Knowing the order is what
                tells you whether a name that does not work is a typo, a missing layer, or a
                name the system reads as something else.
              </p>
              <Flow
                steps={[
                  {
                    title: "Everything that is not a letter or a digit is dropped",
                    body: (
                      <p>
                        Both your name and the name being looked for are reduced the same way, so{" "}
                        <Name>Rib &amp; Cuff</Name>, <Name>rib_cuff</Name>, <Name>RIB CUFF</Name>{" "}
                        and <Name>Rib-Cuff</Name> are one single name. Capitals, spaces, hyphens,
                        underscores, ampersands and apostrophes never matter anywhere in the mockup
                        or the pattern. Only the letters and digits do.
                      </p>
                    ),
                  },
                  {
                    title: "The name is matched by its own rule, not always in full",
                    body: (
                      <p>
                        Most names must match <strong>exactly</strong> (<Name>Front</Name>,{" "}
                        <Name>base-path</Name>, <Name>armhole match</Name>). Some match on a{" "}
                        <strong>start</strong>, so anything after the word is free -{" "}
                        <Name>Back Label 2</Name>, <Name>Match_Front Right</Name>,{" "}
                        <Name>remove-1</Name>. A few match on{" "}
                        <strong>containing</strong> the word anywhere, which is what lets{" "}
                        <Name>2XL Right Hood</Name> and <Name>PLAYER NAME</Name> work. The Notes
                        column in the tables below says which rule each name uses.
                      </p>
                    ),
                  },
                  {
                    title: "Abbreviations and the other word order are tried",
                    body: (
                      <p>
                        <Name>SS</Name> and <Name>Half Sleeve</Name> reach the short sleeve,{" "}
                        <Name>LS</Name> and <Name>Full Sleeve</Name> the long one, and per-side
                        names work either way round - <Name>Left Sleeve</Name>,{" "}
                        <Name>Sleeve Left</Name>, <Name>SS Left</Name>, <Name>Left SS</Name>. The
                        same freedom applies to <Name>side</Name>, <Name>shoulder</Name> and the
                        hood halves.
                      </p>
                    ),
                  },
                  {
                    title: "For side and shoulder only, the object Note is read too",
                    body: (
                      <p>
                        When the layer name is already taken by something else, write the word in
                        the object Note in Illustrator&apos;s Attributes panel instead. See the
                        section further down.
                      </p>
                    ),
                  },
                  {
                    title: "If nothing matched, the part falls back to LOGO",
                    body: (
                      <p>
                        This is the one fallback on the mockup side, and the one worth knowing
                        about - see the warning directly below.
                      </p>
                    ),
                  },
                ]}
              />

              <h3 className="pt-2 text-sm font-bold text-ink">Part views</h3>
              <Table
                head={["Piece", "Name in the mockup", "Notes"]}
                rows={MOCKUP_PARTS.map((r) => [r[0], <Name key={r[1]}>{r[1]}</Name>, r[2]])}
              />

              <Note tone="warn">
                <p>
                  <strong>A part that finds none of its own names falls back to a group named{" "}
                  <Name>LOGO</Name>.</strong> That fallback exists so a mockup built around one
                  shared logo group still renders, but it also means a misspelt{" "}
                  <Name>Back</Name> does not fail loudly - the Back panel quietly comes out
                  carrying the logo artwork instead. Placket, Twill Tape, Tukdi and Rib &amp; Cuff
                  are the exceptions: they look up their own group only, and render with the
                  pattern file&apos;s own fill if it is missing.
                </p>
              </Note>

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
              intro="Every cut piece is found by the size word followed by the part name. XL Front, Medium Back, Large Short Sleeve, W-M Front, and so on. Which of the two pattern files is searched is decided by the size itself: youth, women's youth (W-Y), toddler and month codes go to the youth file, everything else - including the women's adult codes W-XS to W-2XL - to the adult one."
            >
              <h3 className="text-sm font-bold text-ink">How a cut piece is found</h3>
              <Flow
                steps={[
                  {
                    title: "The order sheet's size cell becomes one size word",
                    body: (
                      <p>
                        <Name>Women Large</Name>, <Name>W-L</Name>, <Name>WL</Name>,{" "}
                        <Name>Ladies L</Name> and <Name>Women Adult Large</Name> all become the
                        single label <Name>W-L</Name>. That one label then decides everything
                        below. The full list is in the table further down.
                      </p>
                    ),
                  },
                  {
                    title: "The label picks which of the two pattern files is searched",
                    body: (
                      <p>
                        Youth <Name>YXS</Name>–<Name>YXL</Name>, women&apos;s youth{" "}
                        <Name>W-YXXS</Name>–<Name>W-YXL</Name>, toddler <Name>1T</Name>–
                        <Name>10T</Name> and months <Name>1M</Name>–<Name>12M</Name> are looked
                        for in the Youth Pattern. Everything else, including{" "}
                        <Name>W-XS</Name>–<Name>W-2XL</Name>, goes to the Adult Pattern. If only
                        one file is attached, every size falls back to it.
                      </p>
                    ),
                  },
                  {
                    title: "The part name and the size are each expanded into every spelling",
                    body: (
                      <p>
                        Then they are crossed: the <strong>canonical part name is tried against
                        every size spelling first</strong>, and only then the part
                        abbreviations. That order is deliberate - it means a pattern that
                        resolves correctly today keeps resolving to exactly the same piece, no
                        matter how many spellings are added later.
                      </p>
                    ),
                  },
                  {
                    title: "The first name that exists in the file wins",
                    body: (
                      <p>
                        The run logs <Name>PATTERN NAME</Name> saying which spelling matched. A
                        piece named any of the accepted ways costs nothing extra - the lookup is
                        an index, not a search.
                      </p>
                    ),
                  },
                  {
                    title: "If none of them exists, the job stops",
                    body: (
                      <p>
                        There is <strong>no fallback on the pattern side</strong>. See the
                        warning below.
                      </p>
                    ),
                  },
                ]}
              />

              <Probe
                caption={
                  <>
                    A worked example: an order row reading <Name>Women Large</Name>, looking for
                    its Front. These are the sixteen names tried, in order. On a real pattern file
                    whose group was named <Name>Women Large Front</Name>, number 6 is the one that
                    matched.
                  </>
                }
                names={[
                  "W-L Front",
                  "W Large Front",
                  "W Adult L Front",
                  "W Adult Large Front",
                  "Women L Front",
                  "Women Large Front",
                  "Women Adult L Front",
                  "Women Adult Large Front",
                  "Womens L Front",
                  "Womens Large Front",
                  "Womens Adult L Front",
                  "Womens Adult Large Front",
                  "Adult Women L Front",
                  "Adult Women Large Front",
                  "Adult Womens L Front",
                  "Adult Womens Large Front",
                ]}
                hit="Women Large Front"
              />

              <Note tone="warn">
                <p>
                  <strong>A missing pattern piece stops the job; it is never substituted.</strong>{" "}
                  This is the opposite of the mockup, where a part that finds none of its names
                  falls back to <Name>LOGO</Name>. Cutting the wrong shape is fabric in the bin, so
                  the run pauses and the log lists every name it tried - which is usually enough to
                  see the typo at a glance. The same applies to sleeve length: a short name never
                  expands to the long one.
                </p>
              </Note>

              <Table
                head={["Piece", "Group name, using XL as the example", "Other spellings accepted"]}
                rows={PATTERN_PARTS.map((r) => [r[0], <Name key={r[1]}>{r[1]}</Name>, r[2]])}
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
                head={["Order sheet says", "Canonical pattern prefix", "Other prefixes the job will also find"]}
                rows={SIZE_WORDS.map((r) => [r[0], <Name key={r[1]}>{r[1]}</Name>, r[2]])}
              />

              <Note>
                <p>
                  <strong>The canonical prefix is what to aim for, not a rule.</strong> Every
                  spelling in the third column is probed against the pattern file, and the run
                  logs <Name>PATTERN NAME</Name> saying which one matched. The canonical part
                  name is always tried against every size spelling before any abbreviation is,
                  so a pattern that works today keeps resolving to exactly the same piece.
                </p>
              </Note>

              <Note>
                <p>
                  <strong>Nothing else is needed inside a pattern piece.</strong> There is no{" "}
                  <Name>base-path</Name> here, that name belongs to the mockup. The system takes the
                  largest path in the group as the cut shape and pins its outline to 3pt itself.
                </p>
              </Note>

              <h3 className="pt-2 text-sm font-bold text-ink">The size tag inside the piece</h3>
              <p>
                Each cut piece carries a small text frame showing its size. The job rewrites that
                text to the full part name - <Name>XL</Name> becomes{" "}
                <Name>XL Short Sleeve Right</Name> - and grows the little box behind it to fit.
                What matters is the <strong>text you typed</strong>, not what the text frame is
                named. Four things are accepted, tried in this order:
              </p>
              <Flow
                steps={[
                  {
                    title: "The size word itself",
                    body: (
                      <p>
                        The tag reads exactly what the order calls this size -{" "}
                        <Name>XL</Name> on an XL piece, <Name>W-M</Name> on a W-M one.
                      </p>
                    ),
                  },
                  {
                    title: "Any other spelling of THIS size",
                    body: (
                      <p>
                        A single letter is fine here even though it is too loose to allow
                        generally: a <Name>W-M</Name> piece tagged just <Name>M</Name>, or{" "}
                        <Name>Medium</Name>, or <Name>Women Medium</Name>, all rename. A tag
                        naming a <em>different</em> size does not, so nothing on the piece gets
                        overwritten by accident.
                      </p>
                    ),
                  },
                  {
                    title: "Anything the order sheet itself would be read as this size",
                    body: (
                      <p>
                        The tag is put through the same reader the Excel size cell goes through.
                        So a piece tagged with its own full prefix -{" "}
                        <Name>Women Youth Large</Name> on a W-YL piece,{" "}
                        <Name>Adult Women 2XL</Name> on a W-2XL one - is understood without that
                        exact spelling having to be listed anywhere.
                      </p>
                    ),
                  },
                  {
                    title: "Any size word at all",
                    body: (
                      <p>
                        A stale sample size baked in when the piece was drawn -{" "}
                        <Name>X-Large</Name> on a piece now being cut as 2XL - still gets
                        corrected. Without this the old word stayed visible underneath the new
                        tag box and garbled the render.
                      </p>
                    ),
                  },
                ]}
              />
              <Note>
                <p>
                  If none of the four matches, the run logs{" "}
                  <Name>no &apos;&lt;size&gt;&apos; tag text found to update</Name> and leaves the
                  piece alone. Nothing else is affected - the piece is still cut and exported
                  correctly, it just carries whatever text it was drawn with. A locked text frame
                  is unlocked automatically before writing, so a locked tag is not the cause.
                </p>
              </Note>
            </Chapter>

            <Chapter
              id="options"
              n="06"
              title="Options reference"
              intro="Every checkbox on the upload form, what it changes, what it needs in the files, and what happens when that is missing. Click a row to open it - each one starts with a diagram of the same job without the option and with it."
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
                          {OPTION_DIAGRAMS[o.name]}
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
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-brand to-accent px-5 py-2.5 text-[0.875rem] font-bold text-white transition-all hover:brightness-110"
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
