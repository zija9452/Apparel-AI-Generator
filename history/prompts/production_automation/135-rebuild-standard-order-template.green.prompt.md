---
id: 135
title: Rebuild Standard Order Template Columns
stage: green
date: 2026-08-19
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat instruction)
labels: ["excel", "template", "columns", "logo", "openpyxl"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Standard_Order_Template.xlsx (rebuilt)
 - Frontend/my-app/public/Standard_Order_Template.xlsx (rebuilt, served at /Standard_Order_Template.xlsx)
 - scratchpad/build_template.py (generator, not committed)
tests:
 - Backend/.venv python -c "parse_order_excel(...)" on the rebuilt file - 5 rows, all 12 columns mapped, leading zeros "07"/"05" preserved, Colors sheet parsed, project title extracted
---

## Prompt

excel file bna do ye sheet 1 ki , ye standard he na ??

## Response snapshot

The template that already existed was wrong in both directions. Its 8 columns
were:

`Size | Sleeve | Front Name | Front Number | Back Name | Back Number | Sleeve Number | Neck Name`

- It shipped `Sleeve Number` and `Neck Name`, which the parser detects but the
  plan builder never applies (task #1) - a user filling them gets a blank print
  and no error.
- It omitted all six Logo columns, which DO print via `main.py:409-441`.

Rebuilt both copies with the 12 columns that actually work end to end:

`Size | Sleeve | Front Name | Front Number | Front Logo | Back Name | Back Number | Back Logo | Neck Logo | Left Sleeve Logo | Right Sleeve Logo | Sleeve Logo`

Style matched to the old file so the download looks unchanged: title in A1,
blank row 2, header row 3 (navy `FF25445C`, bold white), sample rows banded
`FFEEF2F6`, freeze at `A4`, and `@` (Text) number format pre-applied to the two
Number columns for 200 rows so a typed `07` keeps its zero.

READ ME sheet rewritten: the `<Part> <Field>` naming rule, `Sleeve` = length not
personalization, `Sleeve Logo` vs `Left/Right Sleeve Logo` (use one or the
other), logo cell must be the exact Logo Library group name, `Sr No`/`S.No`
ignored, bare `Name`/`Number` used instead of - not alongside - the Front
columns, and an explicit list of the not-yet-supported neck/sleeve Name+Number
columns.

Verified by running the rebuilt file through the real
`excel_service.parse_order_excel`: 5 rows, `front` gets name+number+logo, `back`
gets name+number, `neck`/`sleeve-left`/`sleeve-right` get their logos, `07` and
`05` survive, Colors sheet gives BODY/STRIPE/TEXT CMYK, title reads back as
"ABC SPORTS - Team Jersey Order 2026".

Left untouched: `Frontend/my-app/app/order-guide/page.tsx` still lists the old
`ALL_COLUMNS` (lines 6-17) and 10-cell `SAMPLE_ROWS`, so the guide page now
disagrees with the file it links to at line 113.

## Outcome

- ✅ Impact: The downloadable template now matches what the pipeline actually prints - no dead columns, no missing Logo columns.
- 🧪 Tests: Parsed through `excel_service.parse_order_excel` in `Backend/.venv` - all 12 columns mapped, leading zeros intact.
- 📁 Files: `Standard_Order_Template.xlsx` and its `public/` copy rebuilt (13115 -> 9602 bytes).
- 🔁 Next prompts: Update `order-guide/page.tsx` `ALL_COLUMNS`/`SAMPLE_ROWS`/`SCENARIOS` to match; then task #1 (wire neck/sleeve Name+Number).
- 🧠 Reflection: The template had drifted from the parser in both directions at once - worth a check whenever a personalization column is added or retired.

## Evaluation notes (flywheel)

- Failure modes observed: Shipped template advertised columns that silently do nothing, and hid columns that work.
- Graders run and results (PASS/FAIL): PASS - real-parser round trip on the rebuilt file.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): A test that asserts the template's header row equals the set of (part, field) slots the plan builder consumes, so drift fails loudly.
