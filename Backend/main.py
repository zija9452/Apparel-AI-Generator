from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks, Request, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict, Tuple
from dotenv import load_dotenv
import asyncio
import os
import re
import json
import logging
import shutil
import threading
import hmac
import openai
from fastapi.middleware.cors import CORSMiddleware

# Internal services
from services import job_runtime
from services.excel_service import parse_order_excel
from services.illustrator_automation import run_illustrator_automation, update_status

# OpenAI Agents SDK imports
from agents import (
    Agent,
    AgentOutputSchema,
    AsyncOpenAI,
    OpenAIChatCompletionsModel,
    RunConfig,
    Runner,
    SQLiteSession,
    set_tracing_disabled,
)

load_dotenv()
set_tracing_disabled(disabled=True)

# Configuration
def _gemini_api_keys() -> List[str]:
    """Every Gemini key in the environment, in the order they should be tried.

    GEMINI_API_KEY first, then GEMINI_API_KEY1, 2, 3... A free-tier key runs out
    of its daily quota part-way through a busy day and comes back the next
    morning. With one key that is a dead website for everyone; with several it
    is a line in the log that nobody has to read.

    Duplicates are dropped so that pasting the same key twice does not turn one
    dead key into two wasted attempts per job.
    """
    names = ["GEMINI_API_KEY"] + [f"GEMINI_API_KEY{i}" for i in range(1, 5)]
    keys: List[str] = []
    seen = set()
    for name in names:
        value = (os.getenv(name) or "").strip()
        if value and value not in seen:
            seen.add(value)
            keys.append(value)
    return keys


GEMINI_API_KEYS = _gemini_api_keys()
if not GEMINI_API_KEYS:
    raise RuntimeError("GEMINI_API_KEY not set in environment")
GEMINI_API_KEY = GEMINI_API_KEYS[0]

DB_PATH = "apparel_sessions.db"
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Logger setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("apparel-orchestrator")

# Model configuration
GEMINI_MODEL_NAME = "gemini-3.1-flash-lite"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"


def _model_for_key(key: str) -> OpenAIChatCompletionsModel:
    return OpenAIChatCompletionsModel(
        model=GEMINI_MODEL_NAME,
        openai_client=AsyncOpenAI(
            api_key=key, base_url=GEMINI_BASE_URL, timeout=120.0
        ),
    )


# One client per key, built once. Creating them is cheap and holds no
# connection, so there is nothing to gain from doing it lazily.
GEMINI_MODELS = [_model_for_key(k) for k in GEMINI_API_KEYS]

# The agent's declared model. Every actual run overrides it through RunConfig
# in _run_agent, so this is the default rather than the one that gets used.
model = GEMINI_MODELS[0]

# Which key to start from. A run that had to fall through to key 3 leaves the
# next job starting at 3 as well - otherwise every single job would spend a
# failed request on the exhausted key before getting to a live one. It resets
# naturally: whichever key answers becomes the new starting point.
_gemini_key_index = 0
_gemini_key_lock = threading.Lock()


def _is_key_failure(e: Exception) -> bool:
    """Is this a fault of the KEY rather than of the request?

    Only these are worth retrying on a different key. A malformed prompt or a
    schema violation would fail identically on all five, and rotating through
    them would turn one clear error into a slow one.
    """
    if isinstance(
        e, (openai.RateLimitError, openai.AuthenticationError, openai.PermissionDeniedError)
    ):
        return True
    if isinstance(e, openai.APIStatusError) and e.status_code in (401, 403, 429):
        return True
    # Gemini reports daily exhaustion as RESOURCE_EXHAUSTED, and the SDK
    # sometimes surfaces it wrapped rather than as a typed error.
    text = str(e).lower()
    return "resource_exhausted" in text or "quota" in text


async def _run_agent(agent: Agent, prompt_text: str):
    """Run the agent, moving to the next API key if this one is spent."""
    global _gemini_key_index

    with _gemini_key_lock:
        start = _gemini_key_index
    total = len(GEMINI_MODELS)
    last_error: Optional[Exception] = None

    for offset in range(total):
        index = (start + offset) % total
        try:
            result = await Runner.run(
                agent, input=prompt_text, run_config=RunConfig(model=GEMINI_MODELS[index])
            )
        except Exception as e:
            if not _is_key_failure(e):
                raise
            last_error = e
            logger.warning(
                "Gemini key %d of %d unusable (%s) - trying the next one",
                index + 1, total, type(e).__name__,
            )
            continue

        with _gemini_key_lock:
            _gemini_key_index = index
        if offset:
            logger.info("Gemini key %d of %d answered", index + 1, total)
        return result

    raise HTTPException(
        status_code=503,
        detail=(
            f"All {total} Gemini API keys are out of quota or rejected "
            f"(last: {type(last_error).__name__}). Daily quota usually returns "
            "the next day; add another key to .env to keep going now."
        ),
    )


# --- API key on the planning route ---------------------------------------
#
# /plan spends Gemini quota on every call. Left open on a public URL, the loss
# is not the data - there is none worth taking - it is that a stranger can burn
# all four keys in an afternoon and leave the designers looking at 503s.
#
# The key lives ONLY here and on the Vercel server that calls this. It is never
# sent to a browser: see Frontend/my-app/app/api/plan/route.ts.
CLOUD_API_KEY = (os.getenv("CLOUD_API_KEY") or "").strip()

if not CLOUD_API_KEY:
    logger.warning(
        "CLOUD_API_KEY is not set - /plan is UNAUTHENTICATED. That is fine on "
        "localhost and must never be true on a deployed instance."
    )


async def require_api_key(request: Request) -> None:
    """Reject anyone who cannot present the shared key.

    Unset means open, so that `python main.py` still works on a dev box with no
    configuration. The deployment checklist is what closes it; the warning above
    is what stops that being forgotten quietly.
    """
    if not CLOUD_API_KEY:
        return
    sent = (request.headers.get("x-api-key") or "").strip()
    # compare_digest so a wrong key cannot be narrowed down one character at a
    # time by timing the response.
    if not sent or not hmac.compare_digest(sent, CLOUD_API_KEY):
        raise HTTPException(status_code=401, detail="Missing or invalid API key.")

# --- Output Schemas ---
class TextReplacement(BaseModel):
    layer_name: str
    new_value: str

class ArtboardPlan(BaseModel):
    part_name: str
    size: str
    quantity: int = 1 
    text_replacements: List[TextReplacement]

class SizeProductionGroup(BaseModel):
    size: str
    items: List[ArtboardPlan]

class CMYKColor(BaseModel):
    c: float
    m: float
    y: float
    k: float

class ColorMappingEntry(BaseModel):
    swatch_name: str
    color: CMYKColor

class GlobalGenerationPlan(BaseModel):
    job_id: str
    total_sizes: int
    production_groups: List[SizeProductionGroup]
    color_mapping: List[ColorMappingEntry]
    output_format: str 
    validation_notes: str

