---
id: 137
title: Rib Cuff Order And Hood Pair Stack
stage: green
date: 2026-08-19
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat instruction)
labels: ["hoodie", "rib-cuff", "layout", "row-flow", "sleeve-match", "hood-gap"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check on a .js copy - SYNTAX OK
 - overlap arithmetic in node - visible gap 11.173pt/3.9417mm, path-to-path 5.0000mm, overlap 19.0000mm
 - not yet run through Illustrator
---

## Prompt

me gap ko 3mm ki jga kitna rkhun k exact 19mm a jaye ??

or is ye bhi kr do k cuff and rib long sleeve or short sleeve jo bhi us k neeche aye center me , 5 mm k gap se hi , or agr pehle inside hood he bd outside hood to outside hood inside hood k 5mm niche aye

(then: "hood me a nhi rhe hen na , niche , brabr me hia rhe hen rib & cuff" and "flow kia hoga , ye btao ?")

## Response snapshot

Three changes.

**1. Hood centre gap set for a 19mm overlap.** `HCM_GAP_PT` is now
`5 * SM_MM - PATTERN_OUTLINE_PT` = 11.173pt = 3.9417mm of VISIBLE gap. The two
facing half-strokes (1.5pt each) sit inside it, so the panel paths land exactly
5mm apart and `HCM_SEW_PT + gapPt` = 14 + 5 = **19.0000mm**. Derived from
`PATTERN_OUTLINE_PT` rather than hardcoded, so changing the outline width keeps
the overlap at 19mm instead of drifting.

**2. RIB & CUFF ordering - the actual bug.** The piece was printing BESIDE its
sleeve, not below it. The placement code (anchor 5mm below, centred) was already
correct and already covered both long and short sleeves - it just never ran,
because `ribCuffSleeveBySize[sizeLabel]` was still empty when the cuff was
processed. Cause: SLEEVE-MATCH's reorder moves every sleeve to the END of each
size group, and `cuff` has no "sleeve" in its part_name, so it stayed in the
body bucket and was processed IN FRONT of the sleeves. With no anchor it fell
through to the normal side-by-side row flow. Hoodie jobs append the cuff last
(`main.py _enforce_hoodie_rib_cuff`), so this only broke once SLEEVE-MATCH was
on - hence "works on some jobs, not others".

Fixed with an unconditional pass right after the SLEEVE-MATCH reorder that moves
rib/cuff items to the end of their group, so the placement code's "sleeve first"
precondition holds however the item list arrived.

**3. HOOD-PAIR stacking.** `hoodieLastHoodBySize` records the first hood variant
of a size; the second stacks 5mm directly below it, centred, and consumes no new
column. `buildHoodieExtras` now builds **Inside first, Outside second**, so the
Outside Hood is the one that ends up 5mm below, per instruction. The artboard
rect now comes from the piece's real placed position (`placedX/placedY`) instead
of `currentX/currentY` - a stacked hood would otherwise have exported its
neighbour's slot. Row height for a stacked pair is measured from the anchor's
top to the stacked piece's bottom, taken from the anchor rather than `currentY`
so it survives a row break between the two.

## Outcome

- ✅ Impact: 19mm hood overlap exactly; Rib & Cuff now actually lands under its sleeve on SLEEVE-MATCH jobs; the two hood halves share one column instead of two.
- 🧪 Tests: `node --check` passes; overlap arithmetic verified (5.0000mm path gap -> 19.0000mm). NOT yet run in Illustrator.
- 📁 Files: `Backend/scripts/automate_production.jsx` (7 edits this round).
- 🔁 Next prompts: Run a hoodie job with SLEEVE-MATCH on; confirm `RIB & CUFF: moved ...`, `RIB & CUFF: anchored 5mm below`, and `HOOD-PAIR: stacking ... Outside Hood` all appear.
- 🧠 Reflection: The rib/cuff placement code was correct and had been reviewed as correct - the defect was an ordering precondition set by an unrelated feature. Worth checking what else in the main loop depends on item order.

## Evaluation notes (flywheel)

- Failure modes observed: A feature's precondition (sleeve placed before cuff) was silently invalidated by another feature's reordering, with a fallback that hid the failure instead of warning.
- Graders run and results (PASS/FAIL): Syntax PASS; arithmetic PASS; runtime not yet exercised.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): Warn when a rib/cuff finds no sleeve anchor instead of silently falling back to row flow - the fallback is what made this invisible.
