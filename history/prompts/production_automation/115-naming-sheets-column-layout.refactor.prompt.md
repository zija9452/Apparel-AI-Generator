---
id: 115
title: Naming sheets column layout
stage: refactor
date: 2026-08-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["documentation", "excel", "formatting", "naming", "reference"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/docs/Mockup_Naming_Reference.xlsx
 - Backend/scripts/docs/Pattern_Naming_Reference.xlsx
tests:
 - both workbooks reloaded with openpyxl - 9 sheets total, 0 merged ranges, 0 cells missing a left/right border, 0 blank cells, autofilter + freeze pane on every sheet
---

## Prompt

Mockup ki and pattern ki , dono files column wise bnani he column border lgao ,

## Response snapshot

Rebuilt both workbooks from ONE shared `table()` renderer (previously two
independent scripts with drifting styling), so every sheet is now a real column
table rather than a mix of tables and merged prose blocks.

Changes:

1. **Read Me sheets converted from label/paragraph pairs into 3-column tables**
   (Topic / Rule / What it means). They were the only sheets using merged cells;
   merged ranges across both books are now **0**.
2. **Column borders** - the border scheme is deliberately asymmetric so columns
   read as columns: left/right = MEDIUM in `4472C4`, top/bottom = THIN light grey.
   Verified: **0 cells** anywhere in either book missing a left/right border.
3. **No blank cells** - the renderer substitutes an em dash for any empty value.
   An empty column reads as "this row is missing data" rather than "not
   applicable". Was 7 blanks, now 0.
4. Freeze pane and autofilter on every sheet, including the Read Me sheets.
5. Section-tinted first column carried over on the two big sheets; the
   Checklist's "Blocks the job?" column keeps its red/green fill and is centred.

Final shape - Mockup book: Read Me 12 · Master List 49 · Checklist 17 ·
Reserved Names 4. Pattern book: Read Me 15 · Pattern Names 18 · Size Prefixes 15
· Size Tag Words 9 · Inside a Piece 5.

Content-wise the Pattern book's "Size Tag Words" sheet was also restructured
while reformatting: the global word list and the per-size single-letter aliases
used to share one cell with a prose "Scope" note; they are now two separate
columns plus a "Why" column.

## Outcome

- ✅ Impact: Both references are now uniformly filterable/sortable tables with
  the same styling, generated from one script so they cannot drift apart again.
- 🧪 Tests: Reload assertions on borders, merges, blanks, autofilter and freeze
  panes across all 9 sheets.
- 📁 Files: Mockup_Naming_Reference.xlsx, Pattern_Naming_Reference.xlsx (both regenerated)
- 🔁 Next prompts: Still open from PHR 114 - the stale Placket comment at
  automate_production.jsx:174, and the silent zero-match case in the rib/cuff block.
- 🧠 Reflection: Two generator scripts for two sibling documents was the actual
  defect; the formatting request just exposed it. One renderer, two data sets.

## Evaluation notes (flywheel)

- Failure modes observed: sibling documents built by copy-pasted scripts drift in
  styling; merged cells silently break filtering and sorting; blank cells are
  ambiguous between "empty" and "not applicable".
- Graders run and results (PASS/FAIL): PASS - 0 merged, 0 missing borders, 0 blanks.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): keep the generator in the repo (not
  the scratchpad) so the sheets can be regenerated when the JSX naming changes.