# --- Agent Definition ---
ApparelOrchestratorAgent = Agent(
    name="Apparel Orchestrator Agent",
    instructions=(
        "You are a Professional Apparel Production Manager. Your goal is to generate a literal production plan from the provided data.\n\n"
        "1. SLEEVE LOGIC (CRITICAL):\n"
        "   - Always use part_name: 'sleeve-short' for the sleeve part, regardless of what 'user_instructions' or the Excel data say. "
        "The system deterministically corrects this to 'sleeve-short'/'sleeve-long' (or splits it into both) after planning, from the "
        "Special Instructions text and the Excel 'Sleeve' column - never guess long vs short yourself.\n\n"
        "2. COLOR LOGIC (CRITICAL):\n"
        "   - ONLY populate 'color_mapping' if explicit CMYK values are provided in the Excel file.\n"
        "   - DO NOT estimate or invent CMYK values. If Excel has no color data, leave 'color_mapping' as an empty list [].\n"
        "   - The automation script will automatically use default RGB values if the list is empty.\n\n"
        "3. ACCESSORY LOGIC:\n"
        "   - Do NOT include accessory parts ('placket', 'twill-tape', 'tukdi') in the plan. The system adds them from user checkboxes after planning.\n\n"
        "4. DE-DUPLICATION & SHARED PARTS (CRITICAL):\n"
        "   - For each size group, do NOT repeat parts that are identical across all items.\n"
        "   - If 'back', 'neck', or 'sleeve' have NO individual personalization (no unique name/number/logo on those parts), output them ONLY ONCE per size group.\n"
        "   - SLEEVE QUANTITY RULE: Set quantity: 1 if both sleeves are identical. Set quantity: 2 ONLY if you need to place different LOGOS, NAMES, or NUMBERS on each sleeve (Left vs Right).\n"
        "   - Only output 'front' (or whichever part is personalized) for every unique item in the Excel list.\n"
        "   - Example: For 10 Large jerseys with different front numbers but identical sleeves: Output 10 'front' parts, 1 'back' part, 1 'neck' part, and 1 'sleeve' part (quantity: 1).\n\n"
        "5. TEXT REPLACEMENTS & STRICTION:\n"
        "   - Use 'NAME', 'NUMBER' for text_replacements.\n"
        "   - Do NOT emit 'LOGO' replacements yourself - logos are handled deterministically from Excel "
        "'<Part> Logo' columns after planning, the same way accessories are (see rule 3).\n"
        "   - FRONT vs BACK NAMES: If order data has both 'name' and 'back_name' fields, apply 'name' as the NAME replacement on the 'front' part and 'back_name' as the NAME replacement on the 'back' part.\n"
        "   - FRONT vs BACK NUMBERS: If order data has a 'back_number' field with values, apply it as the NUMBER replacement on the 'back' part. A plain 'number' field applies to whichever part shows a number in the mockup (default: back).\n"
        "   - If 'back_name' or 'back_number' values exist, the back IS personalized: output one 'back' part per unique item (with its own text_replacements) — the de-duplication rule for 'back' does NOT apply in that case.\n"
        "   - STRICTION: DO NOT use 'Gemini' or any AI-related words as placeholder values. If a field is empty in Excel, leave it as an empty string \"\".\n"
        "   - Ensure 'NUMBER' is EXACTLY as provided in the order data - never add or remove leading zeros (\"5\" stays \"5\", \"05\" stays \"05\")."
    ),
    model=model,
    output_type=AgentOutputSchema(GlobalGenerationPlan, strict_json_schema=False),
)

def _norm_size(s: str) -> str:
    s = str(s).lower().strip().replace(" ", "").replace("-", "").replace("_", "")
    aliases = {
        "xs": "xsmall", "extrasmall": "xsmall",
        "s": "small", "sm": "small",
        "m": "medium", "med": "medium",
        "l": "large", "lg": "large",
        "xl": "xlarge", "extralarge": "xlarge",
        "xxl": "2xlarge", "2xl": "2xlarge",
        "xxxl": "3xlarge", "3xl": "3xlarge",
        "xxxxl": "4xlarge", "4xl": "4xlarge",
    }
    return aliases.get(s, s)

# ---------------------------------------------------------------------------
# SIZE ORDER
# The pd.ai file lays its pieces out in plan order, one production group after
# another, so the plan itself is what decides whether the finished sheet reads
# smallest -> largest. Excel row order (which is what the LLM echoes back) is
# whatever the customer typed, so the groups are re-sorted here instead.
# ---------------------------------------------------------------------------

