---
id: 182
title: Chunked render with Illustrator restart and resume
stage: plan
date: 2026-09-08
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (conversation)
labels: ["parm", "illustrator", "resume", "checkpoint", "split-order"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - specs/parm-restart-resume/plan.md
tests:
 - none (planning only)
---

## Prompt

mjhe flow btao , or edge cases ? or plan ?

(Preceding turns in the same exchange: analysis of `E:\debug_log.txt` for PARM
failures; confirmation that the agent now pulls its JSX from Cloud Run vs local
`:8000`; and the user's decision — "aesa ho jaye k 2 ai production files k bd
illustrator again restart ho jaye ... apne pas note kr le k itne sizes bn gye
hen , phr again jb job start kre wo resume kre , to whi se kre , jo wo bna chuka
he wo na bnaye". Followed by "restart pr wo again pattern indexing mockup
indexing sb prhe ga ?? ye case handle he ??")

## Response snapshot

Wrote `specs/parm-restart-resume/plan.md`.

Key findings that shaped the plan:

- The 2026-09-07 run has **two** PARM modes, not one. Panel-level (colour/swatch,
  carries a stage label) recovers via the existing rollback — 7/7. Session-level
  (first cross-document `.duplicate()`, no stage label) is unfixable at panel
  level: all 10 rebuilds re-run the identical failing call. 81 of the errors are
  this mode; ~6 minutes were burned on doomed retries.
- **The JSX cannot restart the Illustrator hosting it.** It runs inside a blocking
  `app.DoJavaScript()` at `illustrator_automation.py:1641`, and all restart logic
  (`:1297-1308`) runs only pre-job. The chunk loop must wrap line 1641.
- The full startup (pattern open → index → mockup open → index → prebuild sizes →
  order doc) **must re-run unchanged every chunk**, and costs only ~5 s. Skipping
  or caching any of it re-triggers the 792 pt shift or the 257-second index build.
  Resume applies at the size loop (`automate_production.jsx:883`) and nowhere else.
- 15 edge cases identified against real code, four of them silent data loss:
  `debug_log.txt` truncating per run (`:25`), every report file being `open("w")`
  at end of run (`:1983-2086`), `order_files.txt` losing entries (`:213`), and JPG
  counter collision when a size overflows into `_2.ai` (`:10539` + `:3881-3883`).

## Outcome

- ✅ Impact: a phased, code-referenced plan; premise verification is Phase 0 so the
  build stops early if a restart does not actually clear the session-level PARM.
- 🧪 Tests: none yet — planning only.
- 📁 Files: `specs/parm-restart-resume/plan.md` (new).
- 🔁 Next prompts: answer the 3 open questions (Universal item placement, restart
  failure policy, whether `filesPerRun` is configurable), then run Phase 0.
- 🧠 Reflection: the user's stated goal was "zero PARM", but a reactive restart
  cannot deliver that by definition — at least one PARM must fire to trigger it.
  Saying so directly reframed the design toward restarting on a **file-count**
  boundary rather than on failure, which is what the user then chose.

## Evaluation notes (flywheel)

- Failure modes observed: quoting a `jsx line N` against the wrong job's bundle was
  avoided only because the bundle for the failing run was absent from disk and the
  one on `E:\` predated an edit to `automate_production.jsx`. The line number was
  deliberately left unmapped rather than guessed.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Phase 0 — force one mid-order restart
  on a split test job and check whether the session-level PARM clears.
