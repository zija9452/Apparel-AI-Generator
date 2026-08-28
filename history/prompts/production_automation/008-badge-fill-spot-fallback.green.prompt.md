---
id: 008
title: Badge fill spot fallback + decision logging
stage: green
date: 2026-06-23
surface: agent
model: claude-opus-4-8[1m]
feature: production_automation
branch: main
user: zija9452
command: fix swatch color relink (round 3)
labels: ["illustrator", "extendscript", "color-management", "cmyk", "swatch", "spot", "clipping"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check (parse-only on copied .js) -> PASS
---

## Prompt

d48 wala new he, is me abhi bhi wo shapes pr color nhi aya eh, q? kia clipping ka issue he?
wo peeche ja rha he?? kia issue he??

(Job d480354a-6755-40d4-bd34-051e3942d8de re-run with round-2 logging. Badge green+skin still
empty; only white letters render.)

## Response snapshot

Inspected the new job's debug_log + render. Round-2 PATH logging proved the badge green/skin ARE
normal PathItems that deepReLink reaches:
  - PATH 'unnamed' (PathItem) fill=SpotColor (MOCK_skin-color)
  - PATH 'unnamed' (PathItem) fill=SpotColor (MOCK_lgreen-color)
Both are `filled` (no [UNFILLED]) and there were ZERO "ApplySpot Error" lines. So the "odd item
type" theory (round 2) was wrong — the shapes are processed but still end up empty. The remaining
blind spot: processSubColor's outcome logs were gated by `if (isText)`, so a path silently hitting
`return null` (keeping a dangling MOCK_ spot → empty in CMYK export after mockup close) was invisible.
User's own hypotheses (clipping mask / z-order behind) are also plausible and now instrumented.

Edits (still confined to mergeAndCleanupSwatches; no alignment/clip/text-replace logic changed):
1. logPathColor now flags `[CLIPPING-MASK]` when `it.clipping` — directly tests the "shape but no
   fill = it's a clip path" theory.
2. processSubColor logs decisions for spot-filled PATHS too (new `dbg = isText || SpotColor`), plus
   a defensive nested-spot unwrap. Next run will show exactly what skin/green resolve to.
3. Apply branch: on fill apply force `obj.filled = true`; log APPLIED for spot paths; and a SAFETY
   NET — if a non-text spot path is left unresolved (processSubColor returned null), force-bake the
   spot's own ink (CMYK/RGB/Gray) straight to plain CMYK so it can never dangle/render empty.

## Outcome

- ✅ Impact: unresolved spot paths now get a guaranteed CMYK bake (likely fixes green/skin); next
  log run pinpoints whether the cause was null-return vs clipping-mask vs already-applied.
- 🧪 Tests: node --check parse PASS; runtime verification pending next Illustrator run.
- 📁 Files: Backend/scripts/automate_production.jsx (logPathColor, processSubColor, apply branch).
- 🔁 Next: re-run; in debug_log check the two badge PATH lines for `[CLIPPING-MASK]`, then the
  following `Spot Name / RGB Detected / APPLIED / FALLBACK / Unresolvable` decision lines.
- 🧠 Reflection: gating outcome logs on isText hid path-level failures for three iterations; always
  instrument the silent path before theorizing.

## Evaluation notes (flywheel)

- Failure modes observed: spot-filled paths processed but rendering empty; outcome invisible in log.
- Graders run and results (PASS/FAIL): node --check PASS.
- Next experiment: if logs show `[CLIPPING-MASK]` on skin/green, the fix shifts to releasing that
  inner clip / lifting fill before clip; if they show `Unresolvable` then FALLBACK bake already
  covers it; if they show APPLIED yet still empty, investigate z-order behind the base panel.
