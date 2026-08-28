---
id: 064
title: Pattern spacing in order file
stage: explainer
date: 2026-07-18
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "artboard-spacing", "layout", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - none (read-only explanation)
---

## Prompt

acha mjhe ye btao k jo mera order bnta he , to ek pattern desure pattern se kitne faslay pr hota he ??

## Response

Order file me do patterns ka fasla `refContext.spacing` he (automate_production.jsx):

- Default: **500 pt ≈ 176 mm ≈ 6.9 inch** (`var refContext = { spacing: 500 }`, line 56).
- Agar Reference Output (.ai) me 1 se zyada artboards hon, to script us file ke pehle
  do artboards ka gap naap kar wohi spacing use karti he (line 62) — default override
  ho jata he.
- Horizontal: `currentX += pWidth + spacing` (line 516). Row wrap hone pr vertical
  gap = `rowMaxHeight + spacing` (line 518). Row X range -7500 → 7500 pt.
- Ye artboard-to-artboard edge gap he (aik pattern ke right edge se agle ke left
  edge tak), pattern size se independent.
