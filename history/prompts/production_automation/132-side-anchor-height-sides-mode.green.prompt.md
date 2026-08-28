---
id: 132
title: Side anchor height sides mode
stage: green
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["side-anchor", "height-scaling", "design-scale-mode", "front-back", "naming-convention"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
  - Backend/main.py
  - Frontend/my-app/components/UploadForm.tsx
tests:
  - "node --check (jsx copied to .js) - PASS"
  - "npx tsc --noEmit (Frontend/my-app) - PASS, no output"
  - "python -m py_compile Backend/main.py - PASS"
  - "regex harness over real mockup names - 'side'/'side 1'/'Side Left'/'Left Side' MATCH; 'Front side match'/'Back side match'/'Front Left side match'/'side match'/'side panel'/'outside'/'beside' all skip"
---

## Prompt

ok implement kro , me bs front back k right left side pr side likh dun gi , or width and height scaling ko hta kr ye dal do frontend me option heightr scaling proportionally with sides perfect ,

## Response snapshot

Implements the plan from PHR 131, with the user's answer to edge case #2 taken
as given (she names BOTH seams simply "side", so the seam is detected from the
mockup geometry) and the remaining recommendations accepted as written.

1) `Backend/scripts/automate_production.jsx`
   - New job-wide flag beside `SCALE_HEIGHT_ONLY`:
     `var SIDE_ANCHOR = (plan.design_scale_mode === "height_sides");`
     Placed in the main flow (which runs ABOVE every helper), so it is assigned
     before the items loop reads it.
   - New `anchorSideGraphicsToSeam(design, designBase, panelPath, partName,
     sizeLabel)` directly after `adjustSidePanelsToUnderarm` - its horizontal
     twin, same window (needs the scaled base-path, so before
     `removeBasePaths`), different axis, so the two never fight.
       left seam  -> dx = panelLeft  - designSilhouetteLeft
       right seam -> dx = panelRight - designSilhouetteRight
     Move only (`it.left = it.left + dx`, relative so `.left` semantics never
     matter). No resize, no vertical change, nothing hardcoded - the sign
     reverses by itself if the design is wider than the panel.
   - Naming: `/^(side(left|right)?|(left|right)side)[0-9]*$/` against the
     name lowercased with non-alphanumerics stripped. Anchored on purpose so
     the shipped `Front side match` / `Back side match` groups can never be
     caught. A named GROUP moves as one unit (no recursion into it).
   - Guards, each logged: not near either seam -> skip; touches BOTH seams ->
     skip (would need stretching); on a full-button half's PLACKET edge ->
     skip (Front-Left's placket is its right edge, the same convention
     `pmSeamX` already owns); shift < 1mm -> nothing to move; shift > 15% of
     panel width -> skip + WARNING. Ends with a count line, and says so
     explicitly when no `side`-named artwork exists at all.
   - Call site gated `if (SIDE_ANCHOR)` inside the existing
     `isFrontOrBack(item.part_name)` block; the no-base-path branch logs why it
     skipped. Sleeves, Neck, accessories and the Hoodie hood/border path are
     untouched.
   - `mm` and the regex are declared INSIDE the function, not at file scope -
     file-scope `var`s are still undefined when the main flow runs (the
     hoisting rule already documented for `patternSizeCache`/`_nameIndexes`).

2) `Backend/main.py` - `design_scale_mode` now normalises to
   `("height_sides", "both")` else `"height"`. `"both"` is no longer offered on
   the form but is still honoured if posted, so re-running an older stored plan
   reproduces its original output.

3) `Frontend/my-app/components/UploadForm.tsx` - the "Height and width both
   scale" radio is replaced by "Height scales proportionally, sides kept
   perfect" (`value="height_sides"`), explaining the `side` naming and that the
   artwork is only moved sideways, never stretched.

## Outcome

- ✅ Impact: side-seam artwork on Front/Back stays on its seam under proportional height scaling; the stretch-both option is gone from the form
- 🧪 Tests: node --check PASS; tsc --noEmit PASS; py_compile PASS; name-regex harness PASS (side-seam-match names provably excluded)
- 📁 Files: Backend/scripts/automate_production.jsx, Backend/main.py, Frontend/my-app/components/UploadForm.tsx
- 🔁 Next prompts: run a real job with the new option and `side`-named Front/Back artwork; read the SIDE-ANCHOR lines in debug_log.txt to confirm each piece found its seam
- 🧠 Reflection: a uniform scale can only preserve what it does not stretch, so the leftover gap has to be given back by name - the same "measure the actual delta, move by exactly that" shape as the underarm fix, one axis over

## Evaluation notes (flywheel)

- Failure modes observed: side graphics drifting to the middle of graded Front/Back panels under height-only scaling
- Graders run and results (PASS/FAIL): syntax PASS (jsx/ts/py); naming-collision harness PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): none until a live run - if a piece is skipped as "not on either seam", widen the 10%-of-width hug tolerance rather than loosening the name rule
