---
id: 2
title: Pre-deployment hardening fixes
stage: green
date: 2026-08-27
surface: agent
model: claude-opus-5
feature: deployment
branch: main
user: zija9452
command: chat
labels: ["job-lock", "sse", "path-traversal", "race-condition", "cleanup", "pre-deployment"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/main.py
 - Frontend/my-app/app/page.tsx
 - Frontend/my-app/components/UploadForm.tsx
 - Frontend/my-app/components/ProductionPlan.tsx
tests:
 - job lock (13 checks) - ownership, wrong-owner release refused, released on BOTH the pause-return and crash paths, 20-thread race yields exactly one winner, /jobs/running idle+busy, resume refused with 409
 - orphan cleanup (6 checks) - a broken Excel and a 409 both leave no folder and no held slot
 - path traversal (12 checks) - '../', '..%2f', '....//', 'a\\b', 'C:/Windows', '.', '' all 404 on status AND on cancel (which writes); a legitimate id still serves
 - torn status read (5 checks) - 40 reads against a file being continuously half-written: all 200, never a backwards progress 0
 - SSE against a real uvicorn (10 checks) - one frame per change, no torn frame, no duplicate for an unchanged file, stream survives a pre-flight pause, ends with event:end on is_ready and on cancelled, bad id 404s
 - python -m py_compile main.py; npx tsc --noEmit - both clean
---

## Prompt

ok , pehle ye fix kro, ek ek kr To dono chahiye: button disable (UX ke liye — status se pata chale ke job chal raha hai) aur server-side lock (asli guarantee)

## Response snapshot

Five fixes, in order, each tested before moving on. All of them are in code that becomes the local agent in phase 1, so they are fixed once rather than twice.

**1. Single-job lock.** Nothing prevented two automations against one Illustrator - they share `app.Documents` and the leftover-document sweep at `illustrator_automation.py:929-936` would have one job closing the other's live order document. Added `_claim_job_slot`/`_release_job_slot`/`_current_job_id` behind a `threading.Lock`, plus `_run_job_locked` which releases in a `finally`. The slot is claimed **in the request, never in the background task** - `add_task` runs after the response is sent, so two quick requests would both pass a check made inside the task. Claimed on both entry points (`/jobs/upload` and `/jobs/resume`). Added `except HTTPException: raise` so the 409 is not flattened into a 500 by the blanket handler. New `GET /jobs/running`.

A paused job deliberately does NOT hold the slot - it is not using Illustrator - and the frontend's `running` definition mirrors that exactly, so the button state can never diverge from what the server would actually do.

**2. Orphan folders.** The ~139MB of .ai files are written before the `try`, so any failure below (bad Excel, Gemini timeout, bad schema) left the folder forever with nothing to sweep it. `job_started` flag + `finally` that removes the folder and releases the slot. Nothing of value is lost: the Excel is read from memory and was never written there.

**3. Path traversal.** `job_id` came off the URL and went straight into `os.path.join` on four routes - read on `/jobs/status`, and **write** on `/jobs/cancel`. `_job_dir_for()` applies two checks: the name rule (`^[A-Za-z0-9_-]+$`, exactly what `_safe_job_name` produces) and a resolved-path containment check, which is the one that still holds if the name rule is ever outsmarted by a junction inside uploads/.

**4. Torn status reads.** `status.json` has two writers that both overwrite in place - `update_status()` and the JSX from inside Illustrator (`automate_production.jsx:12`). A bare `json.load` turned that instant into a 500. Now: brief retry, then fall back to the last good value rather than a zeroed one (progress 0 would send the bar backwards).

**5. SSE replaces polling.** New `GET /jobs/stream/{job_id}`. The subtle part is the ending: closing the stream is not enough, because `EventSource` reads a closed stream as a dropped connection and reconnects forever - worse than the polling it replaces. It sends `event: end` and the client closes on it. A pre-flight pause is explicitly NOT terminal. `X-Accel-Buffering: no` because proxies otherwise hold every update until the job ends.

TestClient does not model streaming faithfully (the first test hung), so the SSE suite runs against a real uvicorn.

## Outcome

- ✅ Impact: four real defects that already existed are gone, and the status feed no longer polls. All five live in code that moves into the agent, so the deployment starts from a clean base.
- 🧪 Tests: 46 checks across five suites, all passing; py_compile and tsc clean.
- 📁 Files: 4 changed.
- 🔁 Next prompts: #6 unsaved-work warning, then phase 1 (the agent itself).
- 🧠 Reflection: the lock's correctness hinges entirely on claiming in the request rather than the task - a detail invisible until you notice `add_task` runs post-response.

## Evaluation notes (flywheel)

- Failure modes observed: a first SSE test written against TestClient hung rather than failing, which would have read as a code bug; re-testing against real uvicorn showed the code was fine.
- Graders run and results (PASS/FAIL): PASS - 46 checks, py_compile, tsc --noEmit.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run one real 28-minute order end to end and confirm the stream stays alive across the ~13-minute name-index phase, where the only traffic is heartbeats.
