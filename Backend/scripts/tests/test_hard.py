"""Women's-size support: the adversarial pass.

Not "does the happy path work" - that is test_py.py / test_jsx.js. This one
tries to break it: messy cells a real sheet carries, every spelling crossed with
every separator, the four implementations checked against EACH OTHER, and the
invariants that must hold for the whole design to be sound.
"""
import io
import itertools
import json
import os
import random
import re
import subprocess
import sys
from typing import Optional  # noqa: F401

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))   # Backend/scripts/tests -> repo root
PY = os.path.join(ROOT, "Backend", ".venv", "Scripts", "python.exe")


def slice_source(path, start, end):
    src = open(path, encoding="utf-8").read()
    return src[src.index(start):src.index(end)]


ia = {"re": re}
exec(slice_source(os.path.join(ROOT, "Backend", "services", "illustrator_automation.py"),
                  "_FRIENDLY_SIZE_MAP = {", "def pattern_files_needed"), ia)
mn = {"re": re, "Optional": Optional}
exec(slice_source(os.path.join(ROOT, "Backend", "main.py"),
                  "_SIZE_SEQUENCE = [", "def _sort_size_groups"), mn)
exec(slice_source(os.path.join(ROOT, "Backend", "main.py"), "def _norm_size", "# ----"), mn)
norm_size = mn["_norm_size"]

friendly, youth_file, aliases = ia["_friendly_size"], ia["is_youth_pattern_size"], ia["_size_aliases"]
size_rank, women_rank = mn["_size_rank"], mn["_women_rank"]

WOMEN = ["W-XS", "W-S", "W-M", "W-L", "W-XL", "W-2XL",
         "W-YXXS", "W-YXS", "W-YS", "W-YM", "W-YL", "W-YXL"]
LEGACY = ["XS", "Small", "Medium", "Large", "XL", "2XL", "3XL", "4XL",
          "YXS", "YS", "YM", "YL", "YXL", "4T", "10T", "6M", "12M"]

fails, checks = [], 0


def check(name, got, want):
    global checks
    checks += 1
    if got != want:
        fails.append(f"{name}\n      got  {got!r}\n      want {want!r}")


def section(t):
    print(f"  .. {t}")


# =============================================================== 1. MESSY CELLS
# What a Size cell really holds after a human, Excel and a copy-paste from a PDF
# have all had a turn at it.
section("messy real-world cells")
MESSY = {
    "  Women Large  ": "W-L",          # the strip() excel_service does
    "Women\u00a0Large": "W-L",         # non-breaking space, straight from a PDF paste
    "Women\u2013Large": "W-L",         # en dash, Word's autocorrect for "-"
    "Women\u2014L": "W-L",             # em dash
    "Women  Large": "W-L",             # double space
    "Women\tLarge": "W-L",             # tab
    "Women\nLarge": "W-L",             # a wrapped cell
    "WOMEN LARGE": "W-L",
    "women large": "W-L",
    "WoMeN LaRgE": "W-L",
    "W--L": "W-L",
    "W - L": "W-L",
    "W_L": "W-L",
    "W/L": "W-L",
    "W.L": "W-L",
    "(W-L)": "W-L",
    "Women's  Large ": "W-L",
    "W-L ": "W-L",
    " W-YM": "W-YM",
    "Women Youth  Medium": "W-YM",
    "WOMEN-YOUTH-MEDIUM": "W-YM",
}
for raw, want in MESSY.items():
    check(f"messy {raw!r}", friendly(raw), want)

# Excel hands numeric-looking cells over as floats; a size column should survive
# that without pretending 2.0 is a size.
for raw in ["2.0", "38", "40.5", "0", "-1"]:
    check(f"numeric cell {raw!r} stays unknown", friendly(raw) == raw, True)

