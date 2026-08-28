---
id: 031
title: Explain neck smart contrast logic
stage: explainer
date: 2026-07-08
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["neck", "smart-contrast", "extendscript", "illustrator"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (inspected, no changes)
tests:
 - none (explanation only)
---

## Prompt

neck ki kia logic he ?? mere project me contrast ki ??

## Response snapshot

Explained the neck contrast logic in `Backend/scripts/automate_production.jsx`:

1. A part is treated as neck when `part_name` is `neck`, `collar`, or `rib` (line 278).
2. After the panel base is filled from the design (CMYK-direct), `smartContrast(pastedPattern, baseShape.fillColor)` runs ONLY for neck parts (line 489).
3. `smartContrast` (lines 1239–1267):
   - Unwraps GradientColor (first stop) and SpotColor (underlying ink) to get a judgeable color.
   - Computes perceived brightness: CMYK via weighted formula `1 - (C*0.3 + M*0.59 + Y*0.11 + K)`; RGB via standard luminance `0.299R + 0.587G + 0.114B`.
   - If brightness < 0.5 (dark background) → text becomes WHITE (CMYK 0/0/0/0); else → BLACK (K=100).
   - Recursively applies that color to all textFrames, plus pathItems named "label"/"size"/"logo" (fill and stroke).
4. Neck also gets zero margins in `alignAndScale` (edge-to-edge strip print, lines 1048–1050) and clipping masks are released before scaling to avoid the 20-minute neck hang.

## Outcome

- ✅ Impact: User understands why neck text/labels flip between black and white automatically.
- 🧪 Tests: none — read-only explanation.
- 📁 Files: none modified; automate_production.jsx inspected.
- 🔁 Next prompts: possibly tune the 0.5 brightness threshold or extend smartContrast to other parts.
- 🧠 Reflection: Contrast logic exists only for neck because size labels sit directly on the neck strip's base color.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
