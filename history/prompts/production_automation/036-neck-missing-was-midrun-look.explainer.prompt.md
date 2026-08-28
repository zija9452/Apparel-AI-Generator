---
id: 036
title: Neck missing was mid-run look
stage: explainer
date: 2026-07-14
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["export", "neck", "run-timing", "renders"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/uploads/c462e225-b156-4cd7-b1f8-97287af0b877/renders (inspected)
tests:
 - none (investigation only)
---

## Prompt

or neck to a hi hi rhi he export me q ??

## Response snapshot

Not a bug: the job (c462e225) was still running when the renders folder was checked. Fronts/backs export first (~40s each), then sleeves, neck, twill tape, then the AI save + zip. Re-listing after completion (14:45:19) shows Medium_Neck_Item1.jpg, both sleeves, Back_Item6, Twill_Tape, production_ready_order.ai (37MB) and the ready zip all present; the neck render shows MD + care label correctly. Only Tukdi skipped (no 'Tukdi' group in pattern.ai - pre-existing). Advised re-downloading the zip; the SIZE-TAG white-box fix (PHR 035) landed after this run, so it applies from the next order.

## Outcome

- ✅ Impact: false alarm resolved; no code change needed.
- 🧪 Tests: none.
- 📁 Files: none modified.
- 🔁 Next prompts: regenerate to verify PHR 035 fixes (label background, 85% 2-digit numbers); add 'Tukdi' group to pattern.ai if that part is needed.
- 🧠 Reflection: renders appear incrementally during a 5-minute run - check status.json/is_ready or the final "Production Ready" log line before judging missing exports.

## Evaluation notes (flywheel)

- Failure modes observed: mid-run folder inspection mistaken for missing exports (twice - same happened to the agent earlier this session).
- Graders run and results (PASS/FAIL): N/A
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): none needed.
