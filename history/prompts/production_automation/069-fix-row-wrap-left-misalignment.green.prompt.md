---
id: 069
title: Fix row wrap left misalignment
stage: green
date: 2026-07-18
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "artboard-layout", "bugfix"]
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

or first row to thk a rhi he left se thora gap se , lekin us k bd jo 2,3,4 and so on.... jo artboard a rhe hen niche left artboard se bahara a rhe hen , q ??

## Response

Bug: pehli row `currentX = -7500` se shuru hoti thi lekin row-wrap pr
`currentX = -8000` set hota tha (purani 500pt-spacing era ki hard-coded value:
-7500 - 500). Is liye rows 2+ pehli row se 500pt zyada left se shuru hoti thin.
Fix: wrap ab `currentX = -7500` reset karta he — sab rows same left edge pr.
