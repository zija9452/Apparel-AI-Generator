---
id: 021
title: Parse Back Number column
stage: green
date: 2026-07-08
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["excel", "back-number", "personalization", "plan-enforcement"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/excel_service.py
 - Backend/main.py
tests:
 - scratchpad test_fix.py: parse_order_excel with Front Name/Back Number/Back Name/Size sheet (PASSED)
 - scratchpad test_fix.py: _enforce_personalization injects NUMBER on back items from the user's actual broken plan JSON (PASSED)
---

## Prompt

Front Name    Back Number     Back Name     Size Jordan    666    Jordan     Medium   Abbie    13    Auntie     Medium   Bri    29    Prima     Medium   Julio    10    Rocha     Medium   Ryan    11    Smitty     Medium   Shannon    5    Dennis     Medium   meri excel shet ye he , lekin json ye aya he is me number nhi aya he. {full plan JSON with 12 front/back items carrying only NAME replacements, no NUMBER — see conversation; job_id 82f40622-d487-4903-8693-9bc3903a9eaf}

## Response snapshot

Root cause: `excel_service.py` matched the number column only by exact names ('number', 'no', 'num'), so the "Back Number" column was never parsed — every row's number was "" and the LLM plan had no NUMBER replacements. Fixes: (1) number column detection is now substring-based (excluding 'back'/'unnamed'), and a new `back_number` field is parsed like `back_name` and included in grouping and the AI summary; (2) agent instructions now map `back_number` → NUMBER replacement on the 'back' part; (3) `_enforce_personalization` in main.py now computes Excel-demanded layers per part (name/back_name → NAME, number/back_number → NUMBER) and rebuilds items from Excel rows whenever the agent omitted a demanded layer — even if item counts match. Verified with the user's exact sheet + broken plan: all 6 back items get NAME+NUMBER (Jordan/666, Auntie/13, Prima/29, Rocha/10, Smitty/11, Dennis/05), fronts stay NAME-only.

## Outcome

- ✅ Impact: 'Back Number' Excel columns now flow into the production plan as NUMBER replacements on the back part, guaranteed by deterministic enforcement even if the LLM drops them.
- 🧪 Tests: Both scratchpad tests passed with the Backend venv Python.
- 📁 Files: Backend/services/excel_service.py, Backend/main.py.
- 🔁 Next prompts: Confirm single-digit zero-padding (5 → "05") is desired; run a real job end-to-end.
- 🧠 Reflection: Excel is the source of truth; plan enforcement must check layer coverage, not just item counts.

## Evaluation notes (flywheel)

- Failure modes observed: LLM silently dropped an entire Excel column from the plan.
- Graders run and results (PASS/FAIL): test_fix.py PASS (2/2 assertions groups)
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): none
