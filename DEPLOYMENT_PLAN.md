# Deployment Plan

How this project goes from "runs on one PC" to "designers open a website and it renders on their own machine".

Decided 2026-08-27.

---

## 0. Where this stands

Last worked on **2026-08-27**. Read this section first — it is the handover.

### The picture in one place

```
  BROWSER (Vercel)                              DESIGNER'S OWN PC
  ────────────────                              ─────────────────
  1. attach Excel + pattern.ai + mockup.ai
        │
        ├── Excel + checkboxes ──► CLOUD API    (~200 KB, ~20 s)
        │        POST /plan            │
        │        ◄── plan.json ────────┘
        │
        └── plan + .ai files ─────────────────► AGENT  POST /jobs
                                                  │      (localhost, 139 MB,
                                                  │       never on the network)
                                            Illustrator  (~28 min)
                                                  │
        status ◄── SSE /jobs/{id}/stream ─────────┤
        ZIP    ◄── /jobs/{id}/download ───────────┘   C:\Production\<job>\
```

### Done

**Phase 0 — hardening the existing backend** (all of it is code that then moved
into, or is shared with, the agent, so it was fixed once rather than twice):

| | What | Where |
|---|---|---|
| ✅ | **Single-job lock** — 409 on a second start, claimed in the request not the background task, released on the pause and crash paths | `job_runtime.claim_job_slot` |
| ✅ | Upload button disabled from live status, plus a pre-submit check so 139 MB is not sent only to be refused | `page.tsx`, `UploadForm.tsx` |
| ✅ | **Path traversal closed** on resume/cancel/status/download/stream | `job_runtime.job_dir_for` |
| ✅ | **Orphan job folders** removed when a job never launches | `/jobs/upload` `finally` |
| ✅ | **Torn status reads** — retry, then last-good; never a 500, never a backwards bar | `job_runtime.read_status_once` |
| ✅ | **SSE replaces polling** | `job_runtime.status_stream` |
| ✅ | **Unsaved-work pre-flight** — pauses before Illustrator is touched | `illustrator_automation._illustrator_unsaved_documents` |
| ✅ | Illustrator **reused, not relaunched**; never quit at the end; `$.gc()` after each job; restarts only for new fonts or over 6 GB | `illustrator_automation.py` |
| ✅ | **Pattern-piece pre-flight** — panel names the order needs, checked before rendering | `illustrator_automation._find_missing_pattern_pieces` |
| ✅ | SLEEVE-MATCH Offset Path PARM now reaches the panel rollback | `automate_production.jsx` 5251, 6330, 7014 |

**Phase 1 — the agent:**

| | What | Where |
|---|---|---|
| ✅ | **Shared runtime** — lock, paths, status, SSE; parameterised by root so backend serves `uploads/` and agent serves `C:\Production` from ONE copy | `Backend/services/job_runtime.py` |
| ✅ | **The agent** — 9 routes | `Agent/main.py` |
| ✅ | **Pairing token** — every route but `/agent/health`; constant-time compare | same |
| ✅ | **`Host` check** (DNS rebinding → 421), **loopback bind**, **CORS locked**, **PNA header** | same |
| ✅ | **Disk guard** — 507 below 5 GB, warning below 20 GB | same |
| ✅ | **Illustrator detection** via the registry, without launching it | same |
| ✅ | **JSX auto-update** — hash-verified, atomic swap, `.bak` kept, never mid-job, never fatal | `_sync_automation` |
| ✅ | **Autostart** — Scheduled Task at logon, deliberately not a Windows Service | `Agent/install-agent.ps1` |
| ✅ | **Zero-prerequisite install** — installs Python itself (winget, else the python.org per-user installer), then the packages and pywin32's COM registration; rejects the WindowsApps stub | same |
| ✅ | **Right-click install** — the "Run with PowerShell" verb sets Process-scope Bypass itself, so no command line and no MOTW block; a `trap` + pause keeps the window open long enough to read a failure | `Agent/install-agent.ps1` |
| ✅ | **Survives having no console** — under `pythonw` both streams go to `%LOCALAPPDATA%\AIApparelAgent\agent.log`, rotated at 5 MB, falling back to `os.devnull`. The token is printed only to a real console, never into the log | `Agent/main.py` |
| ✅ | **The installer waits properly** — polls health for 30 s, then runs the agent in the foreground and prints the traceback rather than guessing | `Agent/install-agent.ps1` |
| ✅ | **Pairing link printed** for browsers other than the default one | same |
| ✅ | **Packaging** — 234 KB zip, no Gemini code, no key, no frontend | `Agent/build-agent-package.ps1` |

**Phase 2 (part) and 3 — cloud split and frontend:**

