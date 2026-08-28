---
id: 077
title: Resize first top anchored matching
stage: green
date: 2026-07-18
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeve-match", "proportional-resize", "top-anchor", "solver", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - node --check parse (passed)
  - runtime verification pending: re-run order, XL should match with ~resize% in log
---

## Prompt

or ye , yr ise dono issue ko fix kis trha kren ?? resize krne se to thk ho jata
he na ?? chota bara kren to ?? proportionally agr chota kren to perfect a skta
he yr , (XL Right/Left dono fail: slide + resize tried)

## Response

Job 780aa058 log: XL sleeve dono sides barabar 151.3mm, target 128.6mm - 22.7mm
COMMON mismatch. Slide 0.30*H guard se ruk gayi; purana resize fallback sirf
left-right FARQ ke liye tha (yahan farq 0) - clamp ho kar bekar - revert.

Fix (smApplyNamedMatch solver v3, user policy "resize kr lo, proportionally"):
1. scaleRounds(): Newton on AVERAGE residual - uniform proportional resize,
   art ke TOP-CENTER par anchored (top coverage kabhi nahi jati - crescent
   masla bhi isi se hal), per-step +/-10%, total cap [0.8, 1.25], 3 rounds.
2. Orchestration: agar common mismatch > 3mm -> RESIZE pehle (design ghalat
   size par bana he), phir solveByTranslation(6) fine-tune (left/right farq
   bhi yahi handle karta he); phir bhi na mile to ek aur scale+slide round.
3. ops[] do-history: har opShift/opScale record hota he; fail par exact
   reverse-order undo (pehle approximate revert tha jo scale+shift ke mix me
   ghalat ho sakta tha). Warning text me "up to 25%" add.
