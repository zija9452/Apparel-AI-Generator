---
id: 117
title: Explain sleeve matching logic short
stage: explainer
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["sleeve-match", "explainer", "jsx", "armhole"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx (read only)
tests:
  - none (explanation only)
---

## Prompt

dekho mere sleeve matching logic , kia he , explain kro , short me just 3 lines me

## Response snapshot

3-line summary of ARMHOLE SIDE SLEEVE MATCHING as implemented in
`Backend/scripts/automate_production.jsx` (smMeasureBodyD / smApplyOneUnit /
smApplySleeveMatch, lines ~2916-4637):

1. MEASURE — only the Back/Front body panel's RIGHT armhole is measured once
   per size. Inside the "armhole match" group each "unitN" gets a D value =
   pen-tool distance from the -7mm seam corner (bottom/underarm or top/shoulder,
   whichever is nearer) to where that unit stops VISIBLY covering the seam line
   (z-order flattened so occluders count). Stored in `sleeveMatchD[size].byName`.
2. PAIR — body unit <-> sleeve unit are paired by NORMALIZED NAME (unit1<->unit1),
   not by distance order, because distance-order silently mispaired a ribbon
   unit against a plain path. The single right-armhole measurement is mirrored
   to the left corner and reused on Front and every sleeve.
3. APPLY — per sleeve unit an iterative solve slides (and, if the whole thing is
   off by a common amount, resizes first) the art along the seam until its own D
   hits the target within +/-1mm; ribbons are gap-matched via smApplyRibbonGap
   instead of free resize; if stuck, occluder is nudged, else best-effort state is
   kept and a warning goes to sleeve_match_warnings.txt.

## Outcome

- ✅ Impact: user got a 3-line mental model of the sleeve-match pipeline; no code changed
- 🧪 Tests: none (read-only explanation)
- 📁 Files: none modified
- 🔁 Next prompts: deep-dive on the solve loop (scaleRounds/solveByTranslation) or on ribbon gap handling
- 🧠 Reflection: the three-stage framing (measure -> pair by name -> iterative solve) is the clearest way to describe this subsystem

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
