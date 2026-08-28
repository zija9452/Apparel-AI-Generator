---
id: 022
title: Exact numbers no padding
stage: green
date: 2026-07-08
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["excel", "numbers", "leading-zeros", "dtype-str"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/excel_service.py
 - Backend/main.py
tests:
 - scratchpad test_fix.py: mixed numeric/text Back Number cells (666, 13, 29, 10, "05", 5) parse exactly as written (PASSED)
 - scratchpad test_fix.py: _enforce_personalization carries exact numbers into the plan (PASSED)
---

## Prompt

hn jo me numbers dun exact whi ayen , jese agr 5 dun to hi aye , or agr 05 dun to 05 hi aye , edge cases puch lena ,

(clarification after questions:) jo excel me he , bs wesa hi aye , agr hmy 5 k sath zero chahiye hota he to hm is trha likhte hen '05 to ye string me convert ho jata he , to 05 show hota he excel pr

## Response snapshot

Removed all zero-padding from `format_num` in excel_service.py: numbers now print EXACTLY as the Excel cell shows them (numeric 5 -> "5", text '05 -> "05", whole floats lose the ".0", genuine decimals pass through). Found and fixed a deeper bug while testing: `pd.read_excel` coerces a mixed number column to int64, silently turning a text "05" cell into 5 before our code ever sees it — openpyxl preserves the string in the file, pandas destroys it on read. Fixed by reading the Orders sheet with `dtype=str`, so every cell arrives exactly as written (the color sheet read is untouched). Also updated the agent instruction example so the LLM never re-pads ("5" stays "5", "05" stays "05"). Verified with mixed cells: 666/13/29/10 numeric, "05" text, 5 numeric -> "666","13","29","10","05","5".

## Outcome

- ✅ Impact: Numbers flow through parse -> plan -> Illustrator exactly as typed in Excel; the user's '05 text-cell convention now works end-to-end.
- 🧪 Tests: Both scratchpad tests passed with Backend venv Python.
- 📁 Files: Backend/services/excel_service.py (dtype=str + format_num), Backend/main.py (instruction wording).
- 🔁 Next prompts: Run a real order to confirm; note that a NUMBER-formatted Excel cell showing 05 via custom format still yields 5 (Excel stores 5) — only text cells ('05) keep the zero.
- 🧠 Reflection: pandas read_excel type coercion can silently destroy user data; dtype=str is the safe default for identity-critical columns.

## Evaluation notes (flywheel)

- Failure modes observed: pd.read_excel coerced mixed column to int64, dropping the leading zero from a text "05" cell.
- Graders run and results (PASS/FAIL): test_fix.py PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): none
