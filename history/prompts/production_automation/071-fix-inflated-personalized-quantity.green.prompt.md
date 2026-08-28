---
id: 071
title: Fix inflated personalized quantities
stage: green
date: 2026-07-18
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["plan-correction", "quantity", "enforce-personalization"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/main.py
tests:
  - py_compile (passed)
  - runtime verification pending: re-upload the Throwdown job, XL fronts must be qty 1
---

## Prompt

(User pasted job 913cbd13 plan JSON: XL fronts itemized per NUMBER but each with
quantity 5) "ye quantity ek hi ani chahiyehe na ,"

## Response

Bug: `_enforce_personalization` me jab agent ne har personalization ka alag item
bana diya ho (`len(order) <= len(part_items) and excel_layers <= agent_layers`)
to function `continue` kar deta tha - quantities verify kiye baghair. LLM ne har
XL front ko qty 5 de di thi (25 fronts ban jate).

Fix: skip hone se pehle ab har personalized item ki quantity Excel rows ke
aggregate se match hoti he - item ke NAME/NUMBER values se projected key bana
kar `agg` se expected qty nikali jati he; mismatch pr warning + correction.
Backs/3xl (already qty 1) untouched; unpersonalized parts pehle se
`_dedupe_unpersonalized` handle karta he.

Note: chalta hua job 913cbd13 purane plan pr he - fix ke liye backend restart
kar ke dobara upload karna hoga.