| | What | Where |
|---|---|---|
| ✅ | **`POST /plan`** — planning only, no Illustrator, ready to lift to Cloud Run | `Backend/main.py` |
| ✅ | **`/automation/manifest`** + **`/automation/file/{name}`** — serves the JSX, version is the content hash | same |
| ✅ | **Gemini key rotation** — `GEMINI_API_KEY`, then `GEMINI_API_KEY1..4`; a spent key steps aside and the one that answered becomes the next job's starting point. Only 401/403/429/RESOURCE_EXHAUSTED rotate; a schema error still fails once. All spent → one 503 | `main._run_agent` |
| ✅ | **`/plan` behind an API key** — `CLOUD_API_KEY`, constant-time compare. Unset = open, for a dev box, with a loud startup warning | `main.require_api_key` |
| ✅ | **The key never reaches the browser** — the browser posts to the site's own `/api/plan`; that handler runs on Vercel's server and adds the key. `NEXT_PUBLIC_CLOUD_API` is gone: a `NEXT_PUBLIC_` value is compiled into the downloaded JavaScript and readable in DevTools | `app/api/plan/route.ts` |
| ✅ | **CORS narrowed** — the Vercel site, `*.vercel.app` previews, and localhost. No longer `["*"]` | `main.ALLOWED_ORIGINS` |
| ✅ | **Loopback by default** — `0.0.0.0` only when `CLOUD_HOST` says so, which is Cloud Run's job | `main.__main__` |
| ✅ | **Frontend split** — Excel to the cloud, `.ai` files to the agent | `UploadForm.tsx` |
| ✅ | **Two base URLs from env** | `lib/api.ts`, `.env.example` |
| ✅ | **Agent health + pairing UI**, above the form | `components/AgentStatus.tsx` |
| ✅ | **Automatic pairing** — installer opens the site with `?agent_token=`, page stores it and strips the URL | `AgentStatus.tsx`, `install-agent.ps1` |
| ✅ | **Agent download on the home page** | `app/home/page.tsx`, `public/AIApparelAgent.zip` |

### Not done

| | What | Note |
|---|---|---|
| ✅ | **Cloud API deployed — 2026-08-28** | `https://apparel-cloud-api-434863957551.asia-south1.run.app` · project `gen-lang-client-0222340998` · region asia-south1 (Mumbai, nearest to Pakistan) · 1 GiB, min-instances 0, max 4. Verified live: `/health` reports `cloud-plan-only`, `/plan` 401s without the key, `/jobs/*` 404, `/automation/manifest` serves the JSX hashes. Redeploy with `Backend\deploy-cloudrun.ps1 -ProjectId gen-lang-client-0222340998` |
| ✅ | **Frontend deployed to Vercel — 2026-08-28** | `https://apparel-ai-generator.vercel.app`. All four pages 200. `/api/plan` rejects GET (405) and non-multipart (400). A real Excel through the live site returned a correct plan in **19 s** — browser → Vercel → Cloud Run → Gemini, end to end. The API key and the Cloud Run URL appear nowhere in the served HTML. The agent's CORS admits this origin and refuses a stranger's |
| 🟡 | **End-to-end test** | **Passed locally on 2026-08-28** — `Local_test_Agent`: browser → cloud `/plan` → agent `/jobs` → Illustrator → SSE → 15 MB zip, 5 sizes, `PARM: no PARM errors in this job`. That was a small order through the whole new path. Still owed: a full-size order, and the same run against the deployed cloud and Vercel rather than localhost |
| ⬜ | **A real order from the deployed site, on a designer's PC** | The single remaining thing that matters. Everything up to it is verified; the render itself has only ever run against localhost |
| ⬜ | **`https://` → `http://localhost` proved on the real site** | The mechanism was proved on 2026-08-27 from `https://example.com`, and the agent answers a Vercel-origin preflight correctly — but no browser has yet driven a job from the deployed site |
| ⬜ | Disk-space check in the local backend | The agent has one |
| ⬜ | Illustrator version probe | Edge case 8 |

### What the first install on a designer's PC taught us — 2026-08-28

The first real install found two things no amount of local testing had, because
both only appear on a machine that has never run this before.

**1. The agent died instantly under `pythonw`, which is how it is installed.**
The Scheduled Task uses `pythonw.exe` so no console window appears. `pythonw`
gives the process `sys.stdout = None`, and the ten `print()` calls in
`__main__` raised `AttributeError` before uvicorn ever bound a port — writing
nothing anywhere, because there was nowhere to write. Run by hand with
`python.exe` it worked perfectly, which made it look like the Scheduled Task's
fault. It was not. Both streams now go to a log file when there is no console.

The general lesson, worth keeping: **anything launched by `pythonw` must not
assume it has streams.** That includes libraries.

**2. Pairing belongs to the browser, not the machine.** The installer opens the
*default* browser, and the token lands in that browser's `localStorage`, which
no other browser can read. The designer's default was Edge; they worked in
Chrome; Chrome reported "the agent is not running on this PC" — from where they
stood, identical to a failed install. The installer now prints the pairing link
so it can be pasted into whichever browser they actually use.

Pairing then lasts indefinitely. It is lost only by clearing site data, using
a private window, or moving to another browser or Windows profile.

**And a third thing that was not a bug:** the installer declared failure after
sleeping four seconds. A cold venv importing `win32com` takes longer than that
on a first run, so a working install reported itself broken. It now polls for
30 s and, if the agent really has not come up, runs it in the foreground and
shows the traceback.

**Decided against, on 2026-08-28: blocking sleep during a job (edge case 6).**
A power cut ends a job the same way sleep does and cannot be prevented, so the
guard would only cover one of the two. An interrupted job is already survivable:
the slot lives in memory, so a restarted agent reports itself free, and the
half-finished folder is left in `C:\Production` for the designer to delete. Do
not reopen this without a reason that is not "it was on the list".

