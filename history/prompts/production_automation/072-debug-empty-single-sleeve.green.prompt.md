---
id: 072
title: Debug empty single sleeve
stage: green
date: 2026-07-18
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeve", "design-lookup", "naming", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - node --check parse (passed)
  - runtime verification pending: re-run job, expect Right+Left sleeves with designs
---

## Prompt

D:\...\Backend\uploads\674421f3-... is ka debug dekho k q sleeve jo he empty ayi
he , jb k do sleeve thi left anmd right to ek ayi he wo bhi em,pty , aesa q hua he ??

## Response

Root cause (debug_log line 14650 + COM inspection of mockup.ai): mockup ke
sleeve design groups ke naam side-PEHLE hen — 'LeftShort Sleeve' aur
'Right Short Sleeve' — jabke code side-AAKHIR expect karta tha
('Short Sleeve Left/Right'):

1. mockupHasBothSleeveSides() pair na mila -> Left/Right expansion skip -> sirf
   1 sleeve item bana.
2. getSourceView('sleeve-short') ke targets me ye naam nahi the -> design SKIP ->
   sleeve blank rendered (pattern ki apni khali fill).

Fix (automate_production.jsx):
- pairs list me ["Right Short Sleeve","Left Short Sleeve"] + Long variant add.
- getSourceView right/left branches me "Right/Left Short Sleeve" + Long add.
- generic branch me side-first + "Right/Left Sleeve" fallbacks add.
findAnywhere naam normalize karta he (spaces strip) is liye 'LeftShort Sleeve'
(missing space) bhi match karega. Re-run par Right+Left dono sleeves apne apne
designs ke sath aane chahiyen.
