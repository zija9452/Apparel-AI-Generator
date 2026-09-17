---
id: 197
title: Sync Naming Reference Workbooks
stage: green
date: 2026-09-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["docs", "naming", "xlsx", "reference", "openpyxl"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/public/Mockup_Naming_Reference.xlsx
 - Frontend/my-app/public/Pattern_Naming_Reference.xlsx
 - Backend/scripts/docs/Mockup_Naming_Reference.xlsx
 - Backend/scripts/docs/Pattern_Naming_Reference.xlsx
tests:
 - all four workbooks reopen cleanly (openpyxl) and pass zipfile.testzip()
 - per-cell font / fill / border / alignment compared against the originals
 - originals backed up before the first write and restored once to redo a styling bug
---

## Prompt

ok , kr do ,

(accepting the offer at the end of PHR 196 to bring
`Mockup_Naming_Reference.xlsx` and `Pattern_Naming_Reference.xlsx` - both
written 2026-08-20 and downloadable from docs chapter 02 - up to the same
code-verified state as the docs page.)

## Response snapshot

Rewrote both workbooks from the same JSX lookups PHR 196 verified, with a
script that reuses the existing files' own fonts, fills, borders, alignment and
column widths so only the rows changed. Both `public/` copies and the
`Backend/scripts/docs/` copies are now identical.

**Mockup_Naming_Reference.xlsx**

- `Master List` grew a **Match type** column (Exact / Starts with / Contains).
  The Read Me had told readers to consult that column since day one and the
  column did not exist.
- Rows added that were missing entirely: `team name`, `remove`,
  `LEFT SLEEVE LOGO` / `RIGHT SLEEVE LOGO`, and the bare `Sleeve` fallback.
- Rows corrected: sleeve aliases (`SS`, `LS`, `Full Sleeve`, all ten per-side
  spellings), `side` / `shoulder` (either word order, trailing number, and the
  object-Note channel - the two rows were half-blank before), `Match_` (the
  prefix is `match`), the hood halves (left/right as a SUBSTRING, so
  `2XL Right Hood` is fine), and `base-path` (only three spellings).
- The **LOGO fallback** is now written down in three places - its own Master
  List row, the Checklist, and Read Me row 8. Any panel that cannot find one of
  its own names renders the logo group's artwork instead of failing, which is
  how a misspelt `Back` becomes a plausible-looking wrong panel.
- `Checklist` gained Hoodie Jersey, Get mockup neck Text color, Team name keeps
  its width, Logo personalisation, Armhole correction method and Preview
  renders; Design scale mode's stale "Height only / Both axes" became the two
  modes the form actually offers; both hood garments now list
  `{Size} Rib & Cuff` as required (see PHR 195).
- Deleted `Sheet1` - a dead, unreferenced copy of an older Master List column
  that no data validation pointed at and that now disagreed with the sheet it
  was copied from.

**Pattern_Naming_Reference.xlsx**

- `Pattern Names`: the stray **Sizes** column was a leftover dropdown source
  that did not line up with its own rows (row 3 "XL Front" was labelled "XS");
  it is now **Other accepted names**, carrying the real alias lists - `SS`/`LS`,
  `Half`/`Full Sleeve`, the per-side forms, and the fact that `{Size} Cuff` and
  `{Size} Rib` are probed BEFORE the canonical `{Size} Rib & Cuff`.
- Fixed a duplicated Long Sleeve row that showed Short Sleeve examples, and the
  `XL Right Left` typo.
- `Size Prefixes`: "Pattern prefix MUST be" became "Canonical pattern prefix"
  plus a new column listing every other spelling the job also probes; toddler
  (1T-10T) and infant months (1M-12M) added, having been absent entirely.
- `Read Me`: new row for the **two pattern files** - adult and youth are graded
  separately, neither is required, and the size decides which is searched.

`Size Tag Words` and `Inside a Piece` were checked against
`RENAME_SIZE_WORDS` / `SIZE_ALIAS_GROUPS` (jsx:104-136) and `findPlacementPath`
and needed no change.

## Outcome

- ✅ Impact: the two files designers actually download now match the code, and
  the Read Me no longer points at a column that does not exist
- 🧪 Tests: all four files reopen in openpyxl, pass `zipfile.testzip()`, and
  their per-cell styling matches the originals
- 📁 Files: both workbooks in `public/` and their copies in
  `Backend/scripts/docs/`
- 🔁 Next prompts: `public/Standard_Order_Template.xlsx` is the third download
  on that page and has not been checked against the Excel parser
- 🧠 Reflection: caught my own styling bug by dumping fonts and borders rather
  than trusting the write - column A had been given the header row's style on
  every data row, which reads as a second header. Restored from the backup
  taken before the first write and redid it

## Evaluation notes (flywheel)

- Failure modes observed: a Read Me referencing a column that was never added;
  a dropdown source column left in a shipped sheet and misread as data; my own
  first pass painting data rows with a header style
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): back up any binary asset before the
  first write, not after the first failure - it is what made the styling redo
  a one-line fix instead of a rebuild
