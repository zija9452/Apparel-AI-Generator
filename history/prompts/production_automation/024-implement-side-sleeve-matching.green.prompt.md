---
id: 024
title: Implement side sleeve matching
stage: green
date: 2026-07-17
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeve-matching","implementation","geometry","checkbox","warnings"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/components/UploadForm.tsx (checkbox "Side-sleeve design matching", default OFF, posts match_sleeve_to_side=true)
 - Frontend/my-app/components/ProductionPlan.tsx (amber end-of-job warnings box listing skipped parts)
 - Backend/main.py (match_sleeve_to_side: bool = Form(False); injected deterministically into plan_dict, never via LLM)
 - Backend/services/illustrator_automation.py (update_status warnings param; stale sleeve_match_warnings.json cleanup; final status carries warnings read from jobDir)
 - Backend/scripts/automate_production.jsx (SM_ON flag block + group reorder; per-item hook; end-of-run warnings files; full SLEEVE-MATCH helper section)
tests:
 - node --check on automate_production.jsx (syntax) - PASS
 - py_compile on main.py + illustrator_automation.py - PASS
 - npx tsc --noEmit on frontend - PASS
 - scratchpad/sm_geom_test.js: 7 synthetic-geometry tests on the verbatim measurement code (solid panel D, stripes farthest-boundary D, full-coverage flag, no-contact, left edge, secant convergence to target D in 1 iteration, slanted-edge arc-vs-vertical distance) - ALL PASS
---

## Prompt

ok perfect

## Response snapshot

User confirmed the +-1mm tolerance, unblocking implementation. Implemented the full side<->sleeve matching pipeline end to end:

1. FRONTEND: checkbox on the upload form (default OFF) -> multipart field match_sleeve_to_side; ProductionPlan shows an amber warnings box at end of job listing every skipped part, pointing to sleeve_match_warnings.txt / debug_log.txt inside the zip.
2. BACKEND: FastAPI Form(False) bool; plan_dict["match_sleeve_to_side"] set deterministically after the LLM plan is built. Resume flow inherits it via production_plan.json. illustrator_automation.py deletes stale warnings JSON before each run, reads jobDir/sleeve_match_warnings.json after the JSX finishes, and publishes warnings in the final status.json (update_status gained a warnings param).
3. JSX (core): gated by SM_ON, zero code runs when OFF. Groups reordered so front/back render before sleeves. On front/back: smMeasureBodyD samples the panel outline (bezier-aware, 32/seg), finds underarm corners via the production-proven _uaWalkUp, collects side artwork (filled paths hugging the panel edge, reaching the corner region, excluding base-path/logos/silhouette-containing-both-corners), then _smMeasureAlongEdge walks the armhole from the corner and returns arc distance D to the FARTHEST inside->outside crossing (stripes supported), with covered/full flags; edge end detected by apex descent OR flatness (shoulder seam) armed only after a 15% panel-height climb. First successful body panel stores D per size (front/back identical per user). On sleeves: smApplySleeveMatch finds cap corners the same way, measures each side's D, then shifts that side's artwork vertically (never scaled) with secant iteration (max 7, 30%-height guard), re-measuring each step until |err| <= 1mm; on failure the artwork is restored exactly and the part is warned. All failure paths use the UA-DETECT skip-on-doubt pattern; every branch logs to debug_log.txt.
4. WARNINGS: JSX writes jobDir/sleeve_match_warnings.json (for the frontend) and renders/sleeve_match_warnings.txt (ships inside the zip) plus log lines; skips are never silent.

Note: D is measured along the panel edge itself (not a -7mm inset offset path); both body and sleeve use the identical definition so the seam comparison is consistent.

## Outcome

- ✅ Impact: Feature complete per the visual plan artifact (fbdae0c5): checkbox-gated, fully dynamic (no colors/mm hardcoded), skip+report fallback everywhere.
- 🧪 Tests: 7/7 synthetic geometry tests pass on the extracted verbatim function; all syntax/type checks pass. Real-pattern validation still requires a live Illustrator job.
- 📁 Files: 5 files changed (see files list).
- 🔁 Next prompts: Run a real job with the checkbox ON and review debug_log.txt SLEEVE-MATCH lines (D values per size, iterations, warnings) against a manual Illustrator measurement.
- 🧠 Reflection: Testing the pure-geometry function in Node caught a real bug before production: full-edge coverage leaked past the shoulder because apex-descent alone never fired on flat tops; the flatness window fixed it.

## Evaluation notes (flywheel)

- Failure modes observed: full-coverage misclassification (fixed via flatness termination armed after 15% climb).
- Graders run and results (PASS/FAIL): sm_geom_test.js 7/7 PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): If real armholes start flatter than the 15% arm threshold assumes, expose the 0.3 slope ratio as a named constant next to SM_TOL_PT.