# Every adult size, smallest first. Youth sizes reuse the same ladder with the
# youth flag, so a YXL still sorts before an adult XS.
_SIZE_SEQUENCE = ["xs", "s", "m", "l", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"]

# Spelled-out / doubled-letter spellings -> the ladder's own code.
_SIZE_WORDS = {
    "xsmall": "xs", "extrasmall": "xs",
    "small": "s", "sm": "s",
    "medium": "m", "med": "m",
    "large": "l", "lg": "l",
    "xlarge": "xl", "extralarge": "xl",
    "xxl": "2xl", "xxlarge": "2xl", "2xlarge": "2xl", "doublexl": "2xl",
    "xxxl": "3xl", "xxxlarge": "3xl", "3xlarge": "3xl", "triplexl": "3xl",
    "xxxxl": "4xl", "4xlarge": "4xl",
    "xxxxxl": "5xl", "5xlarge": "5xl",
    "xxxxxxl": "6xl", "6xlarge": "6xl",
}


def _size_code(s: str) -> Optional[str]:
    """'large'/'l'/'xxl' -> the ladder code ('l'/'l'/'2xl'). None if unknown."""
    s = _SIZE_WORDS.get(s, s)
    return s if s in _SIZE_SEQUENCE else None


def _size_rank(size: str):
    """Sort key for one production group's size, smallest print run first:
      0 = youth (YXS..YXL, 'Youth Medium')
      1 = adult (XS..6XL, with or without the 'A' prefix some sheets use)
      2 = anything unrecognised - numeric sizes ('38', '40') in numeric order,
          the rest alphabetically, all AFTER every known size
      3 = the 'Universal' accessories group, always dead last
    A size the order simply doesn't contain has no group at all, so the next
    size up follows it - nothing needs to be skipped explicitly."""
    s = str(size or "").lower().strip()
    for ch in (" ", "-", "_", "."):
        s = s.replace(ch, "")
    if not s:
        return (4, 0.0, "")
    if s == "universal":
        return (3, 0.0, "")

    youth = False
    body = s
    if body.startswith("youth"):
        youth, body = True, body[5:]
    elif body.startswith("adult"):
        body = body[5:]

    code = _size_code(body)
    # Single-letter prefixes: 'Y' = youth (YM), 'A' = adult (AM = M). Only
    # stripped when what is left is itself a known code, so a real size name
    # starting with those letters is never mangled.
    if code is None and len(body) > 1 and body[0] == "y":
        c = _size_code(body[1:])
        if c:
            youth, code = True, c
    if code is None and len(body) > 1 and body[0] == "a":
        code = _size_code(body[1:])

    if code is not None:
        return (0 if youth else 1, float(_SIZE_SEQUENCE.index(code)), "")

    try:
        return (2, float(body), "")
    except ValueError:
        return (2, float("inf"), s)


def _sort_size_groups(plan: Dict[str, Any]) -> None:
    """Re-orders the plan's production groups smallest size -> largest (see
    _size_rank). Stable, so two groups that rank the same keep their Excel
    order. Must run LAST: every _enforce_* step above appends groups (the
    Universal accessories one) or rebuilds their items."""
    groups = plan.get("production_groups", [])
    if not groups:
        return
    plan["production_groups"] = sorted(groups, key=lambda g: _size_rank(g.get("size", "")))
    logger.info(
        "Plan size order: " + " -> ".join(str(g.get("size")) for g in plan["production_groups"])
    )


# ---------------------------------------------------------------------------
# JOB NAME
# The user names the job on the frontend and that one name is used everywhere:
# the job folder (uploads/<name>), the render folder inside it (same name), the
# zip, and the job id in every status/download URL.
# ---------------------------------------------------------------------------

# The naming, path-safety, job-lock and status/stream machinery all live in
# services/job_runtime.py, so the agent runs the exact same code against
# C:\Production instead of uploads/. These wrappers only bind the root, which
# keeps every call site in this file unchanged.
def _safe_job_name(name: str) -> str:
    return job_runtime.safe_job_name(name)


def _unique_job_dir(name: str) -> Tuple[str, str]:
    return job_runtime.unique_job_dir(UPLOAD_DIR, name)


def _job_dir_for(job_id: str) -> str:
    return job_runtime.job_dir_for(UPLOAD_DIR, job_id)


def _enforce_personalization(plan_dict: Dict[str, Any], raw_orders: List[Dict[str, Any]]) -> None:
    """The LLM sometimes collapses personalized fronts/backs of a size into a
    single quantity bucket carrying only the first name. Excel rows are the
    source of truth, so rebuild those items per unique row in place."""
    if not raw_orders:
        return

    rows_by_size: Dict[str, List[Dict[str, Any]]] = {}
    for row in raw_orders:
        rows_by_size.setdefault(_norm_size(row.get("size", "")), []).append(row)

    for group in plan_dict.get("production_groups", []):
        rows = rows_by_size.get(_norm_size(group.get("size", "")))
        if not rows:
            continue

        for part in ("front", "back"):
            part_items = [it for it in group.get("items", []) if it.get("part_name") == part]
            if not part_items:
                continue

            # Layers the agent itself chose for this part
            agent_layers = set()
            for it in part_items:
                for tr in it.get("text_replacements", []):
                    ln = str(tr.get("layer_name", "")).upper()
                    if "NAME" in ln:
                        agent_layers.add("NAME")
                    elif "NUMBER" in ln or ln in ("NUM", "#"):
                        agent_layers.add("NUMBER")

            # Layers the Excel columns demand for this part (source of truth) -
            # the LLM sometimes drops a column entirely (e.g. 'Back Number').
            name_field = "back_name" if part == "back" else "name"
            number_field = "back_number" if part == "back" else "number"
            excel_layers = set()
            if any(str(r.get(name_field) or "").strip() for r in rows):
                excel_layers.add("NAME")
            if any(str(r.get(number_field) or "").strip() for r in rows):
                excel_layers.add("NUMBER")
            # LOGO comes from the '<Part> Logo' Excel column via the structured
            # 'personalization' dict (never seen by the LLM, so agent_layers can
            # never contain it - any job with a logo column always rebuilds
            # below, which is correct: only Excel rows know the real itemization.
            if any(str((r.get("personalization", {}).get(part) or {}).get("logo") or "").strip() for r in rows):
                excel_layers.add("LOGO")

            layers = agent_layers | excel_layers
            if not layers:
                continue  # part is not personalized

            def row_values(row):
                if part == "back":
                    name = row.get("back_name") or row.get("name") or ""
                    number = row.get("back_number") or row.get("number") or ""
                else:
                    name = row.get("name") or ""
                    number = row.get("number") or ""
                logo = (row.get("personalization", {}).get(part) or {}).get("logo") or ""
                return (str(name), str(number), str(logo))

            # Aggregate rows that print identically (e.g. differ only by sleeve)
            agg: Dict[Any, int] = {}
            order: List[Any] = []
            for row in rows:
                key = row_values(row)
                if key not in agg:
                    agg[key] = 0
                    order.append(key)
                agg[key] += int(row.get("quantity", 1) or 1)

            if len(order) <= len(part_items) and excel_layers <= agent_layers:
                # Itemization is fine, but the agent's QUANTITIES can still be
                # inflated (e.g. every personalized front given the whole size
                # group's jersey count). Excel rows are the source of truth.
                # (excel_layers <= agent_layers is always False when LOGO is
                # present - the agent never itemizes it - so this branch only
                # ever runs for plain NAME/NUMBER jobs; LOGO always rebuilds.)
                proj_agg: Dict[Any, int] = {}
                for key in order:
                    pkey = (key[0] if "NAME" in layers else "",
                            key[1] if "NUMBER" in layers else "")
                    proj_agg[pkey] = proj_agg.get(pkey, 0) + agg[key]
                for it in part_items:
                    it_name, it_number = "", ""
                    for tr in it.get("text_replacements", []):
                        ln = str(tr.get("layer_name", "")).upper()
                        if "NAME" in ln:
                            it_name = str(tr.get("new_value", ""))
                        elif "NUMBER" in ln or ln in ("NUM", "#"):
                            it_number = str(tr.get("new_value", ""))
                    pkey = (it_name if "NAME" in layers else "",
                            it_number if "NUMBER" in layers else "")
                    want = proj_agg.get(pkey)
                    have = int(it.get("quantity", 1) or 1)
                    if want is not None and want != have:
                        logger.warning(
                            f"Personalized '{part}' (size '{group.get('size')}', "
                            f"{pkey}) had quantity {have} - Excel says {want}, fixing"
                        )
                        it["quantity"] = want
                continue  # agent already itemized this part with every Excel layer

            logger.warning(
                f"Plan for '{part}' (size '{group.get('size')}') is incomplete: "
                f"{len(order)} distinct personalizations vs {len(part_items)} item(s), "
                f"agent layers {sorted(agent_layers)} vs Excel layers {sorted(excel_layers)} "
                f"- rebuilding from Excel rows"
            )
            size_label = part_items[0].get("size", group.get("size", ""))
            # Keep any other replacements the agent added (LOGO is rebuilt
            # fresh below from Excel, since the agent never itemizes it)
            extra_reps = [
                tr for tr in part_items[0].get("text_replacements", [])
                if "NAME" not in str(tr.get("layer_name", "")).upper()
                and "NUMBER" not in str(tr.get("layer_name", "")).upper()
                and str(tr.get("layer_name", "")).upper() not in ("NUM", "#", "LOGO")
            ]
            rebuilt = []
            for name, number, logo in order:
                reps = list(extra_reps)
                if "NAME" in layers:
                    reps.append({"layer_name": "NAME", "new_value": name})
                if "NUMBER" in layers:
                    reps.append({"layer_name": "NUMBER", "new_value": number})
                if "LOGO" in layers and logo:
                    reps.append({"layer_name": "LOGO", "new_value": logo})
                rebuilt.append({
                    "part_name": part,
                    "size": size_label,
                    "quantity": agg[(name, number, logo)],
                    "text_replacements": reps,
                })

            # Replace the collapsed items at their original position
            items = group["items"]
            first_idx = items.index(part_items[0])
            group["items"] = [it for it in items if it.get("part_name") != part]
            group["items"][first_idx:first_idx] = rebuilt

def _dedupe_unpersonalized(plan_dict: Dict[str, Any]) -> None:
    """The LLM sometimes ignores its de-dup rule and gives an un-personalized
    part (no text_replacements) quantity = jersey count, so the identical
    print renders once per jersey. An identical print needs exactly one
    artboard per size group: collapse duplicates and force quantity 1."""
    for group in plan_dict.get("production_groups", []):
        seen = set()
        kept = []
        for item in group.get("items", []):
            if item.get("text_replacements"):
                kept.append(item)
                continue
            key = (item.get("part_name"), _norm_size(item.get("size", "")))
            if key in seen:
                logger.warning(
                    f"Dropping duplicate un-personalized item '{item.get('part_name')}' "
                    f"(size '{item.get('size')}') from plan"
                )
                continue
            seen.add(key)
            if int(item.get("quantity", 1) or 1) != 1:
                logger.warning(
                    f"Un-personalized '{item.get('part_name')}' (size '{item.get('size')}') "
                    f"had quantity {item.get('quantity')} - forcing 1 (identical prints render once)"
                )
                item["quantity"] = 1
            kept.append(item)
        group["items"] = kept

def _enforce_sleeve_length(plan_dict: Dict[str, Any], raw_orders: List[Dict[str, Any]], user_instructions: str, is_hoodie: bool = False) -> None:
    """Sleeve length ('sleeve-short' vs 'sleeve-long') is deterministic, not
    the LLM's call (see Rule 1 in ApparelOrchestratorAgent's instructions -
    it always emits 'sleeve-short' and this function corrects it). Special
    Instructions sets the MODE for the whole job:
      - mentions 'long'/'full' only -> every sleeve item becomes 'sleeve-long'.
      - mentions 'short'/'half' only -> every sleeve item becomes 'sleeve-short'.
      - mentions neither -> defaults to 'sleeve-long' for Hoodie jobs (hoodies
        are worn full-sleeve), otherwise 'sleeve-short' (matches the old LLM
        default for non-hoodie jobs).
      - mentions BOTH (an order genuinely mixes short- and long-sleeve
        jerseys) -> per-row Excel 'Sleeve' column (Half/Full) decides: the
        deduped sleeve item for that size is split into 'sleeve-short' +
        'sleeve-long', quantities from the matching rows.
    Must run AFTER _dedupe_unpersonalized (splits the single deduped item,
    not a not-yet-collapsed per-jersey one) and BEFORE _enforce_extra_logos
    (so a logo added afterward lands on whichever split item(s) remain)."""
    text = (user_instructions or "").lower()
    has_long = ("long" in text) or ("full" in text)
    has_short = ("short" in text) or ("half" in text)
    if has_long and has_short:
        mode = "mixed"
    elif has_long:
        mode = "long"
    elif has_short:
        mode = "short"
    else:
        mode = "long" if is_hoodie else "short"

    def is_sleeve(part_name: str) -> bool:
        n = (part_name or "").lower()
        return n.startswith("sleeve") and "left" not in n and "right" not in n

    if mode != "mixed":
        target = "sleeve-long" if mode == "long" else "sleeve-short"
        for group in plan_dict.get("production_groups", []):
            for item in group.get("items", []):
                if is_sleeve(item.get("part_name", "")):
                    item["part_name"] = target
        return

    rows_by_size: Dict[str, List[Dict[str, Any]]] = {}
    for row in raw_orders:
        rows_by_size.setdefault(_norm_size(row.get("size", "")), []).append(row)

    for group in plan_dict.get("production_groups", []):
        items = group.get("items", [])
        sleeve_items = [it for it in items if is_sleeve(it.get("part_name", ""))]
        if not sleeve_items:
            continue
        if len(sleeve_items) > 1:
            logger.warning(
                f"Mixed short/long sleeve instructions, but size '{group.get('size')}' already has "
                f"{len(sleeve_items)} personalized sleeve items - leaving as-is, check sleeve length manually"
            )
            continue

        rows = rows_by_size.get(_norm_size(group.get("size", "")), [])
        short_qty = sum(int(r.get("quantity", 1) or 1) for r in rows if str(r.get("sleeve", "")).strip().lower() == "half")
        long_qty = sum(int(r.get("quantity", 1) or 1) for r in rows if str(r.get("sleeve", "")).strip().lower() == "full")
        if short_qty == 0 and long_qty == 0:
            continue  # no Excel rows matched this size - leave the agent's item alone

        template = sleeve_items[0]
        rebuilt = []
        if short_qty:
            rebuilt.append({**template, "part_name": "sleeve-short", "quantity": short_qty,
                             "text_replacements": list(template.get("text_replacements", []))})
        if long_qty:
            rebuilt.append({**template, "part_name": "sleeve-long", "quantity": long_qty,
                             "text_replacements": list(template.get("text_replacements", []))})

        idx = items.index(template)
        group["items"] = items[:idx] + rebuilt + items[idx + 1:]

def _enforce_hoodie_neck(plan_dict: Dict[str, Any], hoodie: bool) -> None:
    """Hoodies have no neckline (the Hood covers it) - the LLM still emits a
    'neck' item per its Rule 4 default part list since it isn't hoodie-aware.
    Strip it whenever the Hoodie checkbox is on. Must run before
    _enforce_extra_logos so a 'Neck Logo' Excel column never gets attached to
    a part that's about to be dropped."""
    if not hoodie:
        return
    for group in plan_dict.get("production_groups", []):
        items = group.get("items", [])
        kept = [it for it in items if str(it.get("part_name", "")).lower() != "neck"]
        if len(kept) != len(items):
            logger.info(f"HOODIE: removed 'neck' item from size '{group.get('size')}' (hoodies have no neckline).")
        group["items"] = kept

def _enforce_extra_logos(plan_dict: Dict[str, Any], raw_orders: List[Dict[str, Any]]) -> None:
    """Neck/Sleeve logos ('Neck Logo', 'Left/Right/Sleeve Logo' Excel columns).
    Unlike front/back, these parts are never itemized per Excel row (they
    dedupe to one artboard per size group - see _dedupe_unpersonalized), so
    there is one logo value per size group here, not one per row. Must run
    AFTER _dedupe_unpersonalized so the logo lands on the single surviving
    item instead of being duplicated across items that are about to collapse."""
    if not raw_orders:
        return

    rows_by_size: Dict[str, List[Dict[str, Any]]] = {}
    for row in raw_orders:
        rows_by_size.setdefault(_norm_size(row.get("size", "")), []).append(row)

    def first_logo(rows, part_key):
        for r in rows:
            val = (r.get("personalization", {}).get(part_key) or {}).get("logo")
            if val:
                return str(val)
        return None

    for group in plan_dict.get("production_groups", []):
        rows = rows_by_size.get(_norm_size(group.get("size", "")))
        if not rows:
            continue

        neck_logo = first_logo(rows, "neck")
        left_logo = first_logo(rows, "sleeve-left")
        right_logo = first_logo(rows, "sleeve-right")
        both_logo = first_logo(rows, "sleeve-both")
        if not (neck_logo or left_logo or right_logo or both_logo):
            continue

        for item in group.get("items", []):
            part = str(item.get("part_name", ""))
            reps = item.setdefault("text_replacements", [])
            has = lambda ln: any(str(tr.get("layer_name", "")).upper() == ln for tr in reps)

            if part == "neck" and neck_logo and not has("LOGO"):
                reps.append({"layer_name": "LOGO", "new_value": neck_logo})
            elif "sleeve" in part:
                if both_logo and not has("LOGO"):
                    reps.append({"layer_name": "LOGO", "new_value": both_logo})
                if left_logo and not has("LEFT SLEEVE LOGO"):
                    reps.append({"layer_name": "LEFT SLEEVE LOGO", "new_value": left_logo})
                if right_logo and not has("RIGHT SLEEVE LOGO"):
                    reps.append({"layer_name": "RIGHT SLEEVE LOGO", "new_value": right_logo})

def _enforce_accessories(plan: Dict[str, Any], requested: List[str]) -> None:
    """Accessories (placket / twill-tape / tukdi) come from frontend checkboxes,
    never the LLM: strip whatever accessory items the agent produced, then
    append one 'Universal' group holding exactly the requested parts."""
    def _is_acc(name: Any) -> bool:
        n = str(name or "").lower()
        return any(k in n for k in ("placket", "twill", "tukdi", "tape"))

    groups = plan.get("production_groups", [])
    for group in groups:
        group["items"] = [it for it in group.get("items", []) if not _is_acc(it.get("part_name"))]
    plan["production_groups"] = [g for g in groups if g.get("items")]
    if requested:
        plan["production_groups"].append({
            "size": "Universal",
            "items": [
                {"part_name": p, "size": "Universal", "quantity": 1, "text_replacements": []}
                for p in requested
            ],
        })
        logger.info(f"Accessories added from checkboxes: {requested}")

def _enforce_hoodie_rib_cuff(plan: Dict[str, Any], is_hoodie: bool) -> None:
    """Hoodies always need their Rib & Cuff piece, and it scales with the
    garment, so it is one item PER SIZE (like Patti, not like the shared
    'Universal' accessories).

    It was never reaching the plan at all: the LLM is told not to invent
    accessory parts, no checkbox requests it, and the JSX's hoodie branch
    auto-builds only Hood/Border/Pocket from the pattern - so nothing asked
    for it and nothing was exported. Adding it here (rather than in the JSX
    hoodie branch) keeps the existing main-loop path, which already knows how
    to look up '<Size> Rib & Cuff', paste its mockup design, clear its strokes
    and anchor it 5mm below that size's Sleeve.

    'cuff' is the part_name the JSX maps to the 'Rib & Cuff' pattern group.
    Must run after _enforce_accessories so the Universal group is skipped."""
    if not is_hoodie:
        return
    added = 0
    for group in plan.get("production_groups", []):
        size = group.get("size")
        if not size or size == "Universal":
            continue
        items = group.setdefault("items", [])
        if any("cuff" in str(it.get("part_name", "")).lower()
               or "rib" in str(it.get("part_name", "")).lower() for it in items):
            continue
        items.append({"part_name": "cuff", "size": size, "quantity": 1, "text_replacements": []})
        added += 1
    if added:
        logger.info(f"Hoodie: added one Rib & Cuff item to {added} size group(s).")

def _enforce_full_button_patti(plan: Dict[str, Any], enabled: bool) -> None:
    """Full-button jerseys need one Patti (the button strip - distinct from
    Placket) panel PER SIZE: its length scales with the garment, so unlike
    Placket/Twill Tape/Tukdi it can't be one shared Universal piece.
    Deterministic, gated by the frontend's 'Full Button Jersey' checkbox -
    never routed through the LLM. Must run after _enforce_accessories so the
    Universal accessories group already exists and gets skipped here."""
    if not enabled:
        return
    for group in plan.get("production_groups", []):
        size = group.get("size")
        if not size or size == "Universal":
            continue
        items = group.setdefault("items", [])
        if any(it.get("part_name") == "patti" for it in items):
            continue
        items.append({"part_name": "patti", "size": size, "quantity": 1, "text_replacements": []})
    logger.info("Full-button jersey: added one Patti item per size group.")

# ---------------------------------------------------------------------------
# SINGLE-JOB LOCK
#
# One machine, one Illustrator. Two automations against the same instance
# destroy each other: they share app.Documents, the swatch tables and the
# same-named groups run_illustrator_automation closes on startup as "leftovers
# from a previous run" (illustrator_automation.py:929-936) - one job would
# close the other's live order document mid-layout.
#
# Nothing enforced this before, because one person driving one browser never
# started two. A form that comes back the moment the plan is built - the
# Illustrator work is queued, not finished (see /jobs/upload's return) - plus
# a second tab, a page refresh, or a double-click, removes that guarantee.
#
# The slot is claimed in the REQUEST, never inside the background task:
# add_task only runs after the response has been sent, so two quick requests
# would both pass a check made in the task and both start.
#
# Deliberately in memory, not on disk: the automation runs in this process's
# threadpool, so if the process dies the job dies with it and a persisted lock
# would only strand the next start. (An out-of-process agent WOULD need the
# disk version - see DEPLOYMENT_PLAN.md §4.)
# ---------------------------------------------------------------------------
_current_job_id = job_runtime.current_job_id
_claim_job_slot = job_runtime.claim_job_slot
_release_job_slot = job_runtime.release_job_slot
_busy_error = job_runtime.busy_error


def _run_job_locked(job_id: str, *args, **kwargs) -> None:
    # run_illustrator_automation is looked up here, at call time, so tests can
    # still substitute it on this module.
    return job_runtime.run_job_locked(run_illustrator_automation, job_id, *args, **kwargs)


app = FastAPI(title="AI Apparel Orchestrator API")

# Who may call this from a browser. Overridable so a preview deployment can be
# added without a code change.
#
# Worth being honest about what this does and does not do: CORS is enforced BY
# the browser, so it stops a hostile page from using a visitor's session - it
# does not stop curl, a script, or anything that simply ignores the rule.
# CLOUD_API_KEY on /plan is the actual lock. This is the second one.
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv(
        "CLOUD_ALLOWED_ORIGINS",
        "https://apparel-ai-generator.vercel.app,http://localhost:3000,http://127.0.0.1:3000",
    ).split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # Vercel preview builds get a generated subdomain per deployment, so they
    # cannot be listed one by one.
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)

