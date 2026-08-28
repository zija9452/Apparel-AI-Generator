---
id: 136
title: Hood Visible Gap Both Variants
stage: green
date: 2026-08-19
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat instruction)
labels: ["hoodie", "hood-gap", "visible-bounds", "centre-match", "cutting"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check on a .js copy of the JSX - SYNTAX OK
 - grep for stale HCM_OVERLAP_PT references - none left in code (one explanatory comment)
 - not yet run through Illustrator
---

## Prompt

visible bounds se rkho gap 3mm dono me outside and inside dono

(followed by: "3pt he stroke dono me" and "left me 3 pt stroke , right me pt strke , ye bhi add kr lena 14+3+ 3+3pt")

## Response snapshot

Diagnosis first, from job `6521a68b` whose `XL_Inside_Hood.jpg` showed the two
halves fused into one silhouette: `hcmNormaliseHalfGap` had a single call site
guarded by `HOOD_CENTER_MATCH && wantOutside`, and that job's plan carried
`hoodie_center_design_match: false`. So the gap normalisation never ran at all -
not on Inside (which the `wantOutside` gate excluded permanently) and not even
on Outside. The halves stayed exactly where the pattern drew them, touching.

Four changes:

1. `hcmNormaliseHalfGap` now measures `visibleBounds` instead of
   `geometricBounds` - the space between the two printed CUT EDGES. Takes a
   `variantLabel` so its warnings/logs name the right piece; log tag changed
   from `HOOD CENTRE MATCH` to `HOOD GAP` since it is no longer part of that
   feature.

2. Call site ungated and moved: runs for both variants, no `HOOD_CENTER_MATCH`,
   and now sits AFTER `applyPatternOutlineStroke` - visibleBounds includes the
   stroke, so the gap can only be set once both outlines are at their final 3pt.

3. `HCM_OVERLAP_PT` (14mm + 3mm = 17mm) deleted. It was only correct while the
   3mm was a path-to-path measurement; with a visible 3mm the paths sit further
   apart by the strokes between them. `hcmCombinedCentreX` and
   `hcmJoinHoodCentre` now take `overlapPt` as a parameter.

4. `hcmProcessOutsideHood` builds that overlap per piece as
   `HCM_SEW_PT + gapPt`, where `gapPt` is the measured geometric path-to-path
   distance: 3mm of visible space plus the half of each 3pt outline that falls
   inside it (Illustrator centres strokes), i.e. 3mm + 3pt = 4.058mm, giving
   **18.058mm**.

`HOOD_CENTER_MATCH && wantOutside` still gates `hcmProcessOutsideHood` at line
8836 - the design-matching feature really is Outside-only and checkbox-driven.
Only the gap escaped it.

Overlap figure resolved with the user. The first instruction was to add both
full strokes (`14 + 3 + 3pt + 3pt` = 19.117mm); I flagged that this
double-counts the stroke halves sitting OUTSIDE the gap, since only 1.5pt of
each 3pt outline lies between the two paths - and noted that 19.12mm happens to
land on the flat 19mm this constant used to be, which was real evidence for it.
The user chose 18.06mm ("wo perfect thi"). Implemented by measuring rather than
rebuilding from constants, so it also survives a skipped normalisation or a
changed outline width.

Arithmetic verified in node: path-to-path gap 4.058mm (11.50pt), overlap
18.058mm, rejected alternative 19.117mm.

## Outcome

- ✅ Impact: Inside and Outside hood halves now always get 3mm of visible space between their cut edges, independent of the design-match checkbox; the centre-match overlap is measured (18.06mm) instead of assumed.
- 🧪 Tests: `node --check` passes; no stale `HCM_OVERLAP_PT` references; overlap arithmetic checked in node (4.058mm gap -> 18.058mm). NOT yet verified in Illustrator.
- 📁 Files: `Backend/scripts/automate_production.jsx` (7 edits).
- 🔁 Next prompts: Run a hoodie job and confirm `HOOD GAP` log lines appear for all four hood pieces per size; confirm the 3mm is visible in the render.
- 🧠 Reflection: A production requirement (cuttability) was hiding behind a design feature's checkbox - worth checking what else sits behind `HOODIE_ON`-nested flags that should not.

## Evaluation notes (flywheel)

- Failure modes observed: A cutting-critical geometry step was gated on an unrelated opt-in checkbox, so it silently never ran on most jobs.
- Graders run and results (PASS/FAIL): Syntax PASS; runtime not yet exercised.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): Assert in the log that the post-normalisation visible gap re-measures to 3mm, so a skipped move is visible without reading warnings.
