---
id: 057
title: Diagnose Blown Up Front Design
stage: explainer
date: 2026-07-16
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["alignAndScale", "findPlacementPath", "clip-release", "z-order-regression", "base-path", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (inspected - jsx:344-378 scaling flow, jsx:958-1012 releaseInternalClippingMasks SENDTOBACK, jsx:1211-1232 alignAndScale, jsx:1300-1321 findPlacementPath)
 - Backend/uploads/426d1caf-a7ac-44e2-8524-d805c1b81ba4/renders/debug_log.txt (inspected - run evidence)
tests:
 - none (diagnosis only)
---

## Prompt

explore my project and ye mockup dia tha mene """"E:\Testing order\File\Antelop\Black Polo 1.ai"""" and us ne ye image generate ki he """D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\426d1caf-a7ac-44e2-8524-d805c1b81ba4\renders\2XL_Front_Item3.jpg""" q ?? q itna zyada expand kr dia he , kia mistake hui he ??

## Response snapshot

Root cause: regression from PHR 010 (clip-path-send-to-back). Chain of events:

1. releaseInternalClippingMasks (jsx:958) runs BEFORE alignAndScale and now calls
   clipPath.zOrder(ZOrderMethod.SENDTOBACK) (jsx:1002) on the released 'base-path'
   clipping mask. Log: "CLIP RELEASE: restored fill + sent clip path 'base-path' to back".
2. findPlacementPath(pastedDesign, true) (jsx:347, jsx:1300) picks the FIRST
   PathItem/CompoundPathItem in depth-first z-order as the scaling reference.
   Before PHR 010 the clipping mask 'base-path' (garment-shaped, full panel size)
   sat at the TOP of the group, so it was found first -> correct reference.
   After PHR 010 it sits at the BACK, so the first path found is now a small
   artwork path (the sword badge is a RasterItem which findPlacementPath skips,
   but its small sibling paths are not skipped and not named "logo").
3. alignAndScale (jsx:1211) computes scaleW/scaleH so the REFERENCE bounds fill the
   ~1701x2345pt panel, then resizes the WHOLE design by that factor -> the small
   reference path blows the entire sword logo up to full-panel size.

Evidence in debug_log.txt: traversal shows tiny 'unnamed' paths before 'base-path',
"sent clip path 'base-path' to back", then "Aligning using first path reference".

Suggested fix (not applied yet): make findPlacementPath prefer an item literally
named base-path/base_path/basepath before any first-found/largest fallback, so the
scaling reference no longer depends on z-order.

## Outcome

- ✅ Impact: User knows the expansion is a z-order regression from the PHR 010 clip-release fix, not a mockup problem.
- 🧪 Tests: none (read-only diagnosis)
- 📌 Follow-up: patch findPlacementPath to resolve by name first, then re-render the job to verify.