def job_options(
    match_sleeve_to_side: bool = Form(False),
    sleeve_match_mode: str = Form("auto"),
    full_button_jersey: bool = Form(False),
    full_button_center_match: bool = Form(False),
    full_button_front_back_match: bool = Form(False),
    full_button_pattern_match: bool = Form(False),
    include_placket: bool = Form(False),
    include_twill_tape: bool = Form(False),
    include_tukdi: bool = Form(False),
    preserve_sleeve_rib_distance: bool = Form(False),
    local_tag_enabled: bool = Form(False),
    neck_contrast: bool = Form(False),
    front_back_side_match: bool = Form(False),
    hoodie: bool = Form(False),
    hoodie_center_design_match: bool = Form(False),
    design_scale_mode: str = Form("height"),
) -> Dict[str, Any]:
    """Every checkbox on the upload form, declared once.

    Both /plan and /jobs/upload take the same set; one declaration is what
    stops them drifting apart as options are added."""
    return {
        "match_sleeve_to_side": match_sleeve_to_side,
        "sleeve_match_mode": sleeve_match_mode,
        "full_button_jersey": full_button_jersey,
        "full_button_center_match": full_button_center_match,
        "full_button_front_back_match": full_button_front_back_match,
        "full_button_pattern_match": full_button_pattern_match,
        "include_placket": include_placket,
        "include_twill_tape": include_twill_tape,
        "include_tukdi": include_tukdi,
        "preserve_sleeve_rib_distance": preserve_sleeve_rib_distance,
        "local_tag_enabled": local_tag_enabled,
        "neck_contrast": neck_contrast,
        "front_back_side_match": front_back_side_match,
        "hoodie": hoodie,
        "hoodie_center_design_match": hoodie_center_design_match,
        "design_scale_mode": design_scale_mode,
    }


