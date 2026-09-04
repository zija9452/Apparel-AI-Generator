"""The local agent: the half of this system that must run on the designer's PC.

Illustrator is a Windows GUI application driven over COM. It cannot go to Cloud
Run, App Engine or any Linux container, so the rendering half stays here while
the planning half (Excel + Gemini) moves to the cloud. See DEPLOYMENT_PLAN.md.

It also keeps the big files off the network entirely: pattern.ai is ~135MB and
identical on every job, and a finished job folder is ~938MB. Both are produced
and consumed on this same machine, so routing them through a cloud bucket would
be pure cost - and would not fit Cloud Run's 32MB request cap anyway.

Run it with:  python Agent/main.py
"""
import hmac
import json
import logging
import os
import secrets
import shutil
import sys
import tempfile
from typing import List, Optional

# ---------------------------------------------------------------------------
# NO CONSOLE, NO STREAMS.
#
# The scheduled task launches this with pythonw.exe so the designer never sees
# a window they can close by accident. pythonw gives the process
# sys.stdout = None - and the first print() below then raises AttributeError
# and kills the agent before it ever listens on a port, writing nothing
# anywhere. Started by hand with python.exe it works perfectly, which makes the
# failure look like the Scheduled Task's fault. It is not.
#
# So: point both streams at a log file. The crash goes away and the designer
# gains something they did not have before - a record of what the agent did.
# ---------------------------------------------------------------------------
LOG_DIR = os.path.join(
    os.environ.get("LOCALAPPDATA") or tempfile.gettempdir(), "AIApparelAgent"
)
LOG_PATH = os.path.join(LOG_DIR, "agent.log")

if sys.stdout is None or sys.stderr is None:
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        # Uvicorn logs every request. Start a fresh file rather than growing one
        # forever; 5MB is a long history of a machine that runs a few jobs a day.
        if os.path.exists(LOG_PATH) and os.path.getsize(LOG_PATH) > 5 * 1024 ** 2:
            os.replace(LOG_PATH, LOG_PATH + ".old")
        _log_file = open(LOG_PATH, "a", encoding="utf-8", buffering=1)
        sys.stdout = _log_file
        sys.stderr = _log_file
    except Exception:
        # Nowhere to write is survivable; dying on the first print is not.
        # os.devnull swallows the output and lets the agent come up.
        _null = open(os.devnull, "w")
        sys.stdout = _null
        sys.stderr = _null

# WHERE THE AUTOMATION LIVES - two layouts, one file.
#
#   Packaged (a designer's PC)     Repo (development)
#   AIApparelAgent\               AI-Apparel-Order-Generator\
#     main.py                       Agent\main.py
#     services\                     Backend\services\
#     scripts\                      Backend\scripts\
#
# A designer must never be handed the repo: it carries the Gemini agent, the
# API key and the whole frontend, none of which their PC needs. So the package
# gets `services/` and `scripts/` beside main.py, and this prefers that when it
# is there. Either way illustrator_automation finds the JSX bundle, because it
# resolves it as <parent of services>/scripts from its own __file__ - which is
# true in both layouts.
_AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
if os.path.isdir(os.path.join(_AGENT_DIR, "services")):
    _CODE_ROOT = _AGENT_DIR
else:
    _CODE_ROOT = os.path.join(os.path.dirname(_AGENT_DIR), "Backend")
sys.path.insert(0, _CODE_ROOT)

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, BackgroundTasks  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from services import job_runtime  # noqa: E402
from services.illustrator_automation import run_illustrator_automation, update_status  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("apparel-agent")

# Bumped whenever an installed agent must actually be replaced rather than
# left running. install-agent.ps1 compares this against the version answering
# on 8765 after it starts, which is the only way it can tell "the new agent is
# up" from "the OLD agent is still holding the port and answered for it".
AGENT_VERSION = "0.4.0"

# Where every job lives on this PC. Renders and the zip are left here on
# purpose - the designer owns this folder and decides when to clear it.
PRODUCTION_DIR = os.environ.get("PRODUCTION_DIR", r"C:\Production")

AGENT_HOST = os.environ.get("AGENT_HOST", "127.0.0.1")
AGENT_PORT = int(os.environ.get("AGENT_PORT", "8765"))