# ==================================================== 2. SEPARATOR CROSS-PRODUCT
# Every women's spelling x every separator a human might type. The whole design
# rests on punctuation being irrelevant, so prove it exhaustively.
section("every spelling x every separator")
SEPS = [" ", "-", "_", ".", "/", "  ", " - ", ""]
SPELLINGS = {
    "W-M": [("W", "M"), ("Women", "M"), ("Womens", "M"), ("Ladies", "M"),
            ("Women", "Medium"), ("W", "Med"), ("Women", "MEDIUM")],
    "W-L": [("W", "L"), ("Women", "Large"), ("Ladies", "L"), ("W", "Lg")],
    "W-2XL": [("W", "2XL"), ("W", "XXL"), ("Women", "2XL"), ("Women", "XXLarge")],
    "W-YM": [("W", "YM"), ("Women", "YM"), ("Womens", "YM")],
}
for label, parts in SPELLINGS.items():
    for head, body in parts:
        for sep in SEPS:
            cell = head + sep + body
            if sep == "" and head == "Women" and body == "Medium":
                pass  # "WomenMedium" - still unambiguous, must work
            check(f"{cell!r}", friendly(cell), label)

# Three-word forms with mixed separators.
for a, b in itertools.product(SEPS[:5], SEPS[:5]):
    check(f"'Women{a}Youth{b}Large'", friendly(f"Women{a}Youth{b}Large"), "W-YL")
    check(f"'Women{a}Adult{b}Large'", friendly(f"Women{a}Adult{b}Large"), "W-L")

# =========================================== 3. INVARIANTS THE DESIGN RESTS ON
section("invariants")
# (a) IDEMPOTENT: the canonical label must survive being normalised again. The
#     JSX calls getFriendlySize on values that have already been through it.
for label in WOMEN + LEGACY:
    check(f"idempotent {label}", friendly(friendly(label)), friendly(label))

# (b) ROUND TRIP: every spelling the pattern lookup will probe must itself be
#     readable as that size. A probe name that does not round-trip means the two
#     halves disagree about what the size is called.
for label in WOMEN + LEGACY:
    for alias in aliases(label):
        check(f"round trip {label} -> {alias!r}", friendly(alias), label)

# (c) NO CROSS-SIZE COLLISION: two different sizes must never probe the same
#     name, or whichever panel exists wins and the other size is cut from it.
owner = {}
for label in WOMEN + LEGACY:
    for alias in aliases(label):
        k = alias.lower().replace(" ", "").replace("-", "")   # findAnywhere's key
        if k in owner and owner[k] != label:
            check(f"alias {alias!r} is claimed by one size", [owner[k], label], [label])
        owner[k] = label
check("no alias is shared between two sizes", True, True)

# (d) The women's block must be routed to the file it is graded in, ALWAYS.
for label in WOMEN:
    check(f"{label} pattern file", youth_file(label), label.startswith("W-Y"))

# (e) Sort rank and pattern file must agree: everything in a youth-file block
#     must rank in a youth bucket, or the render reopens a 135MB document.
YOUTH_BUCKETS, ADULT_BUCKETS = {0, 1, 2, 3}, {4, 5}
for label in WOMEN + LEGACY:
    bucket = size_rank(label)[0]
    in_youth_file = youth_file(label)
    check(f"{label} rank bucket {bucket} matches its pattern file",
          bucket in YOUTH_BUCKETS, in_youth_file)

# ======================================= 4. THE FOUR IMPLEMENTATIONS AGREE
section("python vs extendscript vs typescript")
raw_cells = (list(MESSY) + [s for s in SPELLINGS for s in []] +
             [h + sep + b for label, ps in SPELLINGS.items() for h, b in ps for sep in SEPS] +
             WOMEN + LEGACY +
             ["Universal", "", "  ", "White", "Wide", "W", "Women", "Ladies", "Womens",
              "Women's", "Sm", "S/M", "Med", "Lg", "X-Large", "5XL", "Adult Large",
              "Youth Small", "Toddler 4", "6 Months", "Infant 6M", "AM", "A2XL",
              "Women Adult Large", "Adult Women Large", "Youth Women Small",
              "Women Youth XL", "Ladies Youth M", "W Youth Lg"])
# Fuzz: random junk must never silently become a size.
random.seed(20260917)
ALPHABET = "WwOoMmEeNnSsLlAaDdIiYyUuTtHh-XxZzQq 0123456789"
raw_cells += ["".join(random.choice(ALPHABET) for _ in range(random.randint(1, 12)))
              for _ in range(4000)]

