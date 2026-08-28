---
id: 124
title: Height vs both scaling steps
stage: explainer
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["design-scaling", "explainer", "alignAndScale", "pmAlignAndScaleToHeight"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx (read only - 2559-2587, 4781-4797)
tests:
  - none (explanation only)
---

## Prompt

height scale propotinally hota he , ek sath height and width scale krna , sirf height tk lana , or height AND widh ye step k bd width alg se krta he ? aesa hi he ?

## Response snapshot

Half right. Corrected the "two sequential steps" part.

- "Height scales proportionally only" (`pmAlignAndScaleToHeight`, jsx:4781-4797):
  one number, `panel height / design height`, applied to BOTH axes in a single
  `resize(scale, scale, ...)`. Proportions kept; overflow width is clipped.
- "Height and width both scale" (`alignAndScale`, jsx:2572-2587): NOT height-then-
  width. Both percentages are computed up front (`scaleW = availableW / oW`,
  `scaleH = availableH / oH`) and applied together in ONE
  `resize(scaleW, scaleH, ...)`.
- Since the 7mm margin was removed (PHR 123), both modes now fit the same area, so
  the HEIGHT result is identical in both; only width differs (proportional vs its
  own %).
- Side note: in "both" mode sw != sh, so `normalizePersonalizedText` restores the
  personalized name/number frames to a uniform scale afterwards.

## Outcome

- ✅ Impact: corrected the user's mental model of the two scale modes; no code change
- 🧪 Tests: none (read-only explanation)
- 📁 Files: none modified
- 🔁 Next prompts: none pending on this thread
- 🧠 Reflection: after the margin removal the two modes finally have a one-sentence difference - worth keeping the UI copy that simple

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