### The repo was rewritten on 2026-08-28

`git push` was impossible: `Backend/apparel_sessions.db` had reached **1.1 GB**
and sat in three commits, and `Backend/uploads/` held a 145 MB `.ai` and six
~20 MB order zips. GitHub refuses any file over 100 MB, so the old commits
could not be pushed at all — not even after deleting the file today.

`git filter-repo` removed `apparel_sessions.db*`, `Backend/uploads/` and any
`.env` from **all** history, and `main` was force-pushed.

| | Before | After |
|---|---|---|
| `.git` | 3.0 GB | 2.8 MB |
| commits | 33 | 35, all messages kept |
| largest file | 774 MB | 1.31 MB |

Everything stayed on disk — `Backend/.env` and the 1.1 GB database were only
untracked, never deleted. A copy of the old `.git` is at
`../AI-Apparel-Order-Generator.git-backup` (3 GB); delete it once the remote
looks right.

**Consequences to know about.** Every commit hash changed, so an existing
clone elsewhere cannot pull — it must be re-cloned. `SQLiteSession` is imported
in `Backend/main.py` but no longer used; the database it wrote is now ignored
and can be deleted.

### What deploying to Cloud Run actually cost, and the traps in it

Free every month: Cloud Build 2,500 build-minutes, Cloud Run 2M requests /
360,000 GB-s / 180,000 vCPU-s, Artifact Registry 0.5 GB. This workload uses a
few percent of those. Two things are **not** free and are worth knowing:

- **Cloud Storage's 5 GB free tier is US-only** (`us-east1`, `us-west1`,
  `us-central1`). The staging bucket is in asia-south1, so it is billed — at
  0.86 MB per deploy that is fractions of a cent, and worth it against ~200 ms
  of extra latency from a US region.
- **Artifact Registry accumulates one image per deploy.** A cleanup policy is
  now set on `cloud-run-source-deploy`: keep the last 3, delete anything older
  than 7 days. Current size 113 MB compressed.

**Billing was enabled on `gen-lang-client-0222340998`, which also owns the
Gemini keys.** Google's own documentation is explicit that this moves a
project from the Gemini free tier to the paid tier — "disable billing on each
of your projects that you want to downgrade". Flash-lite is cheap and paid tier
raises the rate limits considerably, so this is a fair trade, but it is a
deliberate choice and not an accident. Deploying into a separate project would
have kept the keys free.

**Two traps that cost an hour each, so they are written down:**

1. `gcloud run deploy --source` reads **`.gcloudignore`**, never
   `.dockerignore`. Without one it uploads the entire source folder — here that
   was the 1.1 GB database, `.venv`, every past order, and `.env`. Keep the two
   ignore files in step.
2. gcloud on Windows writes ordinary progress to **stderr**. Under
   `$ErrorActionPreference = "Stop"` PowerShell treats each line as a
   terminating error, and the deploy dies on a message that says "finished
   successfully". Check `$LASTEXITCODE` instead.

### How to run it locally, right now

Three processes:

```powershell
# 1. Cloud half (plan + JSX distribution)
cd Backend;  .venv\Scripts\python.exe main.py            # :8000

# 2. Agent (Illustrator)
cd Backend;  .venv\Scripts\python.exe ..\Agent\main.py   # :8765, prints the pairing token

# 3. Frontend
cd Frontend\my-app;  npm run dev                          # :3000
```

Open `http://localhost:3000`. The panel above the form reports the agent. Paste
the token it printed, or let `install-agent.ps1` do it.

To point the agent at a different cloud, set `AGENT_CLOUD_API`. To move the
production folder, set `PRODUCTION_DIR`.

### Tests

All in the scratchpad, run with `Backend\.venv\Scripts\python.exe`:

| Suite | Covers |
|---|---|
| `test_job_lock.py` | ownership, wrong-owner release, release on pause AND crash, 20-thread race, 409 |
| `test_orphan.py` | no folder or slot left behind when a job never starts |
| `test_path_and_torn.py` | `../`, `..%2f`, `a\b`, `C:/Windows` refused on read AND on cancel's write; 40 reads against a file being half-written |
| `test_sse.py` | one frame per change, no torn frame, survives a pause, ends only when the job truly finished |
| `test_agent.py` | the agent end to end — token, Host, CORS, PNA, job, stream, download, resume, disk guard |
| `test_autoupdate.py` | JSX picked up, unchanged file skipped, tampered file refused, traversal name ignored, cloud down is not fatal |
| `test_unsaved.py` | unsaved-document detection and the pause it writes |
| `test_keyrotation.py` | a spent Gemini key steps aside, the live one becomes the next start, wrap-around, all-spent → 503, and a real error is NOT retried on other keys |
| `test_planauth.py` | `/plan` 401s without the key, with a wrong one and with a near-miss; lets the right one through; CORS admits the site, localhost and `*.vercel.app` previews but refuses a stranger and a lookalike |

### Two things that will bite if forgotten

