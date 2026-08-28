---
id: 007
title: Fix vanishing badge fill + path diagnostics
stage: green
date: 2026-06-23
surface: agent
model: claude-opus-4-8[1m]
feature: production_automation
branch: main
user: zija9452
command: fix swatch color relink (round 2)
labels: ["illustrator", "extendscript", "color-management", "cmyk", "swatch", "deeprelink"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check (parse-only on copied .js) -> PASS
---

## Prompt

ye he mockup file jo k rgb ki he, ye he order ka cmyk ka export is me chest pr jo colors hen
skin and green color nhi a rha he shape a rha he bs, or dekho cyk color nhi a rha he number pr
and name pr jo chest pr he, again original script read kro, or dekho issue kahn he

(Job inspected: Backend/uploads/3c973423-7ebb-40ae-81a7-c7afb8232b34. Excel color_mapping only
defines yellow-color, black-color, base-color. The QAWH chest badge in the render lost its green
circle + skin scalloped border — only the white Q/AWH/H letters survived. Number 04 / name not
picking up the defined CMYK either.)

## Response snapshot

Read the live debug_log.txt + production_plan.json for the actual job (authoritative source) and
compared mockup vs Large_Front_Item1.jpg render.

Key finding: debug_log only logs TEXT items (applySpot logs guarded by `isText`). The badge LETTERS
(TextFrames) recolored fine, but the badge GREEN circle + SKIN scallop (PathItems) vanished. Root
cause: `deepReLink` only handled GroupItem / CompoundPathItem / PathItem / TextFrame and **silently
skipped any other item type** (PluginItem / live-effect / compound-shape / mesh). A skipped shape
keeps its dangling `MOCK_` spot reference, which renders as no-fill once `mockupDoc.close()` runs —
exactly the vanishing green/skin.

Edit applied (contained to mergeAndCleanupSwatches > deepReLink, no alignment/clip/text-replace
changes):
1. New `logPathColor(it)` helper logs every path/compound-path name + fill type (Spot name / RGB /
   CMYK / UNFILLED) so the next run shows precisely what each badge shape carries.
2. `deepReLink` now has an explicit `else` branch for non-standard item types: it recurses into
   `pageItems` if present and attempts generic fill/stroke relink, instead of skipping. This both
   diagnoses AND likely fixes the vanishing-shape bug.

## Outcome

- ✅ Impact: previously-skipped shape types now get relinked/detached from MOCK_ spots; full
  path-level visibility in debug_log for the next run.
- 🧪 Tests: node --check parse PASS; runtime verification pending next Illustrator run.
- 📁 Files: Backend/scripts/automate_production.jsx (deepReLink + logPathColor).
- 🔁 Next: re-run the job; inspect debug_log for `PATH '...'` lines around the badge and any
  `non-standard item type` lines. Confirm green/skin now fill. Number/name appearance-color capture
  is a separate follow-up (the number's character fill reads white [255,255,255]; its yellow lives
  in the appearance, so it never matches yellow-color — needs appearance-aware fill detection).
- 🧠 Reflection: silent type-skipping in a recursive relink is a classic "works for the majority,
  drops the odd one" bug; logging only text hid it.

## Evaluation notes (flywheel)

- Failure modes observed: deepReLink skipped non-standard PathItem types; dangling MOCK_ spot after
  mockup close renders empty.
- Graders run and results (PASS/FAIL): node --check PASS.
- Next experiment (smallest change to try): if badge still empty after re-run, the `PATH`/`non-standard
  item type` log lines will name the exact typename — then expand that item or convert its appearance
  before close. For number/name CMYK, add appearance-expansion for FILL (not just stroke) and prefer a
  named/spot color found via expand over a plain white character fill.
