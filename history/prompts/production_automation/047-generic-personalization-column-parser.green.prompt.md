---
id: 047
title: Generic Personalization Column Parser
stage: green
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["phase-1", "excel-parser", "personalization-columns", "sleeves", "logo", "backward-compat"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/excel_service.py (modified - generic <Part> <Field> column parser, personalization dict, python grouping, LLM summary sanitized)
 - scratchpad/test_parser.py (created - 40-check test suite)
tests:
 - 40/40 checks passed via Backend/.venv python - column matcher units (22), standard template round-trip (8), back-only aggregation (5), per-side sleeves (3), plain columns + Sr No exclusion (4), logo column (1), front-vs-bare precedence (2)
---

## Prompt

continue

(Continuation of the placement-config plan. Edge cases resolved via AskUserQuestion:
logo = sometimes per-player (parse Logo columns), Excel-vs-form conflict = Excel wins +
warning, plain column on two personalized parts = same value on both. Sleeve edge case
resolved earlier: support both "Sleeve Number" (shared) and "Left/Right Sleeve Number".)

## Response snapshot

Implemented Phase 1 - the generic Excel personalization parser in excel_service.py:

- _match_personalization_column(): token-based "<Part> <Field>" matching. Parts:
  front, back, sleeve-left, sleeve-right, sleeve-both (bare "Sleeve <field>"), neck.
  Fields: name, number (number/num/no/#), logo. Bare "Sleeve" stays the length column.
  Unknown prefixes ("Player Name", "Jersey Number") fall back to bare fields, but short
  number aliases with unknown prefixes ("Sr No", "S.No") are rejected as serial columns.
- Each row now carries a nested personalization dict ({part: {field: value}}, bare
  columns under "unspecified"); grouping is pure Python keyed on
  size+sleeve+personalization JSON, preserving sheet order and aggregating quantities.
- Backward compatible: legacy flat fields (name/back_name/number/back_number) still
  produced - front column preferred over bare for name/number. Bug fixed en route:
  the old parser would have matched "Left Sleeve Number" as the FRONT number column.
- LLM summary sanitized: personalization dict is excluded from the agent's order list
  until the deterministic plan builder (Phase 4) consumes it, so current LLM behavior
  is unchanged for legacy sheets.

Verified: 40/40 checks including the real Standard_Order_Template.xlsx (leading-zero
"07" preserved at both legacy and dict level, colors parsed, summary clean).

## Outcome

- ✅ Impact: Excel format is now the full standard - every "<Part> <Field>" column parses into structured data; existing orders behave identically.
- 🧪 Tests: 40/40 passed (unit + integration against the real template)
- 📁 Files: 1 modified, 1 test script
- 🔁 Next prompts: Phase 2 mockup scan JSX + endpoint; Phase 4 deterministic plan builder consuming personalization dict (routing rules: Excel wins + warning, plain value applies to all personalized parts)
- 🧠 Reflection: The "Sr No" serial-column trap justified rejecting short number aliases under unknown prefixes - the legacy substring matching would eventually have bitten someone with "S.No" sheets too.

## Evaluation notes (flywheel)

- Failure modes observed: none in tests; noted legacy parser mis-binding "Left Sleeve Number" to front number as a latent bug now fixed
- Graders run and results (PASS/FAIL): test suite PASS (40/40)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): scan_mockup.jsx writing detected_placeholders.json (Phase 2)
