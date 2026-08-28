---
id: 1
title: Complete deployment plan
stage: plan
date: 2026-08-27
surface: agent
model: claude-opus-5
feature: deployment
branch: main
user: zija9452
command: chat
labels: ["deployment", "cloud-run", "vercel", "local-agent", "sse", "architecture"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - DEPLOYMENT_PLAN.md
tests:
 - Private Network Access probe: two throwaway FastAPI servers on :8765 (sending Access-Control-Allow-Private-Network) and :8766 (not), called from https://example.com via DevTools console - BOTH PASSED, so https -> http://localhost is not blocked in this Chrome
 - curl preflight against both probe servers confirmed the exact response headers before the browser test
---

## Prompt

plan bnao complete deployment ki , is ki mardown file bnao ,. or download click krne k bd jb download ho jaye to koi pop up nhi dena he , chor do use c drive me rehne do ,

## Response snapshot

Wrote `DEPLOYMENT_PLAN.md` at the repo root. Delete-after-download prompt removed per this instruction - the ZIP stays in `C:\Production\<job>\` and the designer manages that folder.

Architecture settled over the preceding discussion, driven by two measurements taken from real job folders:

- `pattern.ai` is 135 MB and **byte-identical across jobs** (MD5 `64ccfe33c488` on four separate folders - it is one reused master), `mockup.ai` ~4 MB, output ZIP **334 MB**.
- Routing those through Cloud Run is impossible (32 MiB request cap; tmpfs filesystem means a 135 MB upload also costs 135 MB RAM, and `main.py:683` reads the whole file into memory) and would cost ~$0.057/job in egress versus ~$0.001 for status polling.

So: **Vercel** (UI) + **Cloud Run** (Excel parse + Gemini plan only, stateless) + **local agent on each designer's PC** (Illustrator, all files, all status, downloads). Files never leave the machine, which also makes SSE free - the earlier polling-vs-SSE-vs-webhook cost comparison only mattered while status went through Cloud Run.

Prerequisite verified before committing to the shape: an `https://` page can reach `http://localhost`. Two probe servers, one sending the PNA header and one not, both succeeded from `https://example.com`.

Two traps written into the plan because they are the expensive kind:

1. **Do not install the agent as a Windows Service** - Session 0 is isolated from the desktop and cannot drive Illustrator over COM. Use Task Scheduler "at log on, only when user is logged on".
2. **The agent's CORS must be locked to the Vercel origin.** Today's `allow_origins=["*"]` (`main.py:646`) is harmless on a dev box but on the agent it would let any website a designer visits start jobs and read their files.

Build order: agent → cloud split → frontend → installer. The current local flow keeps working through phases 1-2.

## Outcome

- ✅ Impact: deployment shape decided and written down with the two measurements that forced it, so the file-routing question does not get re-litigated.
- 🧪 Tests: the https→localhost prerequisite was actually measured, not assumed - the whole design rests on it.
- 📁 Files: 1 new (`DEPLOYMENT_PLAN.md`).
- 🔁 Next prompts: start phase 1 (agent) - relocate storage to `C:\Production`, add the endpoint set, SSE, CORS/PNA, autostart.
- 🧠 Reflection: four exchanges were spent optimising status transport, which turned out to be 2% of the bill. Measuring the actual file sizes first would have reframed the whole conversation immediately.

## Evaluation notes (flywheel)

- Failure modes observed: optimising the cheapest component before measuring where cost actually sat.
- Graders run and results (PASS/FAIL): PASS - browser PNA probe, curl header check.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): confirm which Illustrator versions are on the designers' PCs before the agent hardcodes a ProgID.