async def _build_plan(
    excel_content: bytes, job_id: str, user_instructions: str, opt: Dict[str, Any]
) -> Dict[str, Any]:
    """Excel + options -> the production plan, with no Illustrator involved.

    THIS IS THE CLOUD HALF. It reads a few hundred KB of Excel, calls Gemini and
    applies every deterministic rule; it never touches a .ai file and never
    opens Illustrator. That is exactly why it can be deployed to Cloud Run while
    the rendering stays on the designer's PC (DEPLOYMENT_PLAN.md).
    """
    excel_data = parse_order_excel(excel_content)

    prompt_text = (
        f"Job ID: {job_id}\nSummary: {excel_data['summary']}\n"
        f"Instructions: {user_instructions}"
    )
    # Runner.run only auto-wraps a bare STRING into a proper
    # {"role":"user","content":...} item (agents/items.py
    # input_to_new_input_list) - a list containing a raw string is assumed to
    # already hold structured items and passed straight to the model, which the
    # Chat Completions converter (this project uses Gemini via
    # OpenAIChatCompletionsModel) can't recognize, so it raises "Unhandled item
    # type or structure". Pass the plain string directly.
    #
    # No session: each job created a fresh SQLiteSession and ran the agent
    # exactly once, so it carried no conversation state - and a SQLite file
    # would not survive a Cloud Run restart anyway.
    result = await _run_agent(ApparelOrchestratorAgent, prompt_text)
    final_plan = result.final_output

    if excel_data["color_mapping"]:
        final_plan.color_mapping = [
            ColorMappingEntry(swatch_name=k, color=CMYKColor(**v))
            for k, v in excel_data["color_mapping"].items()
        ]

    hoodie = bool(opt["hoodie"])

    # Excel rows are the source of truth for per-jersey names/numbers; fix any
    # personalization the LLM collapsed into quantity buckets.
    plan_dict = final_plan.dict()
    _enforce_personalization(plan_dict, excel_data.get("raw_orders", []))
    _dedupe_unpersonalized(plan_dict)
    _enforce_hoodie_neck(plan_dict, hoodie)
    _enforce_sleeve_length(plan_dict, excel_data.get("raw_orders", []), user_instructions, is_hoodie=hoodie)
    _enforce_extra_logos(plan_dict, excel_data.get("raw_orders", []))

    # Accessories are checkbox-driven: enforced in code, never trusted to the LLM.
    requested_accessories = [p for p, on in (
        ("placket", opt["include_placket"]),
        ("twill-tape", opt["include_twill_tape"]),
        ("tukdi", opt["include_tukdi"]),
    ) if on]
    _enforce_accessories(plan_dict, requested_accessories)

    # Full-button jersey: one Patti item per size. Must run AFTER
    # _enforce_accessories so the Universal accessories group already exists and
    # gets skipped. The checkbox also drives the Front-Left/Front-Right split,
    # applied later in the JSX.
    _enforce_full_button_patti(plan_dict, opt["full_button_jersey"])

    # Hoodie: one Rib & Cuff item per size (same ordering requirement as Patti).
    _enforce_hoodie_rib_cuff(plan_dict, hoodie)

    plan_dict["match_sleeve_to_side"] = bool(opt["match_sleeve_to_side"])
    # HOW a unit may be corrected onto its target. Normalised here, same as
    # design_scale_mode below: anything unrecognised falls back rather than
    # being passed through, which keeps the stored plan honest about what ran.
    plan_dict["sleeve_match_mode"] = (
        opt["sleeve_match_mode"]
        if opt["sleeve_match_mode"] in ("vertical", "horizontal", "resize") else "auto"
    )
    plan_dict["full_button_jersey"] = bool(opt["full_button_jersey"])
    # Both sub-features only run when full_button_jersey is also on - enforced
    # in the JSX, not here, so a stray true from a malformed request can't do
    # anything on a non-full-button job.
    plan_dict["full_button_center_match"] = bool(opt["full_button_center_match"])
    plan_dict["full_button_front_back_match"] = bool(opt["full_button_front_back_match"])
    plan_dict["full_button_pattern_match"] = bool(opt["full_button_pattern_match"])
    plan_dict["preserve_sleeve_rib_distance"] = bool(opt["preserve_sleeve_rib_distance"])
    # LOCAL TAG and NECK CONTRAST: standalone, every job type, gated in the JSX.
    plan_dict["local_tag_enabled"] = bool(opt["local_tag_enabled"])
    plan_dict["neck_contrast"] = bool(opt["neck_contrast"])
    plan_dict["front_back_side_match"] = bool(opt["front_back_side_match"])
    plan_dict["hoodie"] = hoodie
    # Nested under Hoodie on the frontend, so ANDed with it here too: the
    # checkbox stays checked in the DOM if the user ticks it and then unticks
    # Hoodie, and a lone flag would otherwise pause a job that has no hood.
    plan_dict["hoodie_center_design_match"] = bool(hoodie and opt["hoodie_center_design_match"])
    # Job-wide, deliberately NOT gated on garment type. "height" (default,
    # uniform), "height_sides" (adds SIDE-ANCHOR), "both" (two-axis stretch, no
    # longer offered on the form but still honoured for re-running old plans).
    plan_dict["design_scale_mode"] = (
        opt["design_scale_mode"]
        if opt["design_scale_mode"] in ("height_sides", "both") else "height"
    )

    # The LLM echoes back whatever job id it saw in the prompt; only the
    # caller's id may be used downstream.
    plan_dict["job_id"] = job_id

    # LAST plan step: the pd.ai file is laid out in this exact group order, so
    # it must run after every _enforce_* above (the Universal accessories group
    # is appended by one of them and has to land at the end).
    _sort_size_groups(plan_dict)
    return plan_dict


