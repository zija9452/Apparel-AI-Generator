---
id: 097
title: Hoodie rib cuff and border row gap
stage: green
date: 2026-08-12
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["hoodie", "rib-cuff", "border", "row-flow", "production-plan", "layout"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/main.py
 - Backend/scripts/automate_production.jsx
tests:
 - py_compile on main.py
 - Unit test of _enforce_hoodie_rib_cuff on the real job plan (3 cases - per-size add, non-hoodie untouched, no duplication)
 - node new Function() syntax check of automate_production.jsx
 - Node replay of the new row-height rule (2 cases - normal, post-wrap)
---

## Prompt

Cuff and rib nhi ho rhi hen export q ?? or border niche rkhne se front k , to next line se zyada gap do , wrna next line k artboards pr overlap ho rha he border

## Response snapshot

Two unrelated defects.

**1. Rib & Cuff never exported - nothing ever asked for it.**

The job's `production_plan.json` holds only `front`, `back`, `sleeve-long` per size. Traced every path
that could add a part:
- `main.py:101` explicitly tells the planning LLM not to invent accessory parts.
- `_enforce_accessories` only ever adds placket / twill-tape / tukdi, from frontend checkboxes.
- `_enforce_full_button_patti` adds Patti, gated on the full-button checkbox.
- The frontend has no rib/cuff option - only `preserve_sleeve_rib_distance`, which is a behaviour flag
  for an existing rib, not a request to produce one.
- The JSX's hoodie branch (`buildHoodieExtras`, line ~6519) auto-builds Hood / Border / Pocket from the
  pattern, and Rib & Cuff is not in that list.

So the part was never requested, which is why it silently produced nothing - no warning, because no code
was ever reached. The JSX already supports it end to end when asked: `partMap` maps `"cuff"` ->
`"Rib & Cuff"` (line ~475), `isRibCuffPart` (line ~502) drives the anchoring that places it 5mm below its
size's Sleeve, and `clearAllStrokes` covers it. The pattern file carries `Small/XL/2XL Rib & Cuff` groups.

Fix: `_enforce_hoodie_rib_cuff()` in `main.py`, modelled on `_enforce_full_button_patti` - one `cuff` item
per real size group on hoodie jobs, skipping the Universal group and skipping any group that already has a
rib/cuff item. Chose the backend over the JSX hoodie branch deliberately: it reuses the existing main-loop
path (pattern lookup, mockup design paste, stroke cleanup, sleeve anchoring) instead of duplicating it.

**Assumption flagged to the user:** that every hoodie order wants Rib & Cuff, quantity 1 per size. If some
hoodie orders should not have it, this belongs on a checkbox instead.

**2. Border overlapped the next row's artboards.**

`hoodieBuildBorder` places the Border at `frontB[3] - GAP_5MM_PT` (5mm below the Front) and adds its
artboard there, but never touched `rowMaxHeight`. Every other placement site updates it
(lines 1112, 1117, 6149, 6512), so the row tracker only ever knew the Front's own height. When the flow
advanced - on the forced size-change row break (line ~450) or a horizontal wrap - `currentY` dropped by
the Front's height alone, putting the next row level with the Front's bottom, i.e. straight on top of the
Border hanging below it.

Fix: after placing, grow the row to reach the Border's bottom:
```js
var rowNeed = currentY - (dupBorder.top - bh);
if (rowNeed > rowMaxHeight) rowMaxHeight = rowNeed;
```
Measured from `currentY` (the row's own top) rather than the Front's top, so if a wrap moved the flow to a
new row after the Front was placed the difference goes negative and the tracker is correctly left alone.
The next row then clears the Border and gets the normal `vSpacing` gap.

## Outcome

- ✅ Impact: hoodie jobs now produce a Rib & Cuff per size, and the Border no longer collides with the row below it.
- 🧪 Tests: py_compile + 3-case unit test of the plan rule; node syntax check + 2-case replay of the row rule. All pass. Neither fix has run through a full production job yet.
- 📁 Files: `Backend/main.py`, `Backend/scripts/automate_production.jsx`
- 🔁 Next prompts: restart the backend (main.py changed), run a hoodie job, confirm `{Size}_Rib_&_Cuff` renders appear and the Border sits clear of the next row.
- 🧠 Reflection: "why is nothing exported" turned out to have no error to find - the part was simply never requested. Tracing every code path that could add a part, rather than looking for a failure, was what settled it.

## Evaluation notes (flywheel)

- Failure modes observed: a missing plan item produces total silence - no warning anywhere - because the code that would warn is never reached. The JSX warns loudly when a requested part is missing from the pattern, but nothing notices a part that was never requested.
- Graders run and results (PASS/FAIL): plan rule 3/3 PASS; row rule 2/2 PASS; both syntax checks PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): have the JSX log the pattern groups it found but was never asked to build, so "nothing requested it" is visible in debug_log.txt instead of requiring a code trace.
