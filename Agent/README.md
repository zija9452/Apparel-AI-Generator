# AI Apparel Agent

The part that runs on **your own PC**, because Illustrator does.

The website itself lives in the cloud, but Illustrator is a Windows program — it
cannot run there. So the website builds the plan, and this agent does the actual
Illustrator work here, on your machine. Your pattern and mockup files never
leave the PC, and the finished orders stay in `C:\Production`.

---

## Install (once)

1. Download **AIApparelAgent.zip** from the website.
2. Right-click it → **Extract All**. You get a folder called `AIApparelAgent`.
3. Open that folder, right-click **install-agent.ps1** → **Run with PowerShell**.

That is the whole install. The script does the rest by itself, on a PC with
nothing on it:

- installs **Python** if it is not there (silently, no administrator rights)
- installs the agent's packages, including Illustrator COM support
- registers the agent to start at every logon
- opens the website **already paired** — you never see or type a token

Give it a few minutes the first time. If the browser does not open at the end,
run `install-agent.ps1 -ShowToken` and paste the token into the website once.

From then on there is nothing to open and nothing to remember.

---

## What you should know

**Keep your Illustrator work saved.** A job closes whatever documents are open,
without saving. It will stop and warn you first, naming the unsaved files — but
saving before you start a job avoids the interruption.

**One job at a time.** Illustrator can only build one order at once. Starting a
second job while one is running is refused, not queued.

**Orders are never deleted.** Every job leaves about **1 GB** in
`C:\Production\<job name>\`. Roughly a hundred jobs will fill a 100 GB drive.
The agent refuses to start a job below 5 GB free and warns you below 20 GB —
clear out old order folders when that happens.

**Illustrator stays open.** The agent no longer quits it between jobs; it just
closes the documents and leaves an empty Illustrator ready. If it has been open
for a very long time and jobs start feeling slow, close and reopen it.

---

## If something is wrong

**The website says the agent is not running**

Check whether the task is there:

```powershell
Get-ScheduledTask -TaskName "AI Apparel Agent"
Start-ScheduledTask -TaskName "AI Apparel Agent"
```

**You want to see what it is doing**

Run it in a window instead, and read the log as it goes:

```powershell
.venv\Scripts\python.exe main.py
```

**You lost the pairing token**

```powershell
powershell -ExecutionPolicy Bypass -File install-agent.ps1 -ShowToken
```

**You want it gone**

```powershell
powershell -ExecutionPolicy Bypass -File install-agent.ps1 -Uninstall
```

Your orders in `C:\Production` are left alone.

---

## For whoever maintains this

- Listens on **127.0.0.1:8765 only**. Never bind `0.0.0.0` — that hands the
  whole office LAN the ability to drive this Illustrator and read these files.
- Every route except `/agent/health` needs the `X-Agent-Token` header. CORS is
  defence-in-depth, not the lock: it constrains browsers, and the threat is not
  limited to browsers.
- A foreign `Host` header is rejected (`421`) — that is the DNS-rebinding case,
  where a hostile site points its own domain at `127.0.0.1`.
- Installed as a **Scheduled Task at logon**, never a Windows Service. Services
  run in Session 0, isolated from the desktop, where COM automation of a GUI
  application hangs instead of failing usefully.
- The Illustrator automation itself is shared with the local backend and lives
  in `Backend/services/`. It is imported, not copied.

See `../DEPLOYMENT_PLAN.md` for how this fits with the cloud half.