# Refuse a job below this, warn below the second. A job folder is ~938MB and
# Illustrator's scratch disk is on top of that.
DISK_REFUSE_BYTES = 5 * 1024 ** 3
DISK_WARN_BYTES = 20 * 1024 ** 3

# Which origins may drive this agent from a browser.
#
# CORS is defence-in-depth here, NOT the security boundary: it constrains
# browsers and nothing else - curl, a native app, or anything already running
# on this PC ignores it completely. The actual lock is the pairing token below.
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get(
        "AGENT_ALLOWED_ORIGINS",
        "https://jns-apparel.vercel.app,"
        "https://apparel-ai-generator.vercel.app,"
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",") if o.strip()
]

# THIS PROJECT's Vercel deployments, matched by pattern rather than listed.
#
# WHY A PATTERN AND NOT A LIST. This default is compiled into the copy of the
# agent sitting on each designer's PC, and the scheduled task runs it with no
# environment of its own - so a list here can only be corrected by reinstalling
# on every machine. That is exactly what happened when the site moved from
# apparel-ai-generator.vercel.app to jns-apparel.vercel.app: every installed
# agent kept refusing the new origin, the site reported "agent offline", and
# nothing in the browser explained why. The pattern makes the next rename a
# non-event.
#
# It also covers Vercel's per-deployment preview subdomains, which are
# generated per commit and cannot be enumerated:
#   jns-apparel-a1b2c3.vercel.app, jns-apparel-git-main-team.vercel.app
#
# WHY IT NAMES THE PROJECT AND IS NOT JUST .*\.vercel\.app. Anyone can deploy
# to vercel.app in a minute, so the wildcard form would let any stranger's page
# talk to every agent in the office. It could not drive one - every route but
# /agent/health needs the pairing token, and that token sits in OUR origin's
# localStorage where a different origin cannot read it - but it would let an
# unrelated site confirm the agent is running and read its health. There is no
# reason to allow that, so this is scoped to deployments whose name starts with
# the project's own.
#
# Anchoring is free: Starlette matches this with re.fullmatch, so
# https://jns-apparel.vercel.app.example.com does NOT match.
ALLOWED_ORIGIN_REGEX = os.environ.get(
    "AGENT_ALLOWED_ORIGIN_REGEX",
    r"https://(jns-apparel|apparel-ai-generator)[a-z0-9-]*\.vercel\.app",
)

# ---------------------------------------------------------------------------
# PAIRING TOKEN - the real lock on this agent
#
# This service will run Illustrator and read and write files on someone's PC.
# CORS cannot protect that: it is a browser courtesy, and the threat includes
# things that are not browsers. So every route except the health check requires
# a shared secret that only this machine and its owner have seen.
#
# It also closes DNS rebinding, where a hostile site resolves its own name to
# 127.0.0.1 and therefore satisfies any origin rule that was written.
#
# Kept OUT of the Production folder on purpose - the designer browses that
# folder, and a secret sitting among the order zips will eventually be shared
# with one of them.
# ---------------------------------------------------------------------------
TOKEN_DIR = os.environ.get(
    "AGENT_TOKEN_DIR",
    os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "AIApparelAgent"),
)
TOKEN_PATH = os.path.join(TOKEN_DIR, "agent_token.txt")


def _load_or_create_token() -> str:
    """This PC's pairing token, generated once and kept."""
    override = os.environ.get("AGENT_TOKEN")
    if override:
        return override.strip()
    try:
        with open(TOKEN_PATH, "r") as f:
            existing = f.read().strip()
        if existing:
            return existing
    except OSError:
        pass
    token = secrets.token_urlsafe(32)
    os.makedirs(TOKEN_DIR, exist_ok=True)
    with open(TOKEN_PATH, "w") as f:
        f.write(token)
    logger.info(f"Generated a new pairing token at {TOKEN_PATH}")
    return token


AGENT_TOKEN = _load_or_create_token()

# Routes reachable without the token. Only the health check, and only because
# the site has to be able to say "your agent is not running" as distinct from
# "your agent is running but you have not paired with it yet". It answers with
# nothing sensitive until a valid token is presented.
PUBLIC_PATHS = {"/agent/health"}

os.makedirs(PRODUCTION_DIR, exist_ok=True)

