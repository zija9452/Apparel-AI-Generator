---
id: 056
title: Clean Slate Close Leftover Docs
stage: green
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "clean-slate", "leftover-documents", "crash-recovery", "com"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/illustrator_automation.py (modified - close all open documents with DONOTSAVECHANGES at job start, after Silent mode, before opening pattern)
tests:
 - py_compile syntax check passed (Backend/.venv python)
---

## Prompt

ok lga do

(approving: clean-slate fix - close all leftover open documents at the start of every job)

## Response snapshot

Applied the clean-slate fix from PHR 055 in Backend/services/illustrator_automation.py:

- Right after UserInteractionLevel is set to Silent (so no save dialogs) and before
  "Opening Pattern file...", a bounded loop closes every open document:
  for _ in range(app.Documents.Count): app.Documents.Item(1).Close(2)
  (2 = aiDoNotSaveChanges). Bounded loop (not while) so a stubborn document cannot
  hang the job; whole block wrapped in try/except with a warning log.
- Logs "Closed N leftover document(s) from a previous run" when it actually finds any.
- Rationale: the JSX only closes mockup/order docs on its success path (jsx:531-532);
  a mid-run crash leaves them open in the reused Illustrator instance where same-name
  swatches/groups can conflict with the next job.

Caveat stated to user: any manual unsaved Illustrator work open on this machine will
be closed WITHOUT saving when a job starts - the automation instance should not be
used for hand work during production runs.

## Outcome

- ✅ Impact: Every job now starts with zero open documents regardless of how the previous job ended - the last live cross-job contamination path is closed.
- 🧪 Tests: py_compile passed; full behavior verifiable on next real job run (log line appears only when leftovers exist)
- 📁 Files: 1 modified
- 🔁 Next prompts: pending - Phase 4 flavour decision (hybrid vs full), Excel persistence per job, Phase 2 mockup scan
- 🧠 Reflection: Bounded for-loop instead of while-loop matters here - a COM document that refuses to close would otherwise spin forever inside a background task.

## Evaluation notes (flywheel)

- Failure modes observed: none new
- Graders run and results (PASS/FAIL): syntax PASS; runtime pending next job
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): also close docs in the JSX catch block for defense in depth
