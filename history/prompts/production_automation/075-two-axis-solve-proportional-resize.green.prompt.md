---
id: 075
title: Two axis solve proportional resize
stage: green
date: 2026-07-18
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeve-match", "solver", "2d-translation", "proportional-resize", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - node --check parse (passed)
  - runtime verification pending: re-run job ebdfc733 order, expect all sizes matched
---

## Prompt

(1) is trha to ye kch bhi match nhi hua (6 warnings, all sizes failed)
(2) ye exact match q nh hui kia logic ghlt thi hm,ari ?
(3) q to , how i fix this , is ki tolerance nhi brhani , hm fix q nhi kr skte hen ise ?
(4) ye v nhi he ... ye image he , check kro , or isi trha sb me v nhi hoga , alg alg shapes hon gi na
(5) tilt na kro , resize kr lo na / script dehe na , slide uper niche left ya right
krn ah , ye phr chota bara krna he shape ko , chota baray me bhi proportionally ya
one side, k design kharab na ho.

## Response

Root cause (job ebdfc733 log): har size me sleeve ke dono cap sides ka D aapas
me 2.6-4mm alag tha (cap ka front/back curve different he) jabke target ek
number. Purana loop dono sides ke moves ka AVERAGE leta tha - left/right
component average me cancel ho jata tha, is liye solver beech me stall ho kar
fail hota aur poora slide revert (8-21mm error chhor kar). Logic me yehi
kamzori thi - exact solution translation se hi maujood tha.

Fix (smApplyNamedMatch rewrite):
1. 2-AXIS SOLVE: finite-difference probes se naapta he k x-move aur y-move har
   side ka D kitna badalta he, phir 2x2 system solve kar ke ek combined
   up/down + left/right slide nikalta he jo DONO sides ko ek sath target pr
   laye. 6 iterations, per-step damp 0.15*H, total guard 0.30*H. Degenerate
   det par legacy averaged move fallback.
2. PROPORTIONAL RESIZE fallback (user ka kaha hua - tilt NAHI): agar slide
   akela na kar sake to MATCH art ko uniform resize (max +/-5%, crossing
   points ke midpoint ke gird, _smScaleArt helper) jo dono sides ka FARQ zero
   kare, phir dobara slide-solve. Kabhi one-sided stretch/tilt nahi.
3. Fail par resize + slide dono revert + updated warning text.