1. **`public/AIApparelAgent.zip` is a snapshot.** Rebuild it with
   `powershell -File Agent\build-agent-package.ps1 -ForWebsite`, then commit it
   and redeploy the frontend.

   | Change this | Rebuild the zip? | Redeploy Cloud Run? |
   |---|---|---|
   | `automate_production.jsx` (most changes land here) | **No** — the agent fetches it per job | **Yes** — it is served from the image's `scripts/` |
   | `Backend/main.py`, `excel_service.py` | No | Yes |
   | `illustrator_automation.py` | Yes, and designers restart the agent | Yes |
   | `Agent/main.py`, its routes or dependencies | Yes, and designers reinstall | No |

   The JSX row changed when the cloud went live. It used to be served by the
   local backend, so a JSX edit needed nothing; now it comes from Cloud Run,
   and skipping the redeploy leaves every designer on the previous render
   logic with nothing to indicate it.

   The zip is how the agent gets ONTO a PC in the first place; auto-update only
   refreshes one that is already there. Both are needed. A stale zip fails
   silently — nothing errors, designers simply keep running old code.

2. **The JSX auto-update endpoint is the highest-value target in the system.**
   The agent executes what it downloads. It verifies the declared hash, but the
   manifest itself must be served over HTTPS from a domain you control.

---

## 1. The shape

Three pieces. The important part is what is **not** in the cloud.

```
Designer's PC
 ┌────────────────────────────────────────────────────────────┐
 │  Browser  ──── website ────►  Vercel                        │
 │     │                                                       │
 │     ├──── Excel (~200 KB) ──►  Cloud Run  ──► plan.json     │
 │     │                          (parse + Gemini)             │
 │     │                                                       │
 │     └──── pattern.ai + mockup.ai + plan ──►  Local Agent    │
 │                                                  │          │
 │                                            Illustrator      │
 │                                                  │          │
 │           status  ◄──── SSE (localhost) ─────────┤          │
 │                                                  │          │
 │                                    C:\Production\<job>\     │
 │                                                  │          │
 │           Download  ◄──── from agent ────────────┘          │
 └────────────────────────────────────────────────────────────┘
```

### Why the files stay local

| File | Size | Same every job? |
|---|---|---|
| `pattern.ai` | **135 MB** | Yes — MD5 `64ccfe33c488` identical across four job folders |
| `mockup.ai` | 4–89 MB | No |
| `renders/` | **515 MB** | No |
| Output ZIP | **334 MB** | No |
| **Whole job folder** | **~938 MB** | measured on two finished jobs |

Routing those through the cloud would cost ~$0.057/job in GCS egress and **cannot work on Cloud Run at all**: 32 MiB request cap, and its filesystem is tmpfs, so a 135 MB upload also consumes 135 MB of instance RAM. `Backend/main.py:683` reads the whole file into memory (`f.write(await pattern_ai.read())`) — that line alone would fail there.

Keeping them local removes ~98% of the cloud bill and makes status transport free.

### Verified prerequisite

An `https://` page **can** call `http://localhost`. Tested 2026-08-27 in this Chrome against two throwaway servers: one sending `Access-Control-Allow-Private-Network: true` and one not. **Both succeeded** — mixed content does not block localhost, and this Chrome build is not enforcing Private Network Access.

The agent will send the PNA header anyway. Chrome has toggled that policy repeatedly and Safari is stricter, so **designers should be told to use Chrome or Edge**.

---

## 2. Who owns what

| | Runs on | Owns |
|---|---|---|
| **Frontend** | Vercel | UI only. Talks to two backends. |
| **Cloud API** | Cloud Run | Excel parse, Gemini plan, the `_enforce_*` rules, size sorting. Stateless. |
| **Agent** | Designer's PC | Illustrator, all files, all status, downloads. |

---

## 3. One job, step by step

1. Designer opens the Vercel site. Page checks `GET http://localhost:8765/agent/health` and shows **Agent connected** or an install prompt.
2. Designer attaches Excel + `pattern.ai` + `mockup.ai` (+ fonts, + logo library) and ticks the option checkboxes.
3. Browser POSTs **only the Excel + checkboxes** to Cloud Run → gets `plan.json` back.
4. Browser POSTs `plan.json` + the `.ai` files to the **agent** (a local copy — never leaves the machine).
5. Agent creates `C:\Production\<job>\`, writes the files, runs the existing automation.
6. Agent streams status over SSE. Pre-flight pauses (fonts, Center, Hoodie, pattern pieces…) surface exactly as they do today, with the same Continue/Stop buttons.
7. On success the ZIP lands in `C:\Production\<job>\`. Download button pulls it from the agent.
8. **Files stay on disk.** No delete prompt — the designer manages that folder themselves.

---

## 4. Component A — Local Agent

New folder `Agent/`. Reuses `Backend/services/illustrator_automation.py` and `Backend/scripts/` **unchanged**.

### Endpoints (FastAPI on `127.0.0.1:8765`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/agent/health` | `{version, agent_id, illustrator_found}` — drives the connected indicator |
| `POST` | `/jobs` | multipart: `.ai` files, fonts, `plan.json`, `job_name` → starts the job |
| `GET` | `/jobs/{id}/status` | one-shot read, for the initial paint |
| `GET` | `/jobs/{id}/stream` | **SSE** — pushes every status change |
| `POST` | `/jobs/{id}/resume` | `retry` / `continue`, existing pre-flight resume flow |
| `POST` | `/jobs/{id}/cancel` | as today |
| `GET` | `/jobs/{id}/download` | serves the ZIP off disk |
| `GET` | `/jobs` | past jobs on this PC — jobs are kept now, so a history list is worth having |