# ---------------------------------------------------------------------------
# AUTOMATION DISTRIBUTION
#
# The render logic is automate_production.jsx - 11,000 lines, and where nearly
# every change in this project happens. Shipping it inside the agent package
# means a JSX fix reaches designers only when each of them downloads and
# reinstalls, which nobody will do reliably.
#
# It does not have to work that way. illustrator_automation.py READS the JSX
# from disk at job time (see the $.evalFile bundle it builds), so it is data to
# the agent, not part of it. Serve it from here, let the agent refresh its copy
# when idle, and a JSX change ships by itself.
#
# The version is the content hash, so there is no number to remember to bump -
# edit the file and the version has already changed.
# ---------------------------------------------------------------------------
_JSX_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts")


def _jsx_manifest() -> Dict[str, Any]:
    import hashlib
    files = {}
    for name in sorted(os.listdir(_JSX_DIR)):
        if not name.endswith(".jsx"):
            continue
        with open(os.path.join(_JSX_DIR, name), "rb") as f:
            files[name] = hashlib.sha256(f.read()).hexdigest()
    combined = hashlib.sha256("".join(f"{k}:{v}" for k, v in files.items()).encode()).hexdigest()
    return {"version": combined[:16], "files": files}


@app.get("/automation/manifest")
async def automation_manifest():
    """What the current render logic is, and the hash of each file in it."""
    return _jsx_manifest()


