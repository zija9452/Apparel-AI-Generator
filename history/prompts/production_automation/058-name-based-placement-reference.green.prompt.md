---
id: 058
title: Name Based Placement Reference
stage: green
date: 2026-07-16
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["findPlacementPath", "base-path", "alignAndScale", "z-order-regression-fix", "scaling"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (modified - findPlacementPath: name-first lookup for 'base-path' when useFirstFound=true)
tests:
 - none run (needs Illustrator re-render of job 426d1caf to verify; user runs jobs via frontend)
---

## Prompt

kahi aesa to nhi k pehle base-path delete ho rha he , then mockup align and scae ho rha he ??? or fix kese krna he ise ?

## Response snapshot

1. Answered the ordering question: NO - base-path is deleted AFTER alignAndScale
   (jsx flow: releaseInternalClippingMasks -> findPlacementPath/alignAndScale ->
   removeBasePaths), confirmed by both code and debug_log.txt sequence. The bug is
   only that PHR 010's SENDTOBACK moves base-path to the back of its group before
   findPlacementPath picks the "first path in z-order" as scaling reference.

2. Edge case asked (per user's standing rule): fallback when a mockup has no path
   named base-path. User chose: keep current first-path fallback (smallest diff,
   existing mockups unchanged).

3. Fix applied in findPlacementPath (Backend/scripts/automate_production.jsx):
   when useFirstFound=true (the mockup-design reference call only), first search
   recursively for a PathItem/CompoundPathItem whose normalized name is 'basepath'
   (matches base-path/base_path/Base Path) and return it; otherwise fall through to
   the existing first-found logic. Pattern-panel calls (jsx findPlacementPath without
   useFirstFound) are untouched. Logs "Placement reference: found path named ..."
   when the named path is used.

Bundle note: each job regenerates automation_bundle.jsx from
Backend/scripts/automate_production.jsx (illustrator_automation.py:315), so the next
render picks up the fix automatically; old session bundles stay as they were.

## Outcome

- ✅ Impact: Scaling reference no longer depends on z-order; blown-up front design (job 426d1caf, Black Polo 1.ai) should scale correctly on re-render.
- 🧪 Tests: pending - re-run the same order through the frontend and check 2XL_Front_Item3.jpg proportions.
- 📌 Follow-up: if a future mockup lacks a named base-path AND its first path is small, the old fragility remains (user explicitly accepted this fallback).
