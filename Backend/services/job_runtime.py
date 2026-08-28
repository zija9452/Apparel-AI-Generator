"""Job plumbing shared by the local backend and the agent.

Everything here was written and hardened in `main.py` first; it moved out when
the agent needed the same behaviour. It is deliberately ONE copy: a job lock
that is subtly different in two places, or a path check that is strict in one
app and lax in the other, is the kind of bug that only shows up in production.

Nothing in this module knows about Illustrator or about Gemini. It takes the
uploads/production root as an argument so the backend can serve `uploads/` and
the agent `C:\\Production\\` from the same code.
"""
import asyncio
import json
import logging
import os
import re
import threading
from typing import Any, Callable, Dict, Optional, Tuple

from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

logger = logging.getLogger("job-runtime")


# ---------------------------------------------------------------------------
# JOB NAMES AND PATHS
# ---------------------------------------------------------------------------

JOB_NAME_MAX = 60
RESERVED_NAMES = (
    {"con", "prn", "aux", "nul"}
    | {f"com{i}" for i in range(1, 10)}
    | {f"lpt{i}" for i in range(1, 10)}
)

# A job id is whatever safe_job_name produced, plus a possible '-2'/'-3'
# uniqueness suffix - so letters, digits, '_' and '-', nothing else.
JOB_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def safe_job_name(name: str) -> str:
    """'Kings Order #3' -> 'Kings_Order_3'. Anything that is not a letter,
    digit or dash becomes '_' - the name travels through folder paths AND URL
    path segments, so spaces and punctuation cannot be kept as typed."""
    cleaned = re.sub(r"[^A-Za-z0-9\-]+", "_", str(name or ""))
    cleaned = re.sub(r"_+", "_", cleaned).strip("_-")[:JOB_NAME_MAX].strip("_-")
    if cleaned.lower() in RESERVED_NAMES:
        cleaned += "_job"
    return cleaned


def unique_job_dir(root: str, name: str) -> Tuple[str, str]:
    """(job_id, job_dir) for a new job. A repeated job name gets a '-2', '-3'
    suffix instead of overwriting the earlier job's uploads and renders."""
    base = safe_job_name(name)
    if not base:
        raise HTTPException(
            status_code=400,
            detail="Job name must contain at least one letter or number.",
        )
    candidate, n = base, 1
    while os.path.exists(os.path.join(root, candidate)):
        n += 1
        candidate = f"{base}-{n}"
    return candidate, os.path.join(root, candidate)


def job_dir_for(root: str, job_id: str) -> str:
    """The folder for `job_id`, or a 404 if that id cannot name one.

    `job_id` arrives as a URL path segment and used to be joined straight onto
    the root, so an id like '../../Windows/Temp' escaped the tree - to READ on
    the status route, and to WRITE on cancel, which drops a status.json
    wherever it lands.

    That is survivable while the only caller is a browser on this machine. It
    stops being survivable in the agent, where any website a designer visits
    can reach these routes.

    Two checks on purpose. The name rule is the readable one. The resolved-path
    rule is the one that still holds if the name rule is ever outsmarted - by a
    junction or symlink inside the root, which no amount of string inspection
    can see.
    """
    if not JOB_ID_RE.match(job_id or ""):
        raise HTTPException(status_code=404, detail="Job not found")
    real_root = os.path.realpath(root)
    job_dir = os.path.realpath(os.path.join(real_root, job_id))
    if job_dir == real_root or not job_dir.startswith(real_root + os.sep):
        raise HTTPException(status_code=404, detail="Job not found")
    return job_dir


# ---------------------------------------------------------------------------
# SINGLE-JOB LOCK
#
# One machine, one Illustrator. Two automations against the same instance
# destroy each other: they share app.Documents, the swatch tables and the
# same-named groups the automation closes on startup as "leftovers from a
# previous run" - one job would close the other's live order document
# mid-layout.
#
# The slot is claimed in the REQUEST, never inside a background task: a task
# only runs after the response has been sent, so two quick requests would both
# pass a check made in the task and both start.
#
# Deliberately in memory, not on disk: the automation runs in this process's
# threadpool, so if the process dies the job dies with it and a persisted lock
# would only strand the next start.
# ---------------------------------------------------------------------------

_job_slot_lock = threading.Lock()
_running_job_id: Optional[str] = None


def current_job_id() -> Optional[str]:
    with _job_slot_lock:
        return _running_job_id


def claim_job_slot(job_id: str) -> Optional[str]:
    """Reserves the Illustrator slot. Returns None on success, or the id of the
    job already holding it."""
    global _running_job_id
    with _job_slot_lock:
        if _running_job_id is not None:
            return _running_job_id
        _running_job_id = job_id
        logger.info(f"Illustrator slot claimed by job '{job_id}'")
        return None


def release_job_slot(job_id: str) -> None:
    global _running_job_id
    with _job_slot_lock:
        if _running_job_id == job_id:
            _running_job_id = None
            logger.info(f"Illustrator slot released by job '{job_id}'")


def busy_error(busy_job_id: str) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail=(
            f"Job '{busy_job_id}' is still running. Illustrator can only build one "
            "order at a time - wait for that job to finish, or stop it, then start this one."
        ),
    )


def run_job_locked(target: Callable[..., Any], job_id: str, *args, **kwargs) -> None:
    """Runs `target` and always hands the slot back.

    A pre-flight pause returns normally from the automation, and releasing on
    that path is correct: a paused job holds no Illustrator, so the slot must
    be free for its own resume - or for a different job, if the operator gives
    up on this one - to claim."""
    try:
        target(job_id, *args, **kwargs)
    finally:
        release_job_slot(job_id)


