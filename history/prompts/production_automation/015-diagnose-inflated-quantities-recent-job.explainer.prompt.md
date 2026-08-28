---
id: 015
title: Diagnose inflated quantities in recent job
stage: explainer
date: 2026-07-16
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["debugging","llm-plan","quantity","production-plan"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/uploads/366f6525-932d-459c-baa8-963392e86fa3/production_plan.json (inspected)
 - Backend/main.py (inspected)
 - Backend/services/excel_service.py (inspected)
 - Backend/apparel_sessions.db (inspected)
tests:
 - none
---

## Prompt

D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\366f6525-932d-459c-baa8-963392e86fa3 ye recent job he , or is me itna q quantity de di gyi hen , kia misunderstanding hui he ??

## Response snapshot

Root cause confirmed: the Excel order (26 rows, "Antelop Black Polo") had quantity 1 for every coach — verified from the exact prompt stored in apparel_sessions.db for session job_366f6525. The LLM ApparelOrchestratorAgent inflated quantities in its plan: for each size group it assigned roughly the size-group total to EACH personalized front item (XL: 5 names x qty 5, 2XL: 4 x 4, 3XL: 3 x 3, M: 2 x 2, L: 6 names x qty 5). The safety net `_enforce_personalization` (Backend/main.py:137) did not correct it because its guard `len(order) <= len(part_items) and excel_layers <= agent_layers` only validates item COUNT and layer coverage, never the quantity values, so the inflated quantities passed through. Result: 30 Large front renders (6 names x 5) instead of 6. Proposed fix: always reconcile each item's quantity against the Excel aggregation in `_enforce_personalization`.

## Outcome

- ✅ Impact: Root cause identified; no code changed yet (diagnosis only, user to decide on fix).
- 🧪 Tests: none
- 📁 Files: none modified
- 🔁 Next prompts: Patch _enforce_personalization to overwrite item quantities from Excel agg even when item count matches.
- 🧠 Reflection: LLM plan output needs quantity-level validation against source-of-truth Excel rows, not just item-count validation.

## Evaluation notes (flywheel)

- Failure modes observed: LLM assigned size-group total as per-item quantity; validator skipped quantity check when counts matched.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): In _enforce_personalization, when Excel rows exist for a size, force each rebuilt/matched item's quantity to the Excel-aggregated value.