@app.get("/automation/file/{name}")
async def automation_file(name: str):
    """One JSX file, verbatim.

    Only files that are actually in the manifest are served: `name` comes off
    the URL, and this must not become a way to read anything else on the host."""
    if name not in _jsx_manifest()["files"]:
        raise HTTPException(status_code=404, detail="Not part of the automation bundle")
    from fastapi.responses import FileResponse
    return FileResponse(os.path.join(_JSX_DIR, name), media_type="text/plain")


@app.post("/plan")
async def build_plan_only(
    _: None = Depends(require_api_key),
    excel_file: UploadFile = File(...),
    job_name: str = Form(...),
    user_instructions: str = Form("Standard production rules apply."),
    opt: Dict[str, Any] = Depends(job_options),
):
    """The planning half on its own - what the cloud deployment exposes.

    Takes only the Excel (a few hundred KB) and the checkboxes, and returns the
    plan. The .ai files never come here: they go straight from the browser to
    the local agent, which is what keeps a 135MB pattern and a 334MB zip off
    the network entirely.

    Behind CLOUD_API_KEY. This route spends real Gemini quota on every call, so
    an open one is not a data leak but a bill and a denial of service: anybody
    with the URL could burn all four keys and leave the designers with 503s."""
    try:
        content = await excel_file.read()
        plan = await _build_plan(
            content, job_runtime.safe_job_name(job_name), user_instructions, opt
        )
        return {"production_plan": plan}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Planning failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/jobs/upload")
