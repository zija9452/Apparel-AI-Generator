---
id: 039
title: Tune 2-digit pre-scale to 90
stage: green
date: 2026-07-14
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["number-sizing", "tuning", "2-digit"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check syntax validation (PASS)
---

## Prompt

2 diguit bht choty ho rhe he , 85ki jga 90 kr do

## Response snapshot

One-line tune in replaceInContainer: the 2-digit number pre-shrink introduced in PHR 035 changed from 85% to 90% (tf.resize args and log message). 1-digit stays 100%, 3+ digits still governed by the 1.5x width cap, names untouched.

## Outcome

- ✅ Impact: 2-digit back numbers print at 90% of placeholder size.
- 🧪 Tests: node --check PASS; visual check on next regenerated order.
- 📁 Files: Backend/scripts/automate_production.jsx (1 edit).
- 🔁 Next prompts: regenerate and confirm 29 looks right; adjust constant again if needed.
- 🧠 Reflection: user tunes by regeneration feedback loop - keep such constants easy to find.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): node --check PASS.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): none.
