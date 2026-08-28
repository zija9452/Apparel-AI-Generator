---
id: 065
title: Fix artboard gap at 5mm
stage: green
date: 2026-07-18
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "artboard-spacing", "layout"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - none (visual verification on next job run)
---

## Prompt

to use 5mm kr do . us gap ko

[clarification after first edit was rejected]

mtlb itne points ka gap rkho na , k wo 5mm ka gap ho

## Response

automate_production.jsx me artboard gap ab fixed 5mm he:

- `refContext.spacing = 5 * 2.83465` (= 14.17pt; Illustrator unit points he, 1mm = 2.83465pt).
- Reference file se spacing naapne wala block hata diya (warna wo 5mm ko override
  kar deta) — ab reference doc sirf is measurement ke liye khulta bhi nahi.
- Ye gap horizontal (pattern ke beech) aur vertical (rows ke beech) dono jagah
  lagta he, kyunki dono `refContext.spacing` use karte hen.
