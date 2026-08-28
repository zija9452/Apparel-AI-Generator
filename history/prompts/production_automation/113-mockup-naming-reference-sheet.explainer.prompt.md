---
id: 113
title: Mockup naming reference sheet
stage: explainer
date: 2026-08-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["naming", "mockup", "documentation", "excel", "full-button", "hoodie", "reference"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/docs/Mockup_Naming_Reference.xlsx
tests:
 - workbook re-opened with openpyxl: 4 sheets, 48 master rows across 7 sections, 16 checklist rows (7 blocking), autofilter + freeze panes intact
---

## Prompt

Mockup me jitne bhi name hoty hen , normal jersey me , full button and half button me , mjhe sb ki list do idhr , k kia kia nam hoty hen ??

(follow-up) english me , mjhe excel sheet bna do is pr yhi sb

## Response snapshot

Compiled every mockup-side name the automation looks for, read out of the code rather
than from memory: `automate_production.jsx` (`getSourceView`, `partMap`,
`mockupHasBothSleeveSides`, `mockupHasBothFrontSides`, `hoodieFindMockupVariant`,
`_smFindArmholeGroup`, `findBackLabelArt`, `pmFindMatchLines`, `ssFindNamed`,
`removeBasePaths`, `processLocalTagLabel`) plus `illustrator_automation.py`'s
pre-flight `_mockup_has_*` checks, which is what decides whether a missing name
blocks the job or only warns.

Delivered as `Backend/scripts/docs/Mockup_Naming_Reference.xlsx` (next to
FULL_BUTTON_JERSEY.md), four sheets:

- **Read Me** - name normalisation (lowercase + strip non-alphanumerics, so
  `Front Left` = `front_left` = `FRONTLEFT`), the three match kinds
  (exact / starts-with / contains), mockup-has-no-size-prefix vs
  pattern-has-one, why `base-path` must be drawn at 3pt (1pt vs the pattern's
  pinned 3pt = 99.79% instead of 100%), and where warnings land.
- **Master List** - 48 rows, 7 sections, filterable: Section / Piece / Name to use /
  Other accepted names / Match type / Where it goes / Required when / Notes.
- **Checklist** - 16 rows, one per garment type or feature, with a red/green
  "Blocks the job?" column. 7 features block (Local Tag, Center match, Pattern
  match, Side Seam match, Armhole match, Hoodie, Hood Center match); Full Button's
  own Front Left/Right split only warns and falls back to a single panel.
- **Reserved Names** - `design_clip_group`, `TAG-MASK`, `MOCK_*` swatch prefix.

Two findings worth calling out to the user:

1. **There is no "half button" mode in the code** - only `full_button_jersey`.
   A half-button jersey is a normal jersey: single `Front` plus `Placket`
   (shared Universal piece) or `Patti` (per-size). Said so plainly rather than
   inventing a naming convention for it.
2. **Hoodie needs no `Pocket` group in the mockup** - the pocket's artwork is
   clipped out of the Front's own design; only the pattern file needs
   `{Size} Pocket`.

## Outcome

- ✅ Impact: The naming contract now exists as a shareable artifact instead of
  living only in code comments spread across ~7000 lines.
- 🧪 Tests: Workbook reloaded and asserted (sheets, row counts per section,
  blocking count, autofilter/freeze).
- 📁 Files: Backend/scripts/docs/Mockup_Naming_Reference.xlsx (new)
- 🔁 Next prompts: If a new named feature is added, add its row here and to the
  Checklist's "Blocks the job?" column in the same commit.
- 🧠 Reflection: The blocking-vs-warning split is the part a designer actually
  needs and it is the least visible in the code - it lives in Python pre-flight,
  not in the JSX where the names are used.

## Evaluation notes (flywheel)

- Failure modes observed: names are spread across three mechanisms (exact set,
  starts-with prefix, substring), and a reader scanning the JSX alone would miss
  the pre-flight gate entirely.
- Graders run and results (PASS/FAIL): PASS - reload check matched the intended
  shape (48/16/4 rows, 7 blocking features).
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): a tiny script that greps the JSX for
  literal name targets and diffs them against this sheet, so the doc cannot drift.
