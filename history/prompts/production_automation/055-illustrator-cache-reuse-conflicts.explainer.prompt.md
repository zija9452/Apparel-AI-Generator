---
id: 055
title: Illustrator Cache Reuse Conflicts
stage: explainer
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "com-instance-reuse", "cache", "cross-document-leakage", "crash-leftover-docs"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/services/illustrator_automation.py (inspected - GetActiveObject reuse :250, font-restart :229-235, pattern doc close :388)
 - Backend/scripts/automate_production.jsx (inspected - doc closes :531-532/:107, catch without close :539-545, activeDocument assumption :10)
tests:
 - none (assessment only)
---

## Prompt

acha aesa hota he k mene koi order bnwaya bnwaay script run kr k , or wo complete hone k bd illustrator k memory me cache reh jaye , jo conflict kre ?? br br illustrator open krna zruri he ??

## Response snapshot

Assessment of Illustrator instance reuse and cross-job contamination:

- Illustrator deliberately stays open between jobs (GetActiveObject first, Dispatch
  only if not running). Restart happens ONLY when new job fonts are installed
  (running Illustrator won't pick them up). Repeated open/close is NOT needed -
  startup is ~30s+ and reuse is the right design.
- No app-level "cache" exists: swatches/spots/layers are per-document; on a
  successful run all docs are closed (order+mockup jsx:531-532, ref jsx:107,
  pattern py:388), so nothing of the job survives in the app (fonts excepted).
- The conflicts the user experienced were NOT cache: they were cross-document
  references between docs open in the SAME session (text colors pointing at the
  mockup doc's SpotColor swatches) - fixed by the last 5 commits (detach/convert
  to CMYK).
- REMAINING RISK: the JSX catch block (539-545) does not close docs. A mid-run
  crash leaves mockup/order docs open; the next job runs in the same instance
  beside them (activeDocument assumption at jsx:10 usually survives because
  app.Open activates the new doc, but memory bloat and same-name swatch/group
  collisions can resurface the old conflict class). The watchdog-hang path is
  covered (it kills Illustrator entirely).
- Proposed small fix (offered, not applied): close ALL open documents with
  DONOTSAVECHANGES at the START of every job in Python - clean slate regardless
  of how the previous job ended (~5 lines).

## Outcome

- ✅ Impact: User knows reuse is intentional, successful jobs leave no residue, past conflicts were open-doc leakage (already fixed), and the one live hole is crash-leftover docs.
- 🧪 Tests: none (read-only)
- 📁 Files: none modified
- 🔁 Next prompts: apply clean-slate doc close at job start if approved; pending: Phase 4 flavour decision, Excel persistence, Phase 2
- 🧠 Reflection: "Cache" was the user's mental model for what was actually cross-document reference leakage - naming the real mechanism prevents wrong fixes (like forcing full restarts per job).

## Evaluation notes (flywheel)

- Failure modes observed: JSX catch path leaks open documents on crash
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): close app.Documents loop at job start before opening pattern
