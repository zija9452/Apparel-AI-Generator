---
id: 006
title: Fix swatch CMYK relink and missing fill
stage: green
date: 2026-06-23
surface: agent
model: claude-opus-4-8[1m]
feature: production_automation
branch: main
user: zija9452
command: fix swatch color relink
labels: ["illustrator", "extendscript", "color-management", "cmyk", "swatch"]
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

ok fix kro , or bg ka or baki shapes pr to sahi rgb se cmyk color a rha he , bs kch shpes me issue ho rha he , ise fix kro

(Context: mockup RGB swatches; Excel/JSON provides CMYK overrides keyed by the same swatch name. Two bugs reported: (1) named swatches still link to mockup RGB instead of the JSON CMYK; (2) default RGB/CMYK swatches with no JSON override do not fill at all in the order file. Background and most shapes already convert correctly — only some shapes break.)

## Response snapshot

Diagnosed root causes in `mergeAndCleanupSwatches > applySpot > processSubColor`:
- Bug #2 (missing fill): `processSubColor` returned `null` for any SpotColor whose underlying ink was CMYK (e.g. a swatch named `C=0 M=0 Y=0 K=100`) or other non-RGB/Gray type. On null, `applySpot` left the path untouched, so it kept a cross-document mockup-spot reference that dangled once `mockupDoc.close()` ran -> rendered as no-fill.
- Bug #1 (override miss): name-match only fires for Spot colors; process/CMYK named swatches fell to value-based "smart sense" which (a) was not indexed for CMYK-defined swatches and (b) used a brittle diff<15 threshold.

Applied 3 targeted edits (no changes to alignment/clipping/text logic):
1. `mockupColorMap` now also indexes CMYK-defined named swatches via their RGB equivalent (convertSampleColor) so value matching can reach them.
2. `processSubColor` unwraps any spot to its underlying ink generically (RGB/CMYK/Gray) and never returns null for a paintable ink.
3. New fallback: when no override matches and ink is CMYK, return a fresh exact-copy CMYKColor (same values, detached from the mockup swatch) -> fixes the no-fill shapes. Smart-sense threshold raised 15 -> 20.

## Outcome

- ✅ Impact: Default colors always fill with concrete CMYK (no dangling refs); named swatches reach CMYK override via spot-name or value match.
- 🧪 Tests: node --check parse PASS; runtime verification pending next Illustrator run (look for log "copied exact CMYK ink (detached from mockup swatch)").
- 📁 Files: Backend/scripts/automate_production.jsx (3 edits in processSubColor / mockupColorMap).
- 🔁 Next prompts: Run a job and inspect renders + debug_log for the new detach line; confirm previously-empty shapes now fill.
- 🧠 Reflection: Name-link only works for true Spot colors; value-based fallback must be lossless and detached to survive mockup-doc closure.

## Evaluation notes (flywheel)

- Failure modes observed: null return on CMYK-ink spots; cross-document spot reference dangling after mockup close.
- Graders run and results (PASS/FAIL): node --check PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): if any named override still misses, convert mockup process swatches to true Spot at isolation so spot-name match becomes authoritative.
