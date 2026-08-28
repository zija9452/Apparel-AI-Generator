---
id: 026
title: Implement per-part color neck watchdog
stage: green
date: 2026-07-08
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "color", "performance", "watchdog", "logging"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
  - Backend/services/illustrator_automation.py
tests:
  - node --check on JSX copy (syntax OK)
  - python -m py_compile on illustrator_automation.py (OK)
  - End-to-end job run PENDING (user's Illustrator session active; not disturbed)
---

## Prompt

ok implemnet kro  edge case discuss kr lena , hallucinate na krn a

(Edge cases resolved via AskUserQuestion: watchdog threshold = 10 min;
timeout action = kill Illustrator + clear error status.)

## Response

Implemented plan from PHR 024:

automate_production.jsx:
- log() now opens/appends/closes per write - debug_log.txt readable LIVE
  during a run (was 0 bytes until script end).
- Deleted pre-flight Strategy A/B base-color detection (~7 min/job saved;
  Strategy A could never work - swatch isolation renames base-color to
  MOCK_base-color first), Excel color_mapping block, finalBaseColor capture,
  and updateSwatchToCMYK helper.
- NEW getDesignBaseFill(): per-part panel color from the part's own design -
  'base-path' named shape first, else largest filled path; fill applied AS-IS
  (solid/spot/gradient). Applied after mergeAndCleanupSwatches so spots
  already belong to the order doc.
- No design / no filled shape -> panel keeps pattern file's own fill + warning.
- Accessory fallback: finalBaseColor replaced with keep-own-fill + warning.
- releaseInternalClippingMasks moved BEFORE alignAndScale (nested clips +
  live effects made one resize() grind 20.5 min on neck, then Illustrator
  crashed with RPC_E_SERVERFAULT).
- smartContrast now resolves SpotColor ink / gradient first stop for
  brightness.

illustrator_automation.py:
- Watchdog thread around blocking DoJavaScript: status.json mtime stale
  > 600s -> taskkill Illustrator.exe -> COM call returns -> status.json gets
  a clear "Job stuck - no progress for 10 minutes" error message.

Verification: py_compile OK; node --check OK on JSX. Full end-to-end run not
executed because the user had just opened their own Illustrator instances;
next real job from the frontend is the acceptance test (front/back colors,
gradient panels, neck completes in seconds-minutes, live debug_log).