json.dump({"raw": raw_cells, "labels": WOMEN + LEGACY},
          open(os.path.join(HERE, "bridge_in.json"), "w", encoding="utf-8"))
r = subprocess.run(["node", os.path.join(HERE, "jsx_bridge.js")],
                   capture_output=True, text=True, cwd=HERE)
if r.returncode != 0:
    print("BRIDGE FAILED\n" + r.stdout + r.stderr)
    sys.exit(2)
print("     " + r.stdout.strip())
jsx = json.load(open(os.path.join(HERE, "bridge_out.json"), encoding="utf-8"))

mismatch = [(c, friendly(c), j) for c, j in zip(raw_cells, jsx["friendly"]) if friendly(c) != j]
check(f"_friendly_size == getFriendlySize over {len(raw_cells)} cells", mismatch[:6], [])

ymis = [(c, youth_file(c), j) for c, j in zip(raw_cells, jsx["youth_from_raw"]) if youth_file(c) != j]
check("is_youth_pattern_size == isYouthPatternSize", ymis[:6], [])

amis = [(l, aliases(l), jsx["aliases"][l]) for l in WOMEN + LEGACY if aliases(l) != jsx["aliases"][l]]
check("_size_aliases == sizeAliases (exact order)", [a[0] for a in amis], [])

# The browser copy only decides which upload to insist on, and is documented as
# LOOSER - but it must never be looser in the direction that lets a job start
# without the pattern file its panels live in.
ts_wrong = [(c, youth_file(c), t) for c, t in zip(raw_cells, jsx["ts_youth"])
            if youth_file(c) and not t]
check("UploadForm never under-claims the youth file", ts_wrong[:6], [])

# main.py's sorter has its own parser; it must agree about WHICH sizes are
# women's and whether they are youth.
rank_wrong = []
for c in raw_cells:
    lab = friendly(c)
    # _women_rank is fed the body exactly as _size_rank flattens it.
    w = women_rank(re.sub(r"[^a-z0-9]", "", str(c).lower()))
    is_women = str(lab).startswith("W-")
    if is_women != (w is not None):
        rank_wrong.append((c, lab, w))
    elif is_women and (w[0] is True) != lab.startswith("W-Y"):
        rank_wrong.append((c, lab, w))
check("main.py _women_rank agrees with _friendly_size", rank_wrong[:6], [])

# _norm_size pairs a plan group back to its Excel rows. The Excel cell and the
# LLM's echo are written by different authors, so two spellings of ONE size must
# key the same - a mismatch makes _enforce_personalization skip in silence and
# every player in that size ends up wearing the first player's name.
pair_wrong = []
for c in raw_cells:
    lab = friendly(c)
    if lab == c:
        continue                      # nothing was normalised, nothing to pair
    if norm_size(c) != norm_size(lab):
        pair_wrong.append((c, lab, norm_size(c), norm_size(lab)))
check("_norm_size pairs every spelling with its canonical label", pair_wrong[:8], [])

# The spellings a real sheet and a real LLM would disagree about, spelled out.
for a, b in [("Women Large", "W-L"), ("Ladies L", "W-L"), ("Women's Medium", "W-M"),
             ("Women Adult Large", "W-L"), ("Adult Women L", "W-L"),
             ("Women Youth Medium", "W-YM"), ("Youth Women M", "W-YM"),
             ("W L", "W-L"), ("Women–Large", "W-L")]:
    check(f"_norm_size({a!r}) == _norm_size({b!r})", norm_size(a), norm_size(b))
# ...and sizes that are NOT the same must not collide.
keys = {s: norm_size(s) for s in WOMEN + LEGACY}
dupe = [k for k in keys.values() if list(keys.values()).count(k) > 1]
check("_norm_size keeps distinct sizes distinct", dupe, [])