async def upload_files(
    background_tasks: BackgroundTasks,
    excel_file: UploadFile = File(...),
    mockup_ai: UploadFile = File(...),
    pattern_ai: UploadFile = File(...),
    logo_library_ai: Optional[UploadFile] = File(None),
    fonts: List[UploadFile] = File([]),
    # Names the job everywhere: uploads/<job_name>/ holds the uploads, the
    # render folder inside it carries the same name, and the name is the job id
    # in every status/download URL. Required - see _unique_job_dir.
    job_name: str = Form(...),
    user_instructions: str = Form("Standard production rules apply."),
    opt: Dict[str, Any] = Depends(job_options),
):
    # Fail fast, BEFORE the ~139MB of .ai files are written to disk and before
    # a Gemini call is spent - the claim below is the real guard, this only
    # stops the obvious case cheaply.
    busy = _current_job_id()
    if busy:
        raise _busy_error(busy)

    job_id, job_dir = _unique_job_dir(job_name)
    os.makedirs(job_dir, exist_ok=True)

    # Save files to disk
    pattern_path = os.path.join(job_dir, "pattern.ai")
    with open(pattern_path, "wb") as f: f.write(await pattern_ai.read())

    mockup_path = os.path.join(job_dir, "mockup.ai")
    with open(mockup_path, "wb") as f: f.write(await mockup_ai.read())

    # Logo library: optional, only present when the frontend's Logo
    # personalization checkbox is on. Named groups inside it are matched by
    # name against the Excel '<Part> Logo' column values (see automate_production.jsx).
    logo_library_path = None
    if logo_library_ai and logo_library_ai.filename:
        logo_library_path = os.path.join(job_dir, "logo_library.ai")
        with open(logo_library_path, "wb") as f: f.write(await logo_library_ai.read())

    # Save fonts to 'Document Fonts' folder
    if fonts:
        fonts_dir = os.path.join(job_dir, "Document Fonts")
        os.makedirs(fonts_dir, exist_ok=True)
        for font in fonts:
            if font.filename:
                # Filter out empty files or bad filenames
                font_path = os.path.join(fonts_dir, font.filename)
                with open(font_path, "wb") as f:
                    f.write(await font.read())
    
    # The ~139MB of .ai files above are already on disk, but the job has not
    # started yet: the Excel parse and the Gemini call below both fail on real
    # orders (a missing 'Size' column, a model timeout, a schema the agent got
    # wrong). Every one of those used to leave the folder behind forever, and
    # nothing ever swept them - so a week of failed attempts quietly cost
    # gigabytes. Cleared in the `finally` unless the job actually launched.
    #
    # Nothing of value is lost by deleting: the Excel is read straight from
    # memory and was never written here, so a kept folder holds only the two
    # .ai files the user still has locally anyway.
    job_started = False
    try:
        excel_content = await excel_file.read()
        plan_dict = await _build_plan(excel_content, job_id, user_instructions, opt)

        # Trigger Illustrator Automation in Background. The slot is claimed
        # here, atomically, rather than relying on the fail-fast check at the
        # top: the Gemini call above takes ~20s, and a second upload that
        # arrived during it would have passed that check too.
        busy = _claim_job_slot(job_id)
        if busy:
            raise _busy_error(busy)
        background_tasks.add_task(
            _run_job_locked,
            job_id, job_dir, plan_dict, pattern_path, mockup_path,
            logo_library_ai_path=logo_library_path,
        )
        job_started = True

        return {
            "job_id": job_id,
            "status": "processing_started",
            "production_plan": plan_dict,
            "download_url": f"/jobs/download/{job_id}"
        }

    except HTTPException:
        # The 409 from the job-slot claim carries a message the user needs to
        # read; the blanket handler below would flatten it into a 500.
        raise
    except Exception as e:
        logger.exception("Processing failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if not job_started:
            # A no-op unless the claim succeeded and something after it threw -
            # _release_job_slot only frees a slot this job actually holds.
            _release_job_slot(job_id)
            shutil.rmtree(job_dir, ignore_errors=True)
            logger.info(f"Job '{job_id}' never started - removed its upload folder")

class ResumeRequest(BaseModel):
    # "retry": user installed the missing fonts, restart Illustrator and re-run
    # "continue": proceed with Illustrator's default substituted fonts
    action: str

@app.post("/jobs/resume/{job_id}")
async def resume_job(job_id: str, request: ResumeRequest, background_tasks: BackgroundTasks):
    job_dir = _job_dir_for(job_id)
    plan_json_path = os.path.join(job_dir, "production_plan.json")
    if not os.path.isdir(job_dir) or not os.path.exists(plan_json_path):
        raise HTTPException(status_code=404, detail="Job not found or has no saved production plan")
    if request.action not in ("retry", "continue"):
        raise HTTPException(status_code=400, detail="action must be 'retry' or 'continue'")

    with open(plan_json_path, "r") as f:
        plan_data = json.load(f)
    _dedupe_unpersonalized(plan_data)
    # Plans saved before size ordering existed are re-sorted on resume, so a
    # resumed job produces the same smallest -> largest pd.ai as a fresh one.
    _sort_size_groups(plan_data)

    pattern_path = os.path.join(job_dir, "pattern.ai")
    mockup_path = os.path.join(job_dir, "mockup.ai")
    logo_library_path = os.path.join(job_dir, "logo_library.ai")
    if not os.path.exists(logo_library_path):
        logo_library_path = None

    # Which pre-flight actually paused this job - read from the last status,
    # not guessed from the action alone. Multiple different pauses (missing
    # fonts, missing Center layer, missing LOCAL TAG layer) can each be
    # resumed with "continue", but only the one that actually fired should
    # have its check skipped; the others must still run normally on this
    # resumed pass.
    status_path = os.path.join(job_dir, "status.json")
    last_status = {}
    if os.path.exists(status_path):
        with open(status_path, "r") as f:
            last_status = json.load(f)

    # Same single-Illustrator rule as /jobs/upload - resume is a second way
    # into run_illustrator_automation, so it needs its own claim. Two quick
    # clicks on "Continue" would otherwise start two automations.
    busy = _claim_job_slot(job_id)
    if busy:
        raise _busy_error(busy)

    update_status(job_dir, "Resuming automation...", 15)
    background_tasks.add_task(
        _run_job_locked,
        job_id, job_dir, plan_data, pattern_path, mockup_path,
        logo_library_ai_path=logo_library_path,
        ignore_missing_fonts=(last_status.get("font_missing") and request.action == "continue"),
        force_font_refresh=(last_status.get("font_missing") and request.action == "retry"),
        ignore_center_match_warning=(last_status.get("center_layer_missing") and request.action == "continue"),
        ignore_local_tag_warning=(last_status.get("local_tag_missing") and request.action == "continue"),
        ignore_pattern_match_warning=(last_status.get("pattern_layer_missing") and request.action == "continue"),
        ignore_side_seam_match_warning=(last_status.get("side_seam_match_layer_missing") and request.action == "continue"),
        ignore_armhole_match_warning=(last_status.get("armhole_match_layer_missing") and request.action == "continue"),
        ignore_hoodie_warning=(last_status.get("hoodie_layer_missing") and request.action == "continue"),
        ignore_hood_center_match_warning=(last_status.get("hood_center_match_layer_missing") and request.action == "continue"),
        # "Continue" here means: render the order without the panels the pattern
        # file doesn't have (exactly what the JSX did before the check existed).
        ignore_pattern_piece_warning=(last_status.get("pattern_piece_missing") and request.action == "continue"),
        # "Continue" = close Illustrator and lose that work; "retry" needs no
        # flag at all, since re-running the check is exactly what the operator
        # is asking for after saving.
        ignore_unsaved_work=(last_status.get("illustrator_unsaved_work") and request.action == "continue"),
    )
    return {"job_id": job_id, "status": "resumed", "action": request.action}

@app.post("/jobs/cancel/{job_id}")
async def cancel_job(job_id: str):
    """Marks a paused job (missing fonts / missing Center layer / missing
    Pattern layer / missing LOCAL TAG layer) as cancelled by the user. Does NOT touch
    run_illustrator_automation - a cancelled job
    must never launch Illustrator, just record a terminal status the
    frontend can show instead of leaving the job looking stuck forever."""
    job_dir = _job_dir_for(job_id)
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

@app.get("/jobs/running")
async def get_running_job():
    """Which job, if any, currently holds the Illustrator slot.

    The upload form calls this immediately before submitting, so a page
    refresh mid-job still blocks a second start - the browser's own state
    does not survive a reload, and by the time a 409 came back the ~139MB of
    .ai files would already have been transferred."""
    return {"job_id": _current_job_id()}


_last_status = job_runtime._last_status


@app.get("/jobs/status/{job_id}")
async def get_job_status(job_id: str):
    """The job's current status, once - see job_runtime.read_status."""
    return await job_runtime.read_status(UPLOAD_DIR, job_id)


@app.get("/jobs/stream/{job_id}")
async def stream_job_status(job_id: str, request: Request):
    """Server-sent events - see job_runtime.status_stream."""
    return job_runtime.status_stream(UPLOAD_DIR, job_id, request)


@app.get("/jobs/download/{job_id}")
async def download_job(job_id: str):
    job_dir = _job_dir_for(job_id)
    zip_path = os.path.join(job_dir, f"order_{job_id}_ready.zip")
    if os.path.exists(zip_path):
        from fastapi.responses import FileResponse
        return FileResponse(zip_path, filename=f"order_{job_id}_ready.zip")
    return {"status": "processing", "message": "Zip file not ready yet. Please refresh."}

if __name__ == "__main__":
    import uvicorn

    # Loopback by default: 0.0.0.0 hands this API - and the Gemini quota behind
    # it - to every machine on the same network, which on an office LAN or a
    # cafe wifi is not a small thing. Cloud Run needs 0.0.0.0 and sets PORT, so
    # deployment opts in explicitly rather than everyone else opting out.
    host = os.getenv("CLOUD_HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)