app = FastAPI(title="AI Apparel Local Agent", version=AGENT_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# Two GET routes may carry the token in the query string instead of a header,
# because the browser APIs that reach them CANNOT send headers:
#
#   /stream    EventSource has no header option at all.
#   /download  a plain navigation is the only way to save a ~334MB file; going
#              through fetch would hold the whole thing in tab memory first.
#
# The cost is the token appearing in this agent's own local log and, for the
# download, in browser history. Both stay on the machine that owns the token,
# which is why it is acceptable here and nowhere else - every other route
# requires the header.
QUERY_TOKEN_SUFFIXES = ("/stream", "/download")


def _token_is_valid(request: Request) -> bool:
    presented = request.headers.get("x-agent-token") or ""
    if not presented and request.url.path.endswith(QUERY_TOKEN_SUFFIXES):
        presented = request.query_params.get("token") or ""
    # Constant time: a plain == leaks how much of the token was right.
    return hmac.compare_digest(presented, AGENT_TOKEN)


@app.middleware("http")
async def require_pairing_token(request: Request, call_next):
    """No token, no service - checked before any file is touched."""
    # A browser cannot attach custom headers to a CORS preflight, so OPTIONS
    # has to pass through to the CORS layer or nothing would ever work.
    if request.method == "OPTIONS" or request.url.path in PUBLIC_PATHS:
        return await call_next(request)
    if not _token_is_valid(request):
        logger.warning(f"Rejected an unpaired request to {request.url.path}")
        return JSONResponse(
            status_code=401,
            content={"detail": "Missing or wrong agent token. Pair this browser with the agent first."},
        )
    return await call_next(request)


@app.middleware("http")
async def only_from_this_machine(request: Request, call_next):
    """Rejects anything not addressed to loopback.

    DNS rebinding: a hostile page can point its OWN domain at 127.0.0.1, so the
    request arrives with `Host: evil.example` and its origin passes any CORS
    rule that was written for it. The socket is already bound to loopback, so
    the only thing left to check is what the request THINKS it is talking to.
    """
    host = (request.headers.get("host") or "").split(":")[0].lower()
    if host and host not in ("localhost", "127.0.0.1", "::1", "[::1]"):
        logger.warning(f"Rejected a request with Host '{host}' - not loopback")
        return JSONResponse(status_code=421, content={"detail": "This agent only answers on localhost."})
    return await call_next(request)


@app.middleware("http")
async def private_network_access(request: Request, call_next):
    """Lets an https:// page reach this http://localhost service.

    Chrome's Private Network Access asks permission before a public site may
    talk to a private address, by sending
    `Access-Control-Request-Private-Network: true` on the preflight. Answering
    is one header. Measured 2026-08-27: this Chrome build is not enforcing PNA
    yet - both a server that sent the header and one that did not were reached
    successfully from https://example.com - but the policy has been toggled
    repeatedly, so the header goes out regardless.
    """
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network"):
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


# Where this agent asks for the current render logic. See the automation
# distribution note in Backend/main.py for why the JSX travels this way.
CLOUD_API = os.environ.get("AGENT_CLOUD_API", "http://localhost:8000").rstrip("/")
JSX_DIR = os.path.join(_CODE_ROOT, "scripts")


def _sync_automation() -> Optional[str]:
    """Refreshes this PC's copy of the JSX from the cloud. Returns the version.

    WHY THIS EXISTS. automate_production.jsx is where nearly every change in
    this project lands, and it is read from disk at job time rather than
    compiled in - so it can be updated without touching the agent at all.
    Without this, a JSX fix reaches a designer only when they download and
    reinstall the whole package, which nobody does reliably, and they keep
    rendering with last month's logic while believing they are current.

    Only ever called BETWEEN jobs. Swapping the bundle mid-render would be
    unrecoverable.

    Every file is checked against the hash the manifest declares before it is
    allowed to replace anything: this agent EXECUTES what it downloads, which
    makes that endpoint the highest-value target in the whole system.

    A failure here is never fatal - the JSX already on disk is what runs. The
    cloud being unreachable must not stop a designer working.
    """
    import hashlib
    import urllib.request

    try:
        with urllib.request.urlopen(f"{CLOUD_API}/automation/manifest", timeout=15) as r:
            manifest = json.loads(r.read().decode())
    except Exception as e:
        logger.warning(f"Could not check for a newer automation bundle ({e}) - using the local copy")
        return None

    updated = []
    for name, want_hash in manifest.get("files", {}).items():
        # `name` comes from a remote response; never let it build a path.
        if not name.endswith(".jsx") or os.path.basename(name) != name:
            logger.warning(f"Ignoring a suspicious file name in the manifest: {name!r}")
            continue
        target = os.path.join(JSX_DIR, name)
        try:
            with open(target, "rb") as f:
                if hashlib.sha256(f.read()).hexdigest() == want_hash:
                    continue  # already current
        except OSError:
            pass  # missing locally - fetch it

        try:
            with urllib.request.urlopen(f"{CLOUD_API}/automation/file/{name}", timeout=60) as r:
                data = r.read()
            if hashlib.sha256(data).hexdigest() != want_hash:
                logger.error(f"{name} did not match the hash the manifest declared - not installing it")
                continue
            # Keep the last known good copy, and swap atomically so a job can
            # never catch a half-written file.
            if os.path.exists(target):
                shutil.copy2(target, target + ".bak")
            tmp = target + ".tmp"
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, target)
            updated.append(name)
        except Exception as e:
            logger.error(f"Could not update {name} ({e}) - keeping the local copy")

    version = manifest.get("version")
    if updated:
        logger.info(f"Automation updated to {version}: {', '.join(updated)}")
    return version