### SSE details

Server watches `status.json` every 500 ms (two different processes write it — Python and the JSX from inside Illustrator — so there is no in-process event to hook).

Must handle:
- **Terminal close → reconnect loop.** If the server just closes the stream, `EventSource` reconnects forever. Send `event: end` after the final frame and have the client call `source.close()` on `is_ready` / `cancelled`.
- **Half-written JSON.** Both writers overwrite in place. On `JSONDecodeError`, skip that tick and keep the previous value. (This race exists today too — `Backend/main.py:925` has a bare `json.load`.)
- **A pause is not terminal.** Resume writes into the same file; the stream must stay open.
- `asyncio.sleep`, never `time.sleep`.
- `await request.is_disconnected()` so the generator ends when the tab closes.

### Autostart — read this before choosing

**Do NOT install the agent as a Windows Service.** Services run in Session 0, isolated from the desktop. Illustrator is a GUI app driven over COM and **will not work** from there — it fails or hangs with no useful error.

Use one of these instead, all of which run inside the logged-on user's session:

1. **Task Scheduler**, trigger *At log on*, "Run only when user is logged on" — simplest, scriptable in the installer.
2. **Startup folder shortcut** — even simpler, easy for a designer to see and disable.
3. **System-tray app** — nicest UX (shows running/idle, opens the Production folder), most work.

Start with option 1.

Security for the agent is its own section — see §7. It is the part of this plan most likely to be got wrong.

### One job at a time

Today a single user runs a single job, so nothing enforces this. A website removes that guarantee: a double-clicked submit button, or two tabs, starts two automations against **one** Illustrator instance. They will corrupt each other.

The agent needs a hard single-job lock:

- A second `POST /jobs` while one is running returns `409` with the running job's id, not a queue position.
- The UI shows "a job is already running" and offers to jump to it.
- The lock must survive an agent crash — store the running job id on disk and clear it on startup after checking whether that job actually finished.

### Version pinning

A designer running last month's agent against this month's frontend fails in confusing ways. `/agent/health` returns the agent version; the site compares it against the version it was built for and shows an update prompt on mismatch. Cheap to add now, painful to retrofit.

### Disk growth

**~938 MB per job** (renders 515 MB + zip 334 MB + the source files) and nothing is ever deleted — deliberate, the designer owns that folder. So roughly **1 GB per job**: thirty jobs is ~28 GB, and a 100 GB drive holds about a hundred before it is full.

