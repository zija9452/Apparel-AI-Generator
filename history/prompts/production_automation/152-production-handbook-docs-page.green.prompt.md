---
id: 152
title: Production Handbook Docs Page
stage: green
date: 2026-08-21
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["docs", "frontend", "naming-reference", "mockup", "pattern", "excel-template", "client-facing"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/app/docs/page.tsx (new)
 - Frontend/my-app/components/AppHeader.tsx (Docs nav entry)
 - Frontend/my-app/app/page.tsx (handbook card in the left rail)
tests:
 - npm run build - PASS, 5 static routes
 - curl 200 on /docs and on all three downloadable workbooks
 - every documented name spot-checked against automate_production.jsx / illustrator_automation.py / main.py / excel_service.py
---

## Prompt

excel ka templete kahn se liya h ?? kon sa he ye ??

(follow-up) mockup and pattern ki layers ki bhi template rkhen he , ye bhi dekh lo , or order guide me , ya kahi or documentation ban do , jese chapter topic wise , k kia kese perform krta he without em desh , or professional bnana he production client k liye , k hr cheez kese work krti he

(follow-up) docs to automation me se dekh kr bne gi na , k us me kia kia kese hoga

## Response snapshot

Built `/docs`, a nine-chapter handbook written from the automation code rather than from memory:

1. How the system works (the four stages, mockup vs pattern, timing and the watchdog)
2. The files you provide, plus download cards for all three reference workbooks
3. Order Excel sheet (row layout, the `<Part> <Field>` column rule, what is enforced today)
4. Mockup layer template (part views, inside-the-group names, matching layers, reserved names)
5. Pattern layer template (`{Size} {Part}`, Universal accessories, size code to size word mapping)
6. Options reference (expandable per option: what it does, what it needs, what happens if missing)
7. Running a job (progress stages, Continue vs Run again vs Stop)
8. What you get back (every file in the ZIP)
9. Troubleshooting

Sources checked while writing: `resolvePartLabel` (pattern naming map), `getSourceView` (mockup lookup order and its accepted spellings), the eight pre-flight blocks in `illustrator_automation.py`, `_enforce_personalization` / `_enforce_extra_logos` in `main.py`, `_match_personalization_column` in `excel_service.py`, `RENAME_SIZE_WORDS` / `SIZE_ALIAS_GROUPS`, the youth and adult-A prefix handling, and a real job's renders folder for the ZIP contents.

The user had already placed `Mockup_Naming_Reference.xlsx` and `Pattern_Naming_Reference.xlsx` in `public/`. Both were read and spot-checked against the code (all accurate), and their content was folded into chapters 4 and 5, including three things the first draft had missed: `base-path` as the most important mockup name, `Back Label`, and the `rib`/`cuff`/`box` line name. All three workbooks are now downloadable from chapter 2.

## Findings raised

- Two different `Standard_Order_Template.xlsx` files exist. The repo root one (11.7KB, 19 Aug, generated in PHR 135 and later extended to 20 columns) is not the one being served. `public/` holds a different 15.5KB file dated 20 Aug with 18 headers, some carrying line breaks inside the header text.
- `Neck Name`, `Neck Number`, `Sleeve Name`, `Sleeve Number` and the Left/Right sleeve name/number columns are parsed by `_match_personalization_column` but never rebuilt from Excel rows: `_enforce_personalization` only covers `front` and `back`, and `_enforce_extra_logos` only covers logos. Shipping those columns in a template invites a blank print with no error.
- The interactive order guide still demos 10 columns including `Sleeve Number` and `Neck Name`, matching neither template.

## Outcome

- ✅ `/docs` live, linked from the header, the job page rail and the landing page.
- ✅ Every claim traced to code, not to prior assumptions.
- ⚠️ Three template inconsistencies surfaced for the user to decide on.
- 🔁 Next prompts: pick one canonical order template, then sync the order guide's column demo to it.