def _free_bytes() -> Optional[int]:
    try:
        return shutil.disk_usage(PRODUCTION_DIR).free
    except OSError as e:
        logger.warning(f"Could not read free disk space: {e}")
        return None


def _illustrator_prog_ids() -> List[str]:
    """ProgIDs registered on this machine, without launching anything.

    A COM Dispatch would START Illustrator just to find out whether it exists,
    which is exactly what an agent answering a health check must not do."""
    import winreg
    found = []
    for prog_id in ("Illustrator.Application.CC.2015", "Illustrator.Application"):
        try:
            winreg.CloseKey(winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, prog_id))
            found.append(prog_id)
        except OSError:
            continue
    return found


@app.get("/agent/health")
async def health(request: Request):
    """What the website checks before letting a designer attach anything.

    Without it, a designer whose agent is not running uploads three files and
    then watches nothing happen.

    The ONLY route that answers without a token, because the site has to tell
    "agent not running" apart from "agent running, browser not paired yet" -
    and those need different advice. Unpaired callers get proof of life and
    nothing else: no folder path, no disk figures, no job ids.
    """
    paired = _token_is_valid(request)
    body = {
        "agent": "ai-apparel",
        "version": AGENT_VERSION,
        "paired": paired,
    }
    if not paired:
        return body

    free = _free_bytes()
    prog_ids = _illustrator_prog_ids()
    body.update({
        "production_dir": PRODUCTION_DIR,
        "illustrator_found": bool(prog_ids),
        "illustrator_prog_ids": prog_ids,
        "free_bytes": free,
        "free_gb": round(free / 1024 ** 3, 1) if free is not None else None,
        "disk_ok": free is None or free >= DISK_REFUSE_BYTES,
        "running_job_id": job_runtime.current_job_id(),
    })
    return body


@app.get("/jobs")
async def list_jobs():
    """Every job on this PC, newest first. Jobs are kept rather than cleaned up,
    so this is also how the designer finds what is taking the space."""
    out = []
    for name in os.listdir(PRODUCTION_DIR):
        job_dir = os.path.join(PRODUCTION_DIR, name)
        if not os.path.isdir(job_dir):
            continue
        zip_path = os.path.join(job_dir, f"order_{name}_ready.zip")
        try:
            mtime = os.path.getmtime(job_dir)
        except OSError:
            mtime = 0
        out.append({
            "job_id": name,
            "modified": mtime,
            "has_zip": os.path.exists(zip_path),
            "size_bytes": sum(
                os.path.getsize(os.path.join(d, f))
                for d, _sub, files in os.walk(job_dir)
                for f in files
                if os.path.exists(os.path.join(d, f))
            ),
        })
    out.sort(key=lambda j: j["modified"], reverse=True)
    return {"jobs": out}


@app.get("/jobs/running")
async def running_job():
    return {"job_id": job_runtime.current_job_id()}


