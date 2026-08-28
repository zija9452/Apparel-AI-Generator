---
id: 128
title: Order file canvas overflow split
stage: green
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["order-layout", "illustrator-canvas", "multi-file", "overflow"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - "node --check (jsx copied to .js) - PASS"
  - "scratchpad/overflow_sim.js - replays the new rollover math over the reported 7-size job: 6 sizes in file 1, 2XL moves WHOLE to file 2"
---

## Prompt

D:\Capture.JPG ye 2 xl jb artboard pr nhia rha he to ise dusri ai file pr de dety , ek new .ai file bna lety na , or pura size whi shift kr dety , isi trha agr kisi size pr koi part nhi a rha he .ai k canva pr to use dusri .ai file me pura size de do , pura size dusri ai file me shift kr do

(edge case asked + answered: a size too big for even an EMPTY file should be SPLIT across files, not left hanging with a warning)

## Response snapshot

PROBLEM: the order layout starts at Y=8000 and only ever runs downward, but
Illustrator's canvas is a fixed 227.54in square (~+-8190pt). The 7th size (2XL in
the screenshot) landed below the canvas edge - `artboards.add()` cannot even
create an artboard out there, so those pieces export wrong or not at all.

FIX - `automate_production.jsx` now rolls the layout into a new .ai file:
- `ORDER_TOP_Y = 8000`, `ORDER_FLOOR_Y = -7500` (~690pt of slack to the real
  canvas edge), `orderDocIndex`, `orderDocFiles`.
- `startNextOrderDoc(reason)`: flushes pending Hoodie extras, saves + closes the
  full document, opens a fresh CMYK one, clears its default swatches and restarts
  the flow at ORDER_TOP_Y. Resets `artboardCount`, `pmLastFullButtonPanel`,
  `pmLastSleevePanel`, `ribCuffSleeveBySize` (and the caller nulls
  `masterProcessed`) - every one of those is a live reference into a document
  that is now closed.
- Files: `production_ready_order.ai`, `production_ready_order_2.ai`, ... plus
  `order_files.txt` listing them (only written when there IS more than one).
  `illustrator_automation.py:1110` zips the whole renders folder, so the extra
  files ship without a Python change.

TWO CHECKS, in this order:
1. WHOLE-SIZE (preferred, at the size boundary) - `estimateSizeGroupHeight`
   replays the same row flow over the pattern file's real panel sizes and rolls
   the ENTIRE size over when what is left cannot hold it. Skipped when the size
   would not fit an empty file either (nothing to gain) or when the file is empty.
2. PER-PIECE (fallback, top of the quantity loop) - a piece that would hang below
   ORDER_FLOOR_Y starts a new file mid-size and re-places the size-group label
   there. This is what splits a size too big for one whole file, per the answered
   edge case.

EXEMPT from check 2 (they consume no new row and must stay with the piece they
anchor to, which lives in the current document): Full-Button Front-Right beside
its Front-Left, the second short sleeve of a stacked pair, Rib & Cuff under its
Sleeve, and all Hoodie extras. ORDER_FLOOR_Y's 690pt of slack absorbs them, and
`estimateSizeGroupHeight` reserves two spare rows when HOODIE_ON.

Also extracted, so the estimate can never measure a different panel than the one
that gets placed: `resolvePartLabel` (the part_name -> pattern-panel-name map plus
the "sleeve" fallbacks, lazily built like `_nameIndexes`), `clearOrderDocSwatches`,
`saveOrderDoc`, `buildPendingHoodieExtras`, `patternPieceHeight`.

## Outcome

- ✅ Impact: no size can land off the canvas any more; the reported job now yields 2 files with 2XL whole in the second
- 🧪 Tests: node --check PASS; overflow_sim.js reproduces the reported job's split exactly (6 + 1). No live Illustrator run yet
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: run a >6-size job and confirm both files open clean and every artboard exported; consider surfacing "order split across N files" on the frontend
- 🧠 Reflection: the estimate is only an optimisation (keep a size together) - correctness rests on the exact per-piece check, so a wrong estimate can waste space but can never push art off canvas

## Evaluation notes (flywheel)

- Failure modes observed: none yet; untested against a real render
- Graders run and results (PASS/FAIL): syntax PASS, layout simulation PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): rerun the reported 7-size job and diff debug_log for the "ORDER FILE:" lines
