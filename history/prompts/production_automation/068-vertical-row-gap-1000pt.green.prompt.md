---
id: 068
title: Vertical row gap 1000pt
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

gap horizontal; m,e itna hi thk he lekin vertical me 1000pt rkh do na

[mid-turn] horizonal me kitna gap ab ?? or vertical me kitna gap he

## Response

refContext ab do alag gaps rakhta he:
- Horizontal (patterns ke beech, same row): `spacing: 5 * 2.83465` = 14.17pt = 5mm
- Vertical (rows ke beech): `vSpacing: 1000` pt = ~352.8mm = ~35.3cm
Row-wrap line ab `rowMaxHeight + refContext.vSpacing` use karti he.
