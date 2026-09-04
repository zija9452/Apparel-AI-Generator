---
id: 177
title: Retry PARM On Rollback Remove
stage: green
date: 2026-09-04
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat request)
labels: ["parm", "illustrator", "rollback", "retry", "recovery"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check (via .js copy) - PASS
 - ES3 reserved-word scan on `var` declarations - clean
 - end-to-end split-order job - NOT yet run
---

## Prompt

issue kia he , short me btao , or kese fix kr skty hen ??

(then) is remove ne parm dia to is pr bhi 3 br retries lga do na ,

## Response snapshot

Implemented the requested retry on the DELETE side of the PARM recovery.

**Why it was needed:** in job Knuckle_Headz_Mint_Order the two panels that shipped
incomplete never used their rebuild retries. Both logged
`PARM ROLLBACK FAILED: ... could not be removed from the canvas - not rebuilding`
— `rollbackInstance` gave up the moment `piece.remove()` itself threw PARM. The
rebuild path is proven (10 panels recovered in that same job); only the delete
blocked it.

**Changes, all in `Backend/scripts/automate_production.jsx`:**

1. `PARM_REMOVE_SLEEP_MS = 800` added to the hoisted PARM constants block
   (line ~556). It MUST live there, not next to `rollbackInstance` — the per-item
   loop reads these long before any `var` further down is assigned.
   Shorter than `PARM_SLEEP_MS` on purpose: this waits on one re-issued call, not
   on a document recovering.
2. New `removeWithRetry(item, label)` (line ~2170): `1 + PARM_RETRIES` = 4
   attempts, clearing `locked` and `hidden` before each one (Illustrator refuses
   to delete from either state, and a leftover lock makes `remove()` throw forever
   however long you wait). Logs every attempt.
   Deliberately NO liveness probe between attempts — reading properties off
   suspect artwork to decide the next move is the FAZ103 mistake that shipped
   panels with no design at all.
3. `rollbackInstance` (line ~2192): calls `removeWithRetry` for the piece, and the
   top-of-document sweep now runs up to 4 times with the same unlock/unhide per
   item.
4. The verdict is now the document's item COUNT, not whether `remove()` threw. A
   piece whose own remove failed is still a top-level item, so the sweep deletes
   it and the panel is genuinely clean. This keeps the double-paste guarantee
   intact — `cleared` can still only be true when the count is back to baseline.

## Outcome

- ✅ Impact: a PARM on the delete no longer costs the panel its rebuild; only a
  document that stays above its baseline item count aborts the retry.
- 🧪 Tests: `node --check` PASS on a `.js` copy; reserved-word scan clean. Real
  verification needs a split (multi-size) order job.
- 📁 Files: `Backend/scripts/automate_production.jsx` (1 new function, 1 constant,
  `rollbackInstance` reworked).
- 🔁 Next prompts: (a) reword `parm_errors.txt` — the header still prints the
  static "rebuilt 3 times" and contradicts the per-panel counts; (b) run a
  multi-size order and grep the debug log for
  `PARM ROLLBACK: ... removed on attempt`.
- 🧠 Reflection: the recovery was one layer short — it retried the rebuild but
  trusted the delete to always work.

## Evaluation notes (flywheel)

- Failure modes observed: `piece.remove()` raising PARM; `rollbackInstance`
  treating a throw (rather than the item count) as proof of failure.
- Graders run and results (PASS/FAIL): syntax PASS; runtime PENDING.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): if the sweep still cannot clear,
  unlock the layer as well before deleting.
