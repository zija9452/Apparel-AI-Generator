---
id: 176
title: PARM Errors Fixed Or Not
stage: explainer
date: 2026-09-04
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat question)
labels: ["parm", "illustrator", "rollback", "diagnosis", "knuckle-headz"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (read only - no edits)
 - Backend/services/illustrator_automation.py (read only - no edits)
 - C:/Production/Knuckle_Headz_Mint_Order/Knuckle_Headz_Mint_Order/parm_errors.txt (read)
 - C:/Production/Knuckle_Headz_Mint_Order/Knuckle_Headz_Mint_Order/debug_log.txt (read)
tests:
 - none (diagnosis only)
---

## Prompt

PARM ERRORS - 2 PANEL(S) FAILED. CHECK THESE MANUALLY.Illustrator raised error 1346458189 ('PARM') while building the panels below.Each panel was deleted and rebuilt from scratch 3 times, 3 seconds apart, and still failed.These panels are NOT complete - colours, clipping, placement or matching maybe missing. Open each one in the .ai file and finish it by hand before printing. - PANEL FAILED - 2XL - 2XL Front (2XL Front_Item4): PARM error (jsx line 2657), rebuilt from scratch 1 time(s) and still failed. This panel is incomplete - CHECK IT MANUALLY. - PANEL FAILED - 2XL - 2XL Back (2XL Back_Item3): PARM error (jsx line 1547), rebuilt from scratch 0 time(s) and still failed. This panel is incomplete - CHECK IT MANUALLY.. is this error fix or not ??

(mid-turn follow-up) 1 time q built hue ,. 3 times hone the na ,

## Response snapshot

**Not fixed for these two panels.** They are genuinely incomplete inside
`production_ready_order_2XL.ai` and must be finished by hand.

Evidence from `debug_log.txt` of job Knuckle_Headz_Mint_Order (2026-09-03):

- The order split into 5 files (one .ai per size). Every PARM in the job fires
  immediately after a new order doc is created — same signature as
  [[parm-error-after-orderdoc-close]].
- Recovery mostly works: `PARM: 2 PANEL(S) FAILED ... (12 rebuild attempt(s)
  used of 40)` — 12 rollback+rebuild cycles, 10 panels came back clean
  (`PARM RECOVERED ... rebuilt cleanly on attempt 2/3 of 4`).
- The 2 failures did NOT exhaust their retries. Both ended with
  `PARM ROLLBACK FAILED: ... could not be removed from the canvas - not
  rebuilding, because a second copy would be stacked on the first.`
  (debug_log lines 3729 and 3847). `rollbackInstance` returned false, so the
  rebuild was skipped ON PURPOSE — a rebuild on top of un-removed artwork ships
  a double-pasted panel, which nothing downstream would flag.

Answer to the 1-vs-3 question: the header sentence "deleted and rebuilt from
scratch 3 times" is a static print of the `PARM_RETRIES` constant
(`automate_production.jsx:1997`), not a record of what happened. The per-panel
lines (`1 time(s)`, `0 time(s)`) are the true counts, printed as `parmTry - 1`
at `automate_production.jsx:1793`. The header wording is misleading and should
be reworded.

Failing stages (from the debug log, unambiguous):
- 2XL Front_Item4 — "applying a colour" / "the swatch merge"
- 2XL Back_Item3 — "the clipping mask setup"

Note on the reported "jsx line N": the executed script is
`automation_bundle.jsx`, which prepends 37 lines (header + json2.jsx polyfill +
args + comment) before `automate_production.jsx` line 1
(`illustrator_automation.py:1606-1612`). So the numbers in the report are NOT
`automate_production.jsx` line numbers — subtract the bundle prefix, or trust
the stage label instead.

## Outcome

- ✅ Impact: Diagnosis only. Confirmed the two panels need manual completion, and
  identified `rollbackInstance` returning false (not retry exhaustion) as the
  residual failure mode.
- 🧪 Tests: none run — read-only investigation of an existing job's output.
- 📁 Files: no code changed.
- 🔁 Next prompts: (a) reword the parm_errors.txt header so it reports what
  actually happened per panel; (b) harden `rollbackInstance` so a `piece.remove()`
  that throws PARM is retried / the panel is marked in the .ai instead of silently
  left half-built.
- 🧠 Reflection: the operator-facing report contradicted itself (header said 3
  rebuilds, body said 0) which is exactly what made the user distrust it.

## Evaluation notes (flywheel)

- Failure modes observed: `rollbackInstance` cannot always remove the failed
  piece when the document is in a PARM state; recovery then correctly gives up,
  but the report does not say WHY it gave up.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): print the rollback-failure reason
  into the per-panel line in `parm_errors.txt`, and drop the fixed "3 times"
  sentence from the header.