# ---------------------------------------------------------------------------
# STATUS: READING, POLLING, STREAMING
# ---------------------------------------------------------------------------

# Last successfully parsed status per job - the floor under a torn read.
# Bounded by the number of jobs in one server lifetime, a handful of keys each.
_last_status: Dict[str, Dict[str, Any]] = {}

# How often the stream re-reads status.json, and how long it may stay silent
# before sending a comment frame to keep idle proxies from closing it.
STREAM_TICK_SECONDS = 0.5
STREAM_HEARTBEAT_SECONDS = 15


def read_status_once(status_path: str) -> Tuple[str, Optional[str], Optional[Dict[str, Any]]]:
    """One attempt at status.json: (state, raw_text, payload).

    state is "missing" (no file yet), "torn" (there, but not parseable this
    instant) or "ok".

    TORN READS are normal here, not a corruption bug. status.json has two
    writers that each overwrite it in place - update_status() in this process,
    and the JSX from inside Illustrator (automate_production.jsx), which is
    where every "Rendering XL front..." line comes from. A reader can land
    mid-write and see half a document. Both callers below treat that as "ask
    again in a moment", never as an error.
    """
    try:
        with open(status_path, "r") as f:
            raw = f.read()
    except FileNotFoundError:
        return "missing", None, None
    except OSError:
        return "torn", None, None  # momentarily locked by a writer
    try:
        return "ok", raw, json.loads(raw)
    except json.JSONDecodeError:
        return "torn", raw, None


async def read_status(root: str, job_id: str) -> Dict[str, Any]:
    """The job's current status, once.

    Still needed alongside the stream: it paints the panel immediately, since
    the stream only speaks when something CHANGES and a job mid-render can sit
    on the same line for a minute.

    On a torn read, retry briefly (the window is sub-millisecond) and then fall
    back to the last good value rather than a zeroed one - reporting progress 0
    would send the bar backwards for a tick.
    """
    status_path = os.path.join(job_dir_for(root, job_id), "status.json")
    for attempt in range(3):
        state, _raw, payload = read_status_once(status_path)
        if state == "missing":
            return {"message": "Initializing...", "progress": 0, "is_ready": False}
        if state == "ok":
            _last_status[job_id] = payload
            return payload
        if attempt < 2:
            await asyncio.sleep(0.05)  # never time.sleep - this is the event loop
    logger.warning(f"status.json for '{job_id}' unreadable three times - serving the last good value")
    return _last_status.get(job_id, {"message": "Working...", "progress": 0, "is_ready": False})


def status_stream(root: str, job_id: str, request: Request) -> StreamingResponse:
    """Server-sent events: the backend pushes, the browser never asks again.

    WHY THE SERVER STILL WATCHES A FILE. There is no in-process event to hook
    during a render. The automation blocks inside DoJavaScript for the whole
    job, and the progress lines are written by the JSX from INSIDE Illustrator
    - a different process - straight into status.json. Re-reading that one
    small local file is the only way to see them. What this removes is the
    network request per tick, per client, and the 2s lag with it.
    """
    status_path = os.path.join(job_dir_for(root, job_id), "status.json")

    async def events():
        last_raw = None
        last_payload: Optional[Dict[str, Any]] = None
        silent_for = 0.0
        while True:
            # Without this the generator keeps running after the tab is gone.
            if await request.is_disconnected():
                return

            state, raw, payload = read_status_once(status_path)
            if state == "ok" and raw != last_raw:
                last_raw = raw
                last_payload = payload
                _last_status[job_id] = payload
                silent_for = 0.0
                yield f"data: {json.dumps(payload)}\n\n"

            # ENDING THE STREAM. Two conditions, and both are needed.
            #
            # A pre-flight pause is NOT terminal - resume writes into this same
            # file and the client has to still be listening.
            #
            # is_ready alone is NOT terminal either, which cost a real job its
            # warnings: the JSX used to write is_ready at the end of RENDERING,
            # while the backend still had the zip to build and the sleeve-match
            # / back-label / PARM reports to collect. The stream ended, the
            # browser closed it, and the final status - the one naming 3 parts
            # that rendered without matching - was never delivered. The JSX no
            # longer claims that, and this second condition makes sure no other
            # premature is_ready can do the same: the job keeps the Illustrator
            # slot until the automation has fully returned, which is strictly
            # after its last status write.
            #
            # Checked on EVERY tick, not only when the file changed: the slot is
            # released just after that final write, so the tick that sees it
            # free usually has nothing new to report.
            if last_payload is not None and current_job_id() != job_id and (
                last_payload.get("is_ready") or last_payload.get("cancelled")
            ):
                # Say so explicitly. If the server merely closed, EventSource
                # would read that as a dropped connection and reconnect every
                # few seconds forever - worse than the polling this replaces.
                yield "event: end\ndata: {}\n\n"
                return

            silent_for += STREAM_TICK_SECONDS
            if silent_for >= STREAM_HEARTBEAT_SECONDS:
                silent_for = 0.0
                yield ": keep-alive\n\n"  # a comment frame; EventSource ignores it

            await asyncio.sleep(STREAM_TICK_SECONDS)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # nginx and most cloud proxies buffer responses by default, which
            # holds every update back until the job ends.
            "X-Accel-Buffering": "no",
        },
    )
