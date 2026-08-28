---
id: 053
title: Dedupe Unpersonalized Quantity Postprocessor
stage: green
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["option-b", "quantity-dedup", "post-processor", "llm-safety-net", "main-py"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/main.py (modified - added _dedupe_unpersonalized; called after _enforce_personalization in upload path and after plan load in resume path)
 - scratchpad/test_dedupe.py (created - 10-case verification incl. real job 166f1287 plan)
tests:
 - 10/10 passed with Backend/.venv python - real 166f1287 plan: front 6->1, neck 6->1, 6 personalized backs + names + order preserved, sleeves/accessories untouched; duplicate-items variant collapsed; correct plan is a no-op
---

## Prompt

ok

(approving: implement option B - the deterministic quantity post-processor - now)

## Response snapshot

Implemented option B from PHR 052:

- New _dedupe_unpersonalized(plan_dict) in Backend/main.py: for every production
  group, any item with EMPTY text_replacements is forced to quantity 1 and duplicate
  (part_name, normalized size) copies are dropped, each with a logger.warning.
  Personalized items (non-empty text_replacements) are never touched.
- Wired in two places: upload path right after _enforce_personalization, and resume
  path right after loading the saved production_plan.json (so re-running an old bad
  plan like 166f1287 is also fixed).
- Verified against the real 166f1287 plan: front 6->1, neck 6->1, six personalized
  backs with names/order intact, sleeve-short and Universal accessories untouched.
  Also covered the duplicate-items LLM failure shape and a no-op on a correct plan.

This is the interim safety net; Phase 4 deterministic plan builder remains the
permanent fix (quantities computed in Python from the parsed personalization dict).

## Outcome

- ✅ Impact: The 6-fronts/6-necks LLM de-dup violation can no longer reach the JSX - identical un-personalized prints always render exactly once per size group.
- 🧪 Tests: 10/10 (real plan + synthetic duplicate-items + no-op)
- 📁 Files: 1 modified (main.py), 1 test script (scratchpad)
- 🔁 Next prompts: persist uploaded Excel per job (2 lines, still pending approval); Phase 4 deterministic plan builder; Phase 2 mockup scan
- 🧠 Reflection: Testing directly against the failed job's real production_plan.json made the fix's correctness self-evident.

## Evaluation notes (flywheel)

- Failure modes observed: none new; guarded both LLM failure shapes (quantity>1 and duplicated items)
- Graders run and results (PASS/FAIL): PASS 10/10
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): save excel upload bytes to job_dir/order.xlsx for auditability
