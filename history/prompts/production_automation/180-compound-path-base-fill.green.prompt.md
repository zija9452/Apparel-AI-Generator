---
id: 180
title: Compound Path Base Fill
stage: green
date: 2026-09-04
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat request)
labels: ["base-color", "compound-path", "illustrator", "fill", "false-positive", "regression-hunt"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - probe21 - three fill strategies on a compound, rendered to JPEG - only child-path fill paints
 - probe22 - the helper on the real YL Front (compound) and YXS Front (plain), both render filled
 - A/B pipeline, same YL Front panel, old clip code vs new - baseShape IDENTICAL in both, so the clip fix is not the cause
 - full pipeline with the fix - "compound path, filled 1 of 1 member path(s)", child0 fill=Spot('DD'), JPEG shows mint
 - node --check on automate_production.jsx - PASS
---

## Prompt

"C:\Production\...\production_ready_order_YM.ai is me front ka color wo q nhi a rha he jo mockup me he"
then "tmhari mistake se base-color nhi aya he front pr ?"
then "wo jo purana fix tha , compoundpath , ye usi ki wja se aya he , usi ko krna test"
then "scratchpad me test kro, mjhe base-color chahiye he"

## Response snapshot

### The accusation, tested rather than argued

The user's reading was that the day's `applyClipMask` change had removed the
base colour. Ran the same one-panel job (YL Front) twice - once with the new
clip helper, once with the old `clipGroup.clipped = true` - and compared the
saved files:

    OLD :  CompoundPathItem  filled=undefined  fill=null  || child0 fill=GrayColor
    NEW :  CompoundPathItem  filled=undefined  fill=null  || child0 fill=GrayColor

`baseShape` is byte-identical. The clip change never touched it - it only ever
mutates `clipMask`, which is a *duplicate*. **The base colour had never been
applied, in either run.**

But the change is not innocent either: a failing clip left the design untrimmed,
spilling past the outline and covering the bare panel. A working clip trims it
and the missing base colour becomes visible. Pre-existing bug, newly exposed.

### The real bug

`CompoundPathItem.fillColor` is a **false positive**. Rendered three ways:

    1  fillColor -> filled = true   (production's order)  -> WHITE
    2  filled = true -> fillColor                          -> WHITE
    3  fill each pathItems[i]                              -> the colour

In cases 1 and 2 the DOM reads back `filled=true, fill=CMYK(0,100,100,0)` while
painting nothing. So `log("Panel base filled from design ...")` at
`automate_production.jsx:1267` has been printing success over blank panels -
for `YM Front` and `YL Front` only, the two pattern pieces whose outline is a
CompoundPathItem (same two panels as the clipping-mask bug, same root cause).

### Changes

`fillShapeSolid(shape, color)` added next to `applyClipMask`: a compound gets its
member paths filled, anything else keeps the original two lines. Wired into all
four panel-fill sites - main base fill (1265), accessory base fill (1758),
`fillSiblingPlacementPaths` (4639), and the late second base fill (10806). The
log line now names the route taken.

### Verification

Real pipeline, real pattern/mockup, YL Front:

    Panel base filled from design ('base-path', SpotColor, compound path, filled 1 of 1 member path(s)).
    child0: filled=true fill=Spot('DD')

JPEG before/after: white panel -> mint panel, nothing else changed.

### Also this session

Reverted the blank name/number guard from earlier. It removed the `Front Number`
("99") whenever NAME was blank, because a group called "Team name" matches the
target "NAME" and every text frame inside it then counts as a hit. Fronts in that
order all have a blank NAME, so every front lost its number. Caught from the log
line the guard itself printed. The underlying crash (blank NUMBER kills
ScriptingSupport.aip) is therefore still open.

## Outcome

- ✅ Impact: compound-outline panels finally get their base colour, on every
  fill site. Plain-path panels take the identical code path as before.
- 🧪 Tests: 3 scratchpad probes + an A/B pipeline pair + a fixed pipeline run,
  all verified by rendered JPEG rather than property read-back. `node --check` PASS.
- 📁 Files: 1 changed (`automate_production.jsx`).
- 🔁 Next prompts: (a) the blank-NUMBER crash is still unfixed - needs a guard
  that cannot be reached through a container-name match; (b) re-run any order
  containing YM/YL fronts, their base colour was never right.
- 🧠 Reflection: I had twice reasoned from `filled=true` read-backs. Both times
  the property agreed with me and the render disagreed. For anything that must be
  SEEN, the JPEG is the test and the property is not evidence.

## Evaluation notes (flywheel)

- Failure modes observed: a write-then-read-back that lies; a log line placed
  after an unverified assignment, so it reported success for months; my own
  earlier memory note asserting the failed clip "hides the design", which was
  wrong precisely because this second bug left the mask unfilled.
- Graders run and results (PASS/FAIL): rendered JPEG per fill strategy - PASS
  (only child-path fill paints); A/B baseShape comparison - PASS (identical, so
  the accusation against the clip fix is disproved).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): grep for other `.fillColor =` writes
  onto shapes that could be compound (text and swatch paths are unaffected).
