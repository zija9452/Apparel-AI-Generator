---
id: 169
title: Agent cloud API never set
stage: green
date: 2026-09-07
surface: agent
model: claude-opus-5
feature: none
branch: main
user: zija9452
command: (chat request)
labels: ["agent", "deployment", "jsx-distribution", "cloud-run", "observability"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Agent/main.py
 - Agent/install-agent.ps1
tests:
 - PowerShell AST parse of install-agent.ps1 -> syntax OK
 - python -m py_compile Agent/main.py -> compiles OK
 - GET https://apparel-cloud-api-sclqd4y36a-el.a.run.app/automation/manifest -> all 3 hashes match Backend/scripts
 - GET /automation/file/automate_production.jsx -> 774612 chars, contains "function sizeCodes()"
---

## Prompt

\check my backend deployment , usme thk he version , or i need to again redeploy this ??

(followed mid-turn by: "solve this ,")

## Response snapshot

### Deployment check: current, no redeploy needed

Cloud Run URL resolved with
`gcloud run services describe apparel-cloud-api --region asia-south1 --format="value(status.url)"`
-> `https://apparel-cloud-api-sclqd4y36a-el.a.run.app`

`/automation/manifest` reports version `e8a9695bd5b01788`, and all three file
hashes are byte-identical to `Backend/scripts/`:

```
automate_production.jsx = f2e6509e3710b26148580aadb0fe708545a9d8e2a59175593bdad6d5b57e0ac3
json2.jsx               = 0258060016b336c39f695e1bc8336efc0b69002a6f8d89188cc90ff7603f80ff
render_orders.jsx       = 15b1c640579b4a82922a24a148d5da62d0cc6075b7aacb509ff34cd0a688d90d
```

Downloading the served file confirms `function sizeCodes()` is present. A first
check also reported `var SIZE_CODES =` still present - that was a **false
positive**: the only two occurrences of that identifier in the file are inside
explanatory comments (L10740, L10802). Live code calls `sizeCodes()` at L10770
and L10822 and `sizeWords()` at L10785.

### The real defect: the fix could never reach a designer

`Agent/main.py:290`
```python
CLOUD_API = os.environ.get("AGENT_CLOUD_API", "http://localhost:8000").rstrip("/")
```
`AGENT_CLOUD_API` was set **nowhere** - not in `install-agent.ps1`, not in any
config. Every installed agent therefore asked its own PC's `localhost:8000`,
where nothing listens, and `_sync_automation()` (called per job at
`main.py:490`) bailed with a `WARNING` that is non-fatal by design
(`main.py:311`: "A failure here is never fatal"). Net effect: the whole
content-hash distribution mechanism was dead on every designer's machine, and
`Strictly_Molokai_Brown_Jersey_Order_Youth-3` crashed on a bug already fixed and
deployed days earlier. See [[168-jsx-error-line-10270-undefined]].

### Change

`Agent/install-agent.ps1`
- new `-CloudApi` parameter, defaulting to the Cloud Run URL; documented
  `-CloudApi "http://localhost:8000"` for a machine that runs the backend itself
- writes `AGENT_CLOUD_API` to the User environment (HKCU - no admin, nothing
  outside the profile, matching the rest of the installer) before the task is
  registered, and also into the installing process so the agent it starts on
  this very run already points at the right address
- prints "Render logic comes from <url>"

`Agent/main.py`
- the sync warning now names the URL it tried and says plainly that the local
  copy may be out of date, instead of surfacing a bare `WinError 10061` that
  reads like a transient network blip
- startup banner prints `Render logic   <CLOUD_API>`; under pythonw that banner
  IS `agent.log`, so a mis-set address shows up in the file people actually send
  when asking for help

## Outcome

- ✅ Impact: JSX auto-distribution can now actually work on a designer PC; a wrong address is visible in the banner instead of silent.
- 🧪 Tests: PS AST parse OK; py_compile OK; manifest + file endpoints verified against live Cloud Run.
- 📁 Files: `Agent/install-agent.ps1` (+28), `Agent/main.py` (+16/-1). Backend untouched - nothing to redeploy.
- 🔁 Next prompts: Re-run the installer on each designer PC (that is what applies the env var); decide whether this dev machine should point at the cloud or stay on localhost:8000.
- 🧠 Reflection: The deployment was never the problem - the delivery path was. A non-fatal warning with no address in it hid a mechanism that had never once run in production.

## Evaluation notes (flywheel)

- Failure modes observed: A deliberately non-fatal failure with a vague message can hide a completely dead subsystem indefinitely. Also: a regex written to check for a removed construct matched the comment explaining its removal - grep-for-absence needs to exclude comments before it can be trusted.
- Graders run and results (PASS/FAIL): PASS - hashes compared against the live service, not assumed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Surface `automation_version` (already recorded into `plan_data`) in the job UI, so a stale agent is visible to the designer without opening a log.
