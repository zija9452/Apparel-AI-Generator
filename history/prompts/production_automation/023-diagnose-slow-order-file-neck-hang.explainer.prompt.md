---
id: 023
title: Diagnose slow Order file and neck hang
stage: explainer
date: 2026-07-08
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "performance", "neck", "debugging", "com-error"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/uploads/81babe73-88ef-403a-bce0-2bc40db71a9d/renders/debug_log.txt (inspected)
  - Backend/scripts/automate_production.jsx (inspected, no changes)
tests:
  - none (diagnostic session)
---

## Prompt

Creating new Order file... ye is me itna time q le rhi he ?? """D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\81babe73-88ef-403a-bce0-2bc40db71a9d""" ye path he is ko dekho logs , kia issue he , or neck pr bhi ruk gya he , q ??

## Response

Diagnosed from debug_log.txt timeline (job 81babe73):

1. "Creating new Order file..." stall (13:11:22 → 13:18:04, ~7 min):
   - Strategy A base-color lookup ALWAYS fails because the swatch isolation step
     (which runs earlier) renames "base-color" → "MOCK_base-color" before
     `mockupDoc.swatches.getByName("base-color")` is called (automate_production.jsx:86-87 vs :128).
   - Fallback Strategy B then walks the whole mockup "Front" group over COM:
     mockup name index build 38s + findPlacementPath ~6 min.
   - First item additionally built the pattern-doc name index (87.5s).

2. Neck hang → crash:
   - Neck design duplicated from mockup fine (1s), deepReLink fine (~4s).
   - `alignAndScale` → single `obj.resize()` call took 20.5 MINUTES
     (13:20:45 → 13:41:19). Neck panel is an extreme wide/thin strip (1369×163 pt);
     the neck art has 24+ nested clipping masks and live-effect (warp) text, so the
     non-uniform stretch made Illustrator grind.
   - Right after, during "Finalizing Design Layering", Illustrator threw COM error
     -2147417851 (RPC_E_SERVERFAULT) and the job errored out at status.json.

3. Secondary finding: debug_log.txt stays 0 bytes during the run (ExtendScript File
   buffer only flushes on close/large buffer), so live debugging is blind.

Proposed fixes (not yet applied): capture base-color BEFORE the MOCK_ rename (or look
up "MOCK_base-color"), release internal clips / expand appearance on the neck design
BEFORE resize, and flush the log per write (append mode) + backend watchdog timeout.