@app.post("/jobs")
async def start_job(
    background_tasks: BackgroundTasks,
    job_name: str = Form(...),
    # Already built by the cloud (Excel parse + Gemini). The agent does not
    # plan; it renders what it is given.
    plan_json: str = Form(...),
    pattern_ai: UploadFile = File(...),
    mockup_ai: UploadFile = File(...),
    logo_library_ai: Optional[UploadFile] = File(None),
    fonts: List[UploadFile] = File([]),
):
    busy = job_runtime.current_job_id()
    if busy:
        raise job_runtime.busy_error(busy)

    free = _free_bytes()
    if free is not None and free < DISK_REFUSE_BYTES:
        raise HTTPException(
            status_code=507,
            detail=(
                f"Only {free / 1024 ** 3:.1f} GB free in {PRODUCTION_DIR}. A job needs about "
                "1 GB for itself plus room for Illustrator's scratch disk. Free some space "
                "and try again."
            ),
        )

    try:
        plan_data = json.loads(plan_json)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"plan_json is not valid JSON: {e}")

    # Between jobs, and only here: pick up any newer render logic before this
    # one starts. Recorded in the plan so a finished order can always answer
    # "which version built this?".
    automation_version = _sync_automation()
    if automation_version:
        plan_data["automation_version"] = automation_version

    job_id, job_dir = job_runtime.unique_job_dir(PRODUCTION_DIR, job_name)
    os.makedirs(job_dir, exist_ok=True)

    job_started = False
    try:
        pattern_path = os.path.join(job_dir, "pattern.ai")
        with open(pattern_path, "wb") as f:
            f.write(await pattern_ai.read())

        mockup_path = os.path.join(job_dir, "mockup.ai")
        with open(mockup_path, "wb") as f:
            f.write(await mockup_ai.read())

        logo_library_path = None
        if logo_library_ai and logo_library_ai.filename:
            logo_library_path = os.path.join(job_dir, "logo_library.ai")
            with open(logo_library_path, "wb") as f:
                f.write(await logo_library_ai.read())

        if fonts:
            fonts_dir = os.path.join(job_dir, "Document Fonts")
            os.makedirs(fonts_dir, exist_ok=True)
            for font in fonts:
                if font.filename:
                    with open(os.path.join(fonts_dir, font.filename), "wb") as f:
                        f.write(await font.read())

        plan_data["job_id"] = job_id

        claimed_by = job_runtime.claim_job_slot(job_id)
        if claimed_by:
            raise job_runtime.busy_error(claimed_by)
        background_tasks.add_task(
            job_runtime.run_job_locked, run_illustrator_automation,
            job_id, job_dir, plan_data, pattern_path, mockup_path,
            logo_library_ai_path=logo_library_path,
        )
        job_started = True

        response = {"job_id": job_id, "status": "processing_started", "job_dir": job_dir}
        if free is not None and free < DISK_WARN_BYTES:
            response["disk_warning"] = (
                f"{free / 1024 ** 3:.1f} GB free - about {int(free / 1024 ** 3)} more jobs will fit."
            )
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Could not start the job")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if not job_started:
            # A no-op unless the claim succeeded and something after it threw.
            job_runtime.release_job_slot(job_id)
            shutil.rmtree(job_dir, ignore_errors=True)
            logger.info(f"Job '{job_id}' never started - removed its folder")


@app.get("/jobs/{job_id}/status")
async def job_status(job_id: str):
    return await job_runtime.read_status(PRODUCTION_DIR, job_id)


@app.get("/jobs/{job_id}/stream")
async def job_stream(job_id: str, request: Request):
    return job_runtime.status_stream(PRODUCTION_DIR, job_id, request)


class ResumeRequest(BaseModel):
    # "retry": the operator fixed what the pre-flight complained about
    # "continue": run anyway, without whatever the pre-flight was protecting
    action: str


