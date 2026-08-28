---
id: 025
title: Explain new automation flow
stage: explainer
date: 2026-07-08
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "flow", "planning", "base-color"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - none (explanation only, no changes)
tests:
  - none
---

## Prompt

flow kia hoga ??

## Response

Walked through the planned runtime flow (per PHR 024):

- Backend: fonts install -> Illustrator launch -> bundle run -> NEW watchdog
  (status.json stale -> fail with clear error instead of infinite wait).
- Script start: font pre-flight (pause on missing), MOCK_ swatch isolation,
  reference spacing — all unchanged. "Creating new Order file..." ab sirf
  doc create + swatch clear (Strategy A/B detection aur Excel color_mapping
  dono removed) -> seconds instead of ~7 min.
- Per part: panel duplicate -> design duplicate -> deepReLink (CMYK-direct)
  -> NEW: panel base fill design ke apne 'base-path' (fallback: largest
  filled path) se as-is (solid/spot/gradient) -> tags remove -> text
  replacements -> NEW ORDER: clips release PEHLE, phir alignAndScale (neck
  20-min grind/crash fix) -> layering/clip/contrast -> export; log flushes
  live per write.
- End: accessories unchanged, save AI, Production Ready.