- Before starting a job, `shutil.disk_usage()` on the Production folder. Refuse below ~5 GB (one job plus Illustrator's scratch), warn below ~20 GB with "about N jobs of room left".
- `/agent/health` reports free space so the site can warn before the designer has attached anything.
- The jobs list shows each job's size, so cleaning up is easy when the designer chooses to.

Note this is NOT only the job folders. Illustrator keeps a **scratch disk** — its own virtual memory, written into the temp folder, several GB, and not released until Illustrator quits. A RAM check cannot see it, which is a second reason the memory-threshold restart below is worth having: it clears both.

### Storage layout

Same shape as today's `uploads/<job>/`, just relocated — so `illustrator_automation.py` only needs its base directory changed.

```
C:\Production\
  <job-name>\
    pattern.ai   mockup.ai   logo_library.ai
    Document Fonts\
    production_plan.json
    status.json
    automation_bundle.jsx
    renders\<size>\...
    order_<job>_ready.zip
```

---

## 5. Component B — Cloud API

From `Backend/main.py`, keep only the planning half.

**Keep:** `parse_order_excel`, `ApparelOrchestratorAgent`, every `_enforce_*`, `_dedupe_unpersonalized`, `_sort_size_groups`.

**Drop:** file saving, `BackgroundTasks`, `/jobs/status`, `/jobs/resume`, `/jobs/cancel`, `/jobs/download` — all of that moves to the agent.

**One endpoint:**

```
POST /plan
  multipart: excel_file + the option checkboxes + user_instructions + job_name
  → plan.json (the same dict the agent then executes)
```

**Also drop `SQLiteSession`.** Every upload builds a fresh session and runs the agent exactly once (`Backend/main.py:710-721`), so it carries no conversation state — and the SQLite file would not survive a Cloud Run restart anyway.

**Auth — required, not optional.** This is a public endpoint with an LLM behind it. Unauthenticated, anyone who finds the URL spends your Gemini quota, and a scripted loop could do real damage before you notice.

Minimum: a shared API key the frontend sends as a header, held in Vercel's server-side env and proxied through a Next.js route handler so it never reaches the browser. Better, once there are real designer accounts: Firebase Auth / Identity Platform and verify the token in the endpoint. Add Cloud Armor or a simple per-IP rate limit either way, plus a Cloud Billing budget alert.

**Config:**
- `GEMINI_API_KEY` → Secret Manager, not an env var in the YAML
- 512 MB / 1 vCPU, `min-instances=0` — Excel parsing only
- Request timeout **300 s** (the Gemini client alone allows 120 s, `Backend/main.py:46`)
- CORS locked to the Vercel domain

---

## 6. Component C — Frontend

- Two base URLs from env: `NEXT_PUBLIC_CLOUD_API` and `NEXT_PUBLIC_AGENT_URL` (default `http://localhost:8765`). Every hardcoded `http://localhost:8000` goes — there are 4, all in `Frontend/my-app/components/`.
- `UploadForm.tsx:227` splits into two calls: Excel → cloud, then plan + `.ai` files → agent.
- `ProductionPlan.tsx:104-119` — `setInterval` replaced by `EventSource`, plus one initial `fetch` so the panel paints immediately.
- **New: agent status indicator.** Without it a designer whose agent is not running uploads everything and watches nothing happen. Poll `/agent/health` on page load and show install help when it fails.
- **New: pairing token field.** One-time paste on first use, kept in `localStorage`, sent on every agent call. See §7.
- **No delete prompt after download** — decided against. The ZIP stays in `C:\Production`.

---

## 7. Security

### Status at a glance

Verified against the code 2026-08-27.

| | Item | State |
|---|---|---|
| ✅ | **Path traversal** on `resume`/`cancel`/`status`/`download`/`stream` | Fixed — `_job_dir_for()`, name rule + resolved-path containment. `cancel` was the dangerous one: it **writes**. |
| ✅ | **Disk exhaustion by repeated failures** | Fixed — a job that never launches no longer leaves ~139 MB behind. |
| ✅ | **Concurrent jobs corrupting each other** | Fixed — single-job lock, claimed in the request. |
| ✅ | `GEMINI_API_KEY` is server-side only | Read from env in `main.py:34`; nothing in `NEXT_PUBLIC_*`. Keep it that way. |
| ⬜ | **CORS is `allow_origins=["*"]`** (`main.py:757`) | **Ship-blocker.** Any website could drive the agent. |
| ⬜ | **uvicorn binds `0.0.0.0`** (`main.py:1250`) | **Ship-blocker.** The whole LAN can reach it. Must be `127.0.0.1`. |
| ⬜ | **No authentication anywhere** | Pairing token for the agent; API key/Auth for Cloud Run. |
| ⬜ | **No `Host` header check** | DNS-rebinding defence. |
| ⬜ | **No PNA header** | `Access-Control-Allow-Private-Network: true`. |
| ⬜ | Secret Manager for `GEMINI_API_KEY` | Only relevant once Cloud Run exists. |

The two ship-blockers are correct for a dev machine and harmless today — the backend is only reachable from that PC's own browser. They become dangerous the moment this is handed to designers, so neither may survive phase 1.

### The site is restricted to the office networks — 2026-08-31

Cloud Run sits behind `CLOUD_API_KEY` and the agent behind a pairing token on
loopback, but the Vercel site itself was a public URL — and `/api/plan` attaches
the key server-side for **whoever asks**. The loss was never data; it was that a
stranger who found the URL could spend the Gemini quota and leave the designers
on 503s.

`Frontend/my-app/proxy.ts` closes it: the visitor's public IP must appear in
`ALLOWED_IPS` or the request gets a 403.

**📄 The full account is `NETWORK_ACCESS.md`** — how IP addressing and NAT make
this work at all, why the header cannot be forged, the setup and repair
procedure, and what the approach costs. What follows here is only the summary.

| | |
|---|---|
| **File name** | `proxy.ts`, not `middleware.ts` — Next 16 deprecated the middleware convention and renamed it. The exported function must be called `proxy`, and it runs on the Node.js runtime |
| **Which header** | `x-vercel-forwarded-for`, then `x-real-ip`, then the leftmost `x-forwarded-for`. Vercel sets all three itself and *"[does] not forward external IPs… to prevent IP spoofing"*, so a visitor cannot forge one — tested with a forged header carrying an allowed address |
| **No `matcher`** | Deliberate. It runs on every request — pages, `/api`, `_next/static`, and `public/AIApparelAgent.zip`. A stranger gets nothing at all, including the agent installer |
| **Empty `ALLOWED_IPS`** | Blocks everything. A forgotten gate must fail shut, not open — and the block page names the address to add, so the failure repairs itself |
| **Loopback** | `127.0.0.0/8` and `::1/128` always pass, matched on parsed bytes. `next start` reports loopback as `::ffff:127.0.0.1`, so a string compare against `"127.0.0.1"` silently 403s your own `npm run dev` — that bug was written and caught in testing |
| **`no-store` on the block** | Without it the CDN could serve an allowed visitor's page to a blocked one, and a cached 403 would outlive the `ALLOWED_IPS` fix meant to clear it |

The networks, found 2026-08-31 — five wifis, but only **three internet lines**,
and lines are what need listing:

| SSID | Address | ISP |
|---|---|---|
| `J&S Marketing` | `39.34.163.45` | AS132165 Connect Communications |
| `J&S 2.4GHZ` | `39.34.163.45` | the other band of that same router |
| `Jazznet1` | `154.198.107.184` | AS45669 PMCL / Jazz |
| `PTCL FF` | `39.53.236.91` | AS17557 PTCL |
| *one more* | still to be checked | |

The list lives in **Vercel → Settings → Environment Variables**, not in the
repo: `Frontend/my-app/.env` is gitignored and never reaches the deployment.
`ALLOWED_IPS` is inlined at build time, so **changing it needs a redeploy.**

**Do not put an IP allowlist on Cloud Run.** Its only caller is Vercel, whose
egress addresses are not fixed; the `CLOUD_API_KEY` already covers it, and the
key never leaves the Vercel server.

### The agent is the sensitive part

It exposes "run Illustrator automation and read/write files on this PC". Three things must be true, and the first one is the one people get wrong.

**① CORS is not a security boundary.**

`Access-Control-Allow-Origin: https://ourapp.vercel.app` only constrains **browsers**. It does nothing against `curl`, a native app, a script, or anything already running on that machine. Treating it as the lock is the single most common mistake in this architecture.

The actual lock is a **pairing token**:

- The agent generates a random token on install and shows it (tray menu, or a text file next to the installer).
- The designer pastes it into the site once; it lives in `localStorage`.
- Every agent request carries it as a header. No token, no service — before any file is touched.
- Compare in constant time; log and rate-limit failures.

CORS stays on as defence-in-depth, not as the defence.

**② DNS rebinding.**

A hostile site can point `evil.com` at `127.0.0.1`, at which point its own origin satisfies any CORS rule you wrote. Defences:

- Validate the `Host` header — accept only `localhost` / `127.0.0.1` (+ the agent's port).
- The token from ① blocks this anyway, which is why it is the primary control.

**③ Bind to loopback only.**

`127.0.0.1`, never `0.0.0.0`. On `0.0.0.0` every machine on the office LAN can reach that agent.

Also: send `Access-Control-Allow-Private-Network: true` on preflights (see §1).

### Paths from user input

`job_name` is already sanitized — `_safe_job_name` via `_unique_job_dir` (`Backend/main.py:250-263`), and it rejects names with no alphanumerics. That protection has to be carried over to the agent, and **the same treatment applied to the `{id}` in `/jobs/{id}/download`, `/status`, `/stream` and `/resume`** — those build a path from a URL segment. Resolve the final path and confirm it is still inside `C:\Production` before opening anything.

### Secrets

- `GEMINI_API_KEY` stays server-side. It must never end up in a `NEXT_PUBLIC_*` variable — those are compiled into the browser bundle.
- On Cloud Run use Secret Manager, not plain env vars.
- The pairing token is per-PC. Do not ship one baked into the installer for everyone.

---

## 8. Edge cases

### Must handle

| # | Case | Handling |
|---|---|---|
| 1 | ✅ **Designer has unsaved work open in Illustrator** | **Done.** The job now pauses before touching Illustrator and names the unsaved documents, offering save-and-recheck / close-anyway / stop. It also no longer quits Illustrator at the end, and reuses it instead of relaunching. |
| 2 | ✅ Submit clicked twice / two tabs | **Done** — server-side single-job lock, §0. |
| 3 | Tab closed mid-job | Job keeps running on the agent (good). Reconnect by `job_id` from the jobs list, and re-attach the stream. |
| 4 | Agent up, Illustrator not installed | `/agent/health` reports it up front, instead of failing 30 seconds into a job. |
| 5 | ⬜ Disk full | `shutil.disk_usage()` before starting: refuse below ~5 GB, warn below ~20 GB. ~1 GB goes per job, and Illustrator's scratch disk is on top of that. |
| 6 | PC sleeps, or Windows Update reboots mid-job | A 28-minute job dies. Hold a sleep block (`SetThreadExecutionState`) while a job runs; on startup, mark interrupted jobs as failed rather than leaving them "running" forever. |
| 7 | Job fails halfway | The partial `C:\Production\<job>\` folder stays. Status must say clearly that it is incomplete, so a half-built ZIP is never mistaken for a finished one. |

### Know about, may not fix now

| # | Case |
|---|---|
| 8 | Illustrator versions differ per designer — the ProgID is hardcoded (`Backend/services/illustrator_automation.py:838`). Probe and report the version found. |
| 9 | A 135 MB upload to the agent that breaks mid-transfer has no resume — it just starts over. |
| 10 | Cloud Run cold start + Gemini is 20-30 s of silence. Needs a spinner with real text. |
| 11 | The first ~13 minutes of a full order look exactly like a hang while the JSX builds its name index. The UI must keep saying something. |
| 12 | Two designers can pick the same job name on different PCs. Harmless while folders are local, but their ZIPs share a filename. |

---

## 9. Build order

| Phase | What | Why first |
|---|---|---|
| **1** | Agent: relocate storage, endpoints, SSE, **pairing token**, **single-job lock**, Host check, loopback bind, CORS/PNA, autostart | 90% of the code already exists; once it runs, everything else builds around it. The token and the lock are not "later" items — they are what makes the agent safe to hand out at all |
| **2** | Cloud API split + **auth** + deploy to Cloud Run | Small and independent |
| **3** | Frontend: two base URLs, split upload, SSE, health indicator, token field, Illustrator warning | Needs 1 and 2 to exist |
| **4** | Installer for designers (agent + Task Scheduler + Illustrator check + token generation) | Last — needs a stable agent |

The current local flow keeps working untouched throughout phases 1–2.

---

## 10. Risks

1. **Session-0 trap** — covered above. The single most likely week-waster.
2. **Illustrator version** — `Backend/services/illustrator_automation.py:838` hardcodes `Illustrator.Application.CC.2015` with a plain fallback. Designers will have different versions; the agent should probe and report which it found via `/agent/health`.
3. **Per-seat licensing** — every designer's PC needs its own licensed Illustrator. Not a technical problem, but a real cost.
4. **Agent updates** — pushing a new agent build to N machines. Simplest start: version in `/agent/health`, and the site warns when it is behind.
5. **Browser handling a 135 MB file** — pass the `File` object straight into `FormData`; the browser streams it. Do not read it into JS memory.
6. **Long jobs** — a full order is ~28 minutes and its first ~13 minutes look exactly like a hang while the JSX builds its name index. The UI must keep saying something.

---

## 11. What does not change

- `Backend/scripts/automate_production.jsx` — all 11,306 lines, untouched.
- `Backend/services/illustrator_automation.py` — internals untouched; only the base directory and the caller change.
- `Backend/services/excel_service.py` — moves to the cloud as-is.
- The `status.json` contract and every pre-flight pause flag.
- The watchdog (still reads that file's mtime).

---

## 12. Shipping automation changes after deployment

The automation code lives on the designers' PCs, so every change has to travel there. This is the recurring operational cost of this architecture and it needs a plan up front, not later.

### The lucky part

The JSX is already loaded from disk at job time, not compiled into anything. `illustrator_automation.py:1374-1390` reads `scripts/automate_production.jsx`, bundles it with `json2.jsx` and the job's arguments into `automation_bundle.jsx`, and `$.evalFile`s it (`:1417`).

So the render logic is **data to the agent**, not part of it. If the agent fetches that file from the cloud at job start, JSX changes ship instantly with **no agent update at all** — and the JSX is where nearly all the churn is (11,306 lines, and most of this project's history is changes to it).

### Three tiers

| Tier | What | How it updates | How often it changes |
|---|---|---|---|
| **1 — Render logic** | `automate_production.jsx`, `json2.jsx` | Agent downloads the current version before each job, caches by version | Often |
| **2 — Automation Python** | `illustrator_automation.py` (COM, pre-flights, fonts, zip) | Same package, applied between jobs, agent reloads | Sometimes |
| **3 — Agent shell** | `Agent/main.py`, endpoints, dependencies | Real installer update | Rarely |

Bundle tiers 1 and 2 as one versioned **automation package** the agent fetches. Keep tier 3 thin and boring on purpose — every line you put in the agent shell is a line that needs an installer run to fix.

### Rules

- **Never update mid-job.** Check for a new package only when idle. A swap during a 28-minute render is unrecoverable.
- **Serve it signed, or at least checksummed over HTTPS from your own domain.** The agent executes what it downloads — whoever controls that endpoint controls every designer's PC. This is the highest-value target in the whole system.
- **Keep the last-known-good package.** A bad push otherwise breaks every designer at once with no way back. The agent should be able to fall back and report it.
- **Channels.** Your own PC on `beta`, designers on `stable`, so a change is proved on a real job before it goes out.
- **Pin and report.** `/agent/health` returns the automation package version too, and finished jobs record which version rendered them — otherwise "it worked last week" is unanswerable.

### What still needs a real agent update

New endpoints, new Python dependencies, or a change to how the agent itself talks to the browser. Budget for that being a manual round to each machine until an auto-updater for tier 3 exists.

---

## 13. Open questions

- Which Illustrator versions are actually on the designers' machines?
- Does every designer need the full history list, or only their current job?
- Should the agent cache `pattern.ai` by hash, so the browser does not re-read 135 MB from disk on every job? (Nice-to-have, phase 2+.)
- Custom domain for Cloud Run, or is the generated `*.run.app` URL fine?



│     │        Issue        │                                                                                    Tafseel                                                                                     │
├─────┼─────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ A   │ Orphan folders      │ main.py:678-694 par pattern.ai (135 MB) + mockup.ai disk par likh diye jate hain — try block (:707) se pehle. Agar Excel parse ya Gemini call fail ho jaye, :846 par 500 aata  │
│     │                     │ hai aur wo ~139 MB ka folder hamesha ke liye paRa rehta hai. Koi cleanup nahi. Baar baar fail = disk bhar gayi                                                                 │
├─────┼─────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ B   │ Double-resume       │ /jobs/resume (:855) bhi bina check kiye naya background task banata hai. Pause par do baar "Continue" click = do automation, ek hi Illustrator par. Wahi bug, alag darwaza     │
├─────┼─────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ C   │ Cancel asal me      │ :908-912 ki docstring khud kehti hai: "Does NOT touch run_illustrator_automation". Sirf paused jobs ke liye theek hai (wahan background task pehle hi return kar chuka hota    │
│     │ rokta nahi          │ hai), aur Stop button bhi sirf pause alerts me dikhta hai — is liye aaj safe hai. Lekin agent me asli "stop" ki tawaqqo hogi                                                   │
└─────┴─────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


For ip command : Invoke-RestMethod ifconfig.me/ip