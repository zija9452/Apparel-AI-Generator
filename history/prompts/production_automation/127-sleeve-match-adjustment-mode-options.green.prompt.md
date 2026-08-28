---
id: 127
title: Sleeve match adjustment mode options
stage: green
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["sleeve-match", "frontend-option", "axis-rules", "sleeve_match_mode"]
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
  - "python -m py_compile Backend/main.py - PASS"
  - "npx tsc --noEmit (Frontend/my-app) - PASS"
---

## Prompt

frontend me ye 4 option rkh do , up/down move , right/left move , resize , and auto , auto me jo bhi machine fesla kre jo current logic he, or up down me sirf up down ho , right left me bs right left try kren , or resize me small kr skte he or bra proportionally

(earlier in the same thread: "sirf unit left 1 me hi apply kro fix ka, same rule right wale pr bhi kr do bs, alg alg na kro mirror logic le lo"; "unit1 kbhi bhi left and right move na ho, isi trha left and right wala up and down move na ho")

## Response snapshot

AXIS RULES (jsx `_smSolveUnit`, one mirrored path for both sides):
- tagged "unit left N"/"unit right N" -> sideways ONLY, either direction; the
  up/down fallback removed from both the solve and the rescue.
- continuous "unit 1" -> up/down ONLY (must stay centered), proportional resize,
  shrink allowed.
- tagged units slide first, resize only if sliding cannot close the gap;
  continuous keeps resize-first for a big common residual.

NEW JOB-WIDE OPTION `sleeve_match_mode` (frontend radio -> main.py -> plan.json ->
jsx `SM_MODE`), 4 values:
- `auto` (default, and what an unknown/missing value resolves to) - the rules above
- `horizontal` - sideways only, no up/down, no resize
- `vertical` - up/down only, no sideways, no resize
- `resize` - proportional resize only (smaller or larger), never moves; forces
  `widthOnly = false` in scaleRounds so the top-anchored width-only shortcut cannot
  distort the shape
Move-only modes also skip `smApplyRibbonGap` (a width match is a resize) and log
that the ribbon was left as drawn. Whatever the chosen mode cannot fix is left
alone and reported as a normal skip warning.

Implementation: `allowSlideX` / `allowSlideY` / `allowResize` computed once at the
top of `_smSolveUnit` from SM_MODE + tagging; every axis decision (rescue, solve,
occluder nudge, orchestration) now reads those three flags. `solveByTranslation`
returns immediately when neither axis is allowed.

Also told the user what only the mockup can fix: back and sleeve must measure the
SAME D from the -7mm offset line (this job: 75.3mm vs 90.4mm), sleeve artwork
should bleed past the panel so a move is always free, and "unit righ 1" still needs
its missing "t".

## Outcome

- ✅ Impact: user can pick the correction method per article; tagged/continuous axis rules now match the stated intent exactly
- 🧪 Tests: node --check PASS, py_compile PASS, tsc --noEmit PASS; no live Illustrator run yet
- 📁 Files: automate_production.jsx, main.py, UploadForm.tsx
- 🔁 Next prompts: upload-time checker that reports the back-vs-sleeve D gap before the job runs; mockup-fingerprint end report
- 🧠 Reflection: the three allow* flags turned four scattered axis decisions into one place - worth keeping any future mode on the same three switches

## Evaluation notes (flywheel)

- Failure modes observed: none yet; the modes are untested against a real render
- Graders run and results (PASS/FAIL): syntax/typecheck PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run the same job once per mode and compare the VERIFY lines to see which mode this article actually needs
