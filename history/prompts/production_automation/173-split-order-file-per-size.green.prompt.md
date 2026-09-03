---
id: 173
title: Split order file per size
stage: green
date: 2026-09-03
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat) one .ai per size when the mockup is over 5MB
labels: ["performance", "order-file", "split", "mockup-size", "parm", "export"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/illustrator_automation.py (mockup size probe -> plan_data["split_per_size"], before the production_plan.json dump)
 - Backend/scripts/automate_production.jsx (SPLIT_PER_SIZE / orderDocLabel / orderLabelSeen state, orderFileName, size-boundary trigger, startNextOrderDoc counter + log)
tests:
 - node --check on a .js copy of automate_production.jsx - PASS
 - py_compile on illustrator_automation.py and main.py - PASS
 - threshold check against the two real jobs - Knuckle_Headz_Mint 10.42MB -> True, Local_test_Agent 0.18MB -> False
 - no Illustrator run
---

## Prompt

ok , or agr ye bhi k mockup file 5mb se zyada ho to hr size jese S,M, L ye sb alg alg ai files me bne, or export ho ,

(follow-up) wo parm error fix kr lia tha na again bnane ki logic se , rebuilt logic 3 times ,

(follow-up) flow kia he ?

## Response snapshot

**Decisions the user made when asked:** files named after the size
(`production_ready_order_Large.ai`); the `Universal` accessories group rides in the LAST size's file
rather than getting its own; the trigger is automatic at 5MB with no checkbox.

**Implementation.** The splitting machinery was already there and battle-tested - `startNextOrderDoc`
has always saved, flushed the export queue, closed and reopened when the canvas filled. This adds a
second reason to fire it and a naming scheme:

1. `illustrator_automation.py`, immediately before the `production_plan.json` dump:
   `plan_data["split_per_size"] = os.path.getsize(mockup_ai_path) > 5*1024*1024`, with the MB logged.
   `OSError` -> 0 -> False, i.e. an unreadable mockup behaves exactly as before.
2. `automate_production.jsx`: `SPLIT_PER_SIZE`, plus `orderDocLabel` (the size owning the current
   file) and `orderLabelSeen` (files that size has needed), declared with the other order-file state
   at the top of main - not next to their consumers, per the var-hoisting rule this file already
   learned the hard way with `pmStripeQueue`.
3. `orderFileName(idx)` returns `production_ready_order_<Size>[_N].ai` when the split is on and a size
   owns the file, else the untouched numeric scheme. The label is the same string the export folders
   use, so a file and its renders always carry the same name.
4. At the size boundary: fire `startNextOrderDoc` when the flag is on, the file is not empty, and the
   size is not `Universal`; then claim the file with `orderDocLabel = sizeLabel` and the counter reset
   to 1 so a previous size's `_2` cannot leak into this one's name.
5. In `startNextOrderDoc`: bump `orderLabelSeen[orderDocLabel]` AFTER `saveOrderDoc()` so the file just
   written keeps its own name, giving `_Large_2.ai` only in the one case that still needs it - a size
   too tall for a single canvas. The "continuing in X" log line was dropped: under the split the next
   file's name is not knowable at that point, and the new document already logs its own name.

**PARM correction, made to the user.** I first said more splits would multiply PARM exposure. The
log says otherwise and the user was right that the rebuild logic works: `XL Front_Item2` and
`2XL Front_Item2` both PARMed and both recovered on attempt 2 of 4. The single failure,
`2XL Neck_Item1`, was not a missing retry - the rollback refused on purpose:
"could not be removed from the canvas - not rebuilding, because a second copy would be stacked on the
first". And all three landed at 12:03-12:04, the last 90 seconds of a two-hour run, next to two
"Temp Expand failed: PARM" lines - the signature of an exhausted process. Smaller, shorter-lived
documents should therefore produce FEWER PARMs, not more. That is now the stated rationale in the
Python comment.

**Side benefit worth recording:** `flushExports` runs inside `startNextOrderDoc`, so with one file per
size the JPGs for each size are written as that size finishes instead of all at the end. The operator
sees the first size's renders in minutes rather than after the whole run.

## Outcome

- ✅ Impact: A >5MB mockup now yields ~10 panels per order document instead of 40+, addressing the
  measured export degradation (60s -> 99s per panel) and the memory exhaustion that the end-of-run
  PARM failures came with. Light-mockup jobs are bit-for-bit unaffected - same file names, same flow.
- 🧪 Tests: `node --check` PASS, `py_compile` PASS, threshold verified against both real jobs. Not run
  through Illustrator yet.
- 📁 Files: 2 source files + this PHR.
- 🔁 Next prompts: re-run Knuckle_Headz_Mint (it needs a re-run anyway for the rib fix, PHR 172) and
  confirm five per-size .ai files appear, that Universal lands in the last one, and whether per-panel
  export time now stays flat instead of climbing.
- 🧠 Reflection: The whole feature is one new trigger and a naming function because the expensive part
  - safely tearing down and rebuilding an order document - was already written and already proven by
  the canvas-overflow path. Worth noticing before proposing anything larger.
- 📋 ADR: not suggested - reuses the existing multi-file mechanism, no new architectural direction.

## Evaluation notes (flywheel)

- Failure modes observed: none at build time. One reasoning error, corrected mid-conversation: I
  asserted the split would increase PARM risk before reading the log, which showed the opposite.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): on the re-run, compare the `EXPORT: rendering N JPG(s)` ->
  `EXPORT: N JPG(s) written` spans per file. Flat per-panel time across all five files is the result
  this change is actually betting on; if it still climbs, the cause is the mockup's transparency and
  not the document size, and SLOW_EXPORTING.md's RAM/Illustrator recommendations stand alone.