# ============================================ 5. A REAL SHEET THROUGH THE PARSER
section("a real .xlsx through excel_service")
sys.path.insert(0, os.path.join(ROOT, "Backend"))
from services.excel_service import parse_order_excel  # noqa: E402
import openpyxl  # noqa: E402

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Orders"
ws.append([None] * 3)
ws.append(["STANDARD ORDER SHEET"])
ws.append(["Size", "Front Name", "Front Number", "Sleeve"])
SHEET_ROWS = [
    ("Women Large", "AYESHA", "7", "Half"),
    ("women large", "SARA", "9", "Half"),          # same size, different case
    ("  W-L  ", "HINA", "11", "Half"),             # same size again, messy
    ("Women's Medium", "ZARA", "3", "Full"),
    ("W-YM", "AMNA", "5", "Half"),
    ("Women Youth Large", "MARIA", "6", "Half"),
    ("Youth Women Small", "NOOR", "8", "Half"),
    ("Women Adult 2XL", "FARAH", "10", "Half"),
    ("Large", "ALI", "1", "Half"),                 # a plain adult row alongside
    ("YXS", "OMAR", "2", "Half"),
]
for row in SHEET_ROWS:
    ws.append(list(row))
buf = io.BytesIO()
wb.save(buf)
parsed = parse_order_excel(buf.getvalue())
if isinstance(parsed, (str, bytes)):
    parsed = json.loads(parsed)
orders = parsed.get("orders") or parsed.get("raw_orders") or []
sizes = [o["size"] for o in orders]
check("every row survived the parser", len(sizes), len(SHEET_ROWS))
# The parser groups identical prints; these all differ by name, so none merge.
check("parser leaves the size cell verbatim (normalising is the JSX's job)",
      sizes[2], "W-L")

# Now the journey the plan takes: the parser's raw cells -> the sorter -> the
# renderer's label -> which .ai file.
# dict.fromkeys, not set(): the sort is stable, so deduping through a set would
# make the order of the tied W-L spellings depend on hash order, not the sheet.
ordered = sorted(dict.fromkeys(sizes), key=size_rank)
check("plan order across a mixed women's/adult/youth sheet",
      [(s, friendly(s), "youth.ai" if youth_file(s) else "adult.ai") for s in ordered],
      [("YXS", "YXS", "youth.ai"),
       ("Youth Women Small", "W-YS", "youth.ai"),
       ("W-YM", "W-YM", "youth.ai"),
       ("Women Youth Large", "W-YL", "youth.ai"),
       ("Large", "Large", "adult.ai"),
       ("Women's Medium", "W-M", "adult.ai"),   # M before L - the women's ladder
       ("Women Large", "W-L", "adult.ai"),      # has its own order, not the sheet's
       ("women large", "W-L", "adult.ai"),
       ("W-L", "W-L", "adult.ai"),
       ("Women Adult 2XL", "W-2XL", "adult.ai")])

# ===================================== 6. WHAT A PATTERN FILE WOULD ACTUALLY HIT
section("panel lookup against realistic .ai names")
def key(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())          # findAnywhere's key

PARTS = ["Front", "Back", "Short Sleeve", "Long Sleeve", "Neck", "Rib & Cuff"]
PANEL_STYLES = ["{L} {P}", "{F} {P}", "{W} {P}", "{WW} {P}"]
misses = []
for label in WOMEN:
    body = label[2:]
    spelled = {"S": "Small", "M": "Medium", "L": "Large", "2XL": "XXL"}.get(body.upper(), body)
    words = ("Youth " + body[1:]) if body.upper().startswith("Y") and len(body) > 1 else spelled
    probes = {key(a + " " + p) for a in aliases(label) for p in PARTS}
    for part in PARTS:
        for name in [f"{label} {part}", f"{label.replace('-', '')} {part}",
                     f"{label.replace('-', ' ')} {part}",
                     f"Women {words} {part}", f"Womens {words} {part}"]:
            if key(name) not in probes:
                misses.append((label, name))
check("every realistic women's panel name is probed", misses[:8], [])

# And the reverse: a women's probe must never hit a PLAIN adult/youth panel.
plain = {key(f"{lbl} {p}") for lbl in LEGACY for p in PARTS}
bleed = [(lbl, a, p) for lbl in WOMEN for a in aliases(lbl) for p in PARTS
         if key(a + " " + p) in plain]
check("no women's probe collides with a plain panel", bleed[:6], [])

# ---------------------------------------------------------------------- report
print(f"\n{checks - len(fails)}/{checks} passed")
for f in fails:
    print("  FAIL  " + f)
sys.exit(1 if fails else 0)