@app.post("/jobs/{job_id}/resume")
async def resume_job(job_id: str, body: ResumeRequest, background_tasks: BackgroundTasks):
    job_dir = job_runtime.job_dir_for(PRODUCTION_DIR, job_id)
    plan_path = os.path.join(job_dir, "production_plan.json")
    if not os.path.isdir(job_dir) or not os.path.exists(plan_path):
        raise HTTPException(status_code=404, detail="Job not found or has no saved production plan")
    if body.action not in ("retry", "continue"):
        raise HTTPException(status_code=400, detail="action must be 'retry' or 'continue'")

    with open(plan_path, "r") as f:
        plan_data = json.load(f)

    status_path = os.path.join(job_dir, "status.json")
    last_status = {}
    if os.path.exists(status_path):
        try:
            with open(status_path, "r") as f:
                last_status = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass  # a torn read here just means no pre-flight gets skipped

    logo_library_path = os.path.join(job_dir, "logo_library.ai")
    if not os.path.exists(logo_library_path):
        logo_library_path = None

    busy = job_runtime.claim_job_slot(job_id)
    if busy:
        raise job_runtime.busy_error(busy)

    # Which pre-flight actually paused this job - read from the last status,
    # not guessed from the action. Several different pauses can each be resumed
    # with "continue", but only the one that fired should have its check
    # skipped; the rest must still run on this pass.
    def skip(flag: str) -> bool:
        return bool(last_status.get(flag)) and body.action == "continue"

    update_status(job_dir, "Resuming automation...", 15)
    background_tasks.add_task(
        job_runtime.run_job_locked, run_illustrator_automation,
        job_id, job_dir, plan_data,
        os.path.join(job_dir, "pattern.ai"), os.path.join(job_dir, "mockup.ai"),
        logo_library_ai_path=logo_library_path,
        ignore_missing_fonts=skip("font_missing"),
        force_font_refresh=bool(last_status.get("font_missing")) and body.action == "retry",
        ignore_center_match_warning=skip("center_layer_missing"),
        ignore_local_tag_warning=skip("local_tag_missing"),
        ignore_pattern_match_warning=skip("pattern_layer_missing"),
        ignore_side_seam_match_warning=skip("side_seam_match_layer_missing"),
        ignore_armhole_match_warning=skip("armhole_match_layer_missing"),
        ignore_hoodie_warning=skip("hoodie_layer_missing"),
        ignore_hood_center_match_warning=skip("hood_center_match_layer_missing"),
        ignore_pattern_piece_warning=skip("pattern_piece_missing"),
        ignore_unsaved_work=skip("illustrator_unsaved_work"),
    )
    return {"job_id": job_id, "status": "resumed", "action": body.action}


@app.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Marks a PAUSED job as cancelled.

    Deliberately does not try to stop a running render: the automation is
    blocked inside DoJavaScript and there is nothing to interrupt from here. On
    a pause the background task has already returned, so writing a terminal
    status is both accurate and enough."""
    job_dir = job_runtime.job_dir_for(PRODUCTION_DIR, job_id)
    if not os.path.isdir(job_dir):
        raise HTTPException(status_code=404, detail="Job not found")
    with open(os.path.join(job_dir, "status.json"), "w") as f:
        json.dump({
            "message": "Cancelled by user.",
            "progress": 0,
            "is_ready": False,
            "cancelled": True,
        }, f)
    return {"job_id": job_id, "status": "cancelled"}


@app.get("/jobs/{job_id}/download")
async def download_job(job_id: str):
    job_dir = job_runtime.job_dir_for(PRODUCTION_DIR, job_id)
    zip_path = os.path.join(job_dir, f"order_{job_id}_ready.zip")
    if os.path.exists(zip_path):
        return FileResponse(zip_path, filename=f"order_{job_id}_ready.zip")
    return {"status": "processing", "message": "Zip file not ready yet."}


if __name__ == "__main__":
    import uvicorn
    print("=" * 68)
    print(f"  AI Apparel Agent {AGENT_VERSION}")
    print(f"  Listening on   http://{AGENT_HOST}:{AGENT_PORT}")
    print(f"  Orders go to   {PRODUCTION_DIR}")
    print(f"  Illustrator    {'found' if _illustrator_prog_ids() else 'NOT FOUND on this PC'}")
    print("-" * 68)
    # The token goes on screen only when there IS a screen. Under pythonw this
    # output is a log file, and a log is the one thing people cheerfully email
    # to someone else when they want help - the token must not ride along.
    if sys.stdout is sys.__stdout__:
        print("  Paste this pairing token into the website, once:")
        print(f"\n     {AGENT_TOKEN}\n")
        print(f"  (also saved in {TOKEN_PATH})")
    else:
        print(f"  Pairing token is in {TOKEN_PATH}")
        print(f"  This output is the log at {LOG_PATH}")
    print("=" * 68)
    # Loopback ONLY. On 0.0.0.0 every machine on the office LAN could drive
    # this designer's Illustrator and read their files.
    uvicorn.run(app, host=AGENT_HOST, port=AGENT_PORT, log_level="info")
