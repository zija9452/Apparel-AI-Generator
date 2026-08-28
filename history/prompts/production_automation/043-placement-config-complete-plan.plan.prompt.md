---
id: 043
title: Placement Config Complete Plan
stage: plan
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["personalization", "placement-config", "excel-format", "checkbox-form", "mockup-scan", "architecture-plan"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/excel_service.py (planned: generic <part> <field> column parser)
 - Backend/main.py (planned: scan endpoint, confirm-placement endpoint, deterministic plan builder)
 - Backend/scripts/automate_production.jsx (planned: placeholder blanking, per-side sleeve replacements)
 - Backend/scripts/scan_mockup.jsx (planned: new placeholder scan script)
 - Frontend/my-app/components/ProductionPlan.tsx (planned: personalization matrix form)
tests:
 - none yet (planning stage)
---

## Prompt

great idea , but kbhi kbhi personalization front name and number , logo isi trha back pr , sleeves pr , right sleeve , left sleeve pr neck pr , to phr excel file ka standard format kia hona chahiye he ??? ya hm jb ye sari mockup(test print ki file ai ko den ge to from bna len checkbox ka , k agr check ho front pr to front pr changes hen ?? is ka mjhe complete plan btao k kese implement kr skte hen hm ??

## Response snapshot

Delivered a complete implementation plan built around a single artifact: placement_config
(per-part flags for name/number/logo across front, back, sleeve-left, sleeve-right, neck),
resolved from 3 sources with priority: Excel explicit columns > UI checkbox form > mockup
placeholder scan (scan pre-fills the form; user confirms; Excel wins conflicts with warning).

Key design points:
- Excel standard: "<Part> <Field>" columns (Front Name, Back Number, Left Sleeve Number,
  Sleeve Number = both sleeves, Neck Name); un-prefixed Name/Number routed by the form.
  Logo stays out of Excel (order-level, not per-player) — checkbox only.
- UI: Personalization Matrix (parts x name/number/logo checkboxes), pre-checked from a
  ~10s JSX mockup scan reusing getSourceView group-matching (jsx:1391-1404); inline
  warning when a checked cell has no placeholder in the mockup.
- Plan generation becomes deterministic Python (promote _enforce_personalization to the
  main builder); LLM keeps only judgment tasks (sleeve length, accessories).
- JSX safety net: blank any un-replaced NAME/NUMBER placeholder so literal placeholder
  text never prints.
- Preflight validation before render: column-without-checkbox and checkbox-without-
  placeholder mismatches surfaced in UI.

6 phases: (1) generic Excel parser, (2) mockup scan endpoint + scan_mockup.jsx,
(3) frontend matrix form, (4) deterministic plan builder, (5) JSX safety nets,
(6) preflight report. Each shippable independently; 1+4 remove LLM guessing.

Edge cases asked before implementation (per user's standing rule):
1. Sleeve number same on both sides vs per-side columns — support both patterns?
2. Is logo ever per-player (needs Excel column) or always order-level?
3. Excel column filled but form checkbox unchecked — who wins? (recommended: Excel + warning)
4. Plain Name checked on two parts with only one plain column — same value both, or error?

Suggested ADR: placement-config-three-source-routing. Offered /sp.specify to formalize.

## Outcome

- ✅ Impact: User has a complete phased implementation plan covering Excel standard, checkbox UI, mockup scan, deterministic routing, and validation.
- 🧪 Tests: none yet (planning stage)
- 📁 Files: none modified; plan references 5 files to be touched
- 🔁 Next prompts: answer 4 edge cases; run /sp.specify for the feature; optionally /sp.adr placement-config-three-source-routing
- 🧠 Reflection: Anchoring everything on one placement_config artifact keeps Excel format, UI form, and mockup scan from becoming three competing sources of truth.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Phase 1 generic column parser with backward-compat fields
