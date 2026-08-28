---
id: 101
title: CMYK direct color flow explainer
stage: explainer
date: 2026-08-13
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct question)
labels: ["color", "cmyk", "spot-color", "mockup", "swatches", "illustrator-jsx", "read-only"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (read-only - no files modified)
tests:
 - none (explainer only)
---

## Prompt

explore my project and tell me k , cmyk color mockup wale hi same production order me jaty hen ?? aqgr spot link na ho to us ki value read kr k whi dala jata he

## Response snapshot

Both premises confirmed by reading the code. The pipeline is the "CMYK-DIRECT
FLOW" (automate_production.jsx:141-145, :1317-1319) - Excel `color_mapping` is
parsed by excel_service.py:196-273 and reaches the plan (main.py:589) but the
production script never reads it. Only the legacy manual `render_orders.jsx:30`
(not referenced from any Python) still consumes it.

Order doc is a fresh CMYK document with every default swatch deleted
(:127-137), so it starts with zero spots.

`mergeAndCleanupSwatches` -> `processSubColor` (:1480-1545) is the single gate
every fill/stroke passes through:
- SpotColor, clean name already in the order doc -> re-link to that spot (:1491)
- SpotColor, no match -> read `c.spot.color`, recreate the spot with the same
  name + exact CMYK ink via `getOrCreateSpot` (:1503-1517, :1292-1307)
- plain CMYKColor -> c/m/y/k copied one by one into a fresh object (:1523-1531)
- GrayColor -> K-only CMYK (:1533-1539)
- RGB / pattern / anything else -> untouched, no conversion (:1541-1544)
Plus a safety net (:1571-1588) that force-bakes any still-unresolved spot on a
path to plain CMYK, so it cannot render as no-fill once the mockup closes.

Panel base fill: `getDesignBaseFill` (:5431-5471) returns the fill object AS-IS
and it is assigned straight onto the pattern's placement path (:685, :6085).
Personalization text keeps its color by spot NAME lookup in the order doc, else
by reusing the saved color object (:5787-5810).

Three places invent a color instead of copying one: `smartContrast` (:5551,
Neck only via :1094) picks pure K0 or K100 by background brightness;
`ensureBlackStrokes` (:5902, accessories only via :1078) hardcodes
C56 M56 Y53 K92; the debug/overflow text builder (:2125) hardcodes K100.

Two edge cases flagged: RGB in the mockup gets no controlled conversion (falls
to Illustrator's own profile at duplicate/export time), and two different
mockup spots whose names normalize to the same key (lowercase, non-alphanumerics
stripped, `MOCK_` prefix removed) collapse into one - the second silently
inherits the first's ink.

## Outcome

- ✅ Impact: color flow documented end to end; confirms no hidden re-mapping between mockup and production file.
- 🧪 Tests: none - read-only exploration.
- 📁 Files: none modified.
- 🔁 Next prompts: decide whether RGB-in-mockup should hard-fail the pre-flight instead of silently passing through.
- 🧠 Reflection: the retired Excel path still exists in the parser and the plan model, which is a live source of confusion - worth either removing or marking deprecated in code.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): log a WARNING in the pre-flight when any mockup fill is RGBColor, so the operator learns before a 15-minute run.
