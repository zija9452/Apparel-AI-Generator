---
id: 14
title: Back Driven Underarm Detection
stage: green
date: 2026-08-19
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: fix UA-DETECT skips
labels: ["illustrator", "extendscript", "side-panel-fix", "underarm", "full-button"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - scratchpad/ua_test.js (Node harness, real functions extracted from the .jsx) - 8/8 pass
---

## Prompt

hn sahi tareeqa lga do

(plus, mid-turn: "or is ko scartchpad pr test bhi kro then , k thk a rha he ?",
"kia flow he ab ? example k sath", "and patti shoulder wala issue??")

## Response snapshot

Root cause established from job `2b17c990` renders + debug_log: SIDE-PANEL FIX ran on
only 2 of 19 panels because `findUnderarmY` refused to return a value.

Two distinct failures:
- **All 10 front halves** - `left/right underarm heights differ (197pt..341pt)`. A
  full-button half has an armhole on one side and a *placket* on the other; the
  placket is not a side seam, so the left/right symmetry test can never pass.
- **Large / XL / 2XL Back** - `underarm at unexpected height (95%)`. `_uaWalkUp`'s
  sharp-inward-turn test does not fire on the gentler graded armhole, so the trace
  walks past the underarm to the shoulder. Small/Medium Back traced fine (69-70%).

### Change 1 - widest-point promoted from cross-check to fallback

`findUnderarmY` (automate_production.jsx:3374). Corner trace stays authoritative;
when it fails or lands outside 35-90%, the widest-point estimate (already computed
for the cross-check) is used instead. The fallback is held to the SAME symmetry and
plausible-height tests, so a front half still refuses rather than adopting a wrong Y.

### Change 2 - back-driven underarm for front halves

- `pmBackUnderarm` cache added beside `pmFullButtonScale` (automate_production.jsx:454).
- `pmPeekFullButtonScale` now also measures Back's **side-seam length** (hem corner ->
  underarm) on the copies it already has in hand - no second duplicate-and-measure.
  Stashed in `peekUA`, committed only when the scale is judged sane.
- New helpers `_uaHemY` / `_uaHemInfo` / `_uaSeamLen` expose the hem corner on its own.
- `adjustSidePanelsToUnderarm(design, designBase, panelPath, partName, sizeLabel, scalePct)`
  falls back to rebuilding both underarms from Back's cached seam length, measured off
  the front half's own hem corner on the **armhole** side.

Key decision: transfer a **length**, not a percentage. Front and back side seams are
sewn to each other, so hem-corner-to-underarm is identical by construction. A
percentage would not transfer - Back is 36.10in tall vs Front 34.06in at 2XL (drop
tail); the test measures that error at 1.43in / 36.3mm.

### Still open

SHOULDER-ANCHOR (per-size rotation of the yellow shoulder band) is NOT built yet.
Measured cause: mockup was drawn on the **Small** pattern - panel shoulder slope grades
14.84deg (S) -> 11.20deg (2XL) while the mockup band stays at ~14.8deg. Gap above the band
tapers 13.8mm at the armhole to 1.4mm at the neck on 2XL. Bleed alone would leave a
tapered band (56.4mm vs 44.0mm), so rotation is required. Designer has put `shoulder`
in the band's Note field (Illustrator Attributes) - `.note` was chosen over `.name`
because `unit 1` is load-bearing for SLEEVE-MATCH's exact-name body/sleeve pairing
(`_smTargetFor`, automate_production.jsx:3935). Pivot must be the armhole end so
SLEEVE-MATCH's `D` anchor is preserved.

## Outcome

- Impact: SIDE-PANEL FIX should now run on all 5 Back panels and all 10 front halves
  instead of 2 of 19. No behaviour change on panels that already succeeded.
- Tests: Node harness with the real extracted functions - 8/8 pass. Full-file syntax
  check (`node --check`) passes. NOT yet run through Illustrator.
- Files: Backend/scripts/automate_production.jsx
- Next prompts: run a real job and check the new `UA-BACK-DRIVEN` / `SIDE-PANEL FIX`
  log lines per size; then build SHOULDER-ANCHOR.
- Reflection: the user caught that bleed would leave a tapered band - measuring the
  band width and the gap at both ends turned a guess into the real root cause (an
  angle, graded per size), which no designer-side fix could have solved.

## Evaluation notes (flywheel)

- Failure modes observed: first synthetic front panel in the harness had an inverted
  armhole parametrisation, producing a spurious top-left corner; caught by test 6.
- Graders run and results (PASS/FAIL): ua_test.js PASS (8/8)
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): real Illustrator run on this same job's
  files, diff the UA-DETECT lines against the 19 recorded in the previous run.
