"""Women's-size support: the Python half.

Both size tables are sliced out of their files and exec'd rather than imported,
so the test needs neither FastAPI, pywin32, nor a Gemini key to run.
"""
import json
import os
import re
import sys
from typing import Optional  # noqa: F401  (used by the sliced main.py source)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))   # Backend/scripts/tests -> repo root
CASES = json.load(open(os.path.join(HERE, "cases.json"), encoding="utf-8"))


def slice_source(path, start, end):
    src = open(path, encoding="utf-8").read()
    i, j = src.index(start), src.index(end)
    assert i < j, f"{start!r} must come before {end!r} in {path}"
    return src[i:j]


ia = {"re": re}
exec(slice_source(os.path.join(ROOT, "Backend", "services", "illustrator_automation.py"),
                  "_FRIENDLY_SIZE_MAP = {", "def pattern_files_needed"), ia)

mn = {"re": re, "Optional": Optional}
exec(slice_source(os.path.join(ROOT, "Backend", "main.py"),
                  "_SIZE_SEQUENCE = [", "def _sort_size_groups"), mn)

friendly = ia["_friendly_size"]
youth_file = ia["is_youth_pattern_size"]
aliases = ia["_size_aliases"]
size_rank = mn["_size_rank"]

fails, checks = [], 0


def check(name, got, want):
    global checks
    checks += 1
    if got != want:
        fails.append(f"{name}\n      got  {got!r}\n      want {want!r}")


# ---------------------------------------------------------------- friendly size
for raw, want in CASES["friendly"].items():
    if raw.startswith("__"):
        continue
    check(f"_friendly_size({raw!r})", friendly(raw), want)

# ------------------------------------------------------------- which .ai file
for raw in CASES["youth_file"]["__true__"]:
    check(f"is_youth_pattern_size({raw!r})", youth_file(raw), True)
for raw in CASES["youth_file"]["__false__"]:
    check(f"is_youth_pattern_size({raw!r})", youth_file(raw), False)

# ------------------------------------------------------------- pattern aliases
for label, must_have in CASES["aliases"].items():
    got = aliases(label)
    missing = [n for n in must_have if n not in got]
    check(f"_size_aliases({label!r}) contains", missing or "all present", "all present")
    check(f"_size_aliases({label!r})[0] is the label", got[0], label)
    dupes = [n for n in set(got) if got.count(n) > 1]
    check(f"_size_aliases({label!r}) has no duplicates", dupes, [])
    # findAnywhere strips punctuation, so two aliases that differ only in
    # punctuation are the same lookup - a wasted probe, not a bug, but worth
    # catching while the table is small enough to keep clean.
    flat = [n.upper().replace(" ", "").replace("-", "") for n in got]
    same = sorted({n for n in flat if flat.count(n) > 1})
    check(f"_size_aliases({label!r}) no punctuation-only twins", same, [])

for label, forbidden in CASES["alias_must_not_contain"].items():
    got = aliases(label)
    present = [n for n in forbidden if n in got]
    check(f"_size_aliases({label!r}) excludes", present or "none present", "none present")

# --------------------------------------------------------------- plan ordering
# months -> toddler -> youth -> women's youth -> adult -> women's adult
SORTS = [
    (["Universal", "W-L", "XS", "W-YM", "YXS", "4T", "6M"],
     ["6M", "4T", "YXS", "W-YM", "XS", "W-L", "Universal"]),
    (["W-2XL", "Medium", "W-YXXS", "YXL", "2T", "Large", "W-YXL", "XS", "W-XS"],
     ["2T", "YXL", "W-YXXS", "W-YXL", "XS", "Medium", "Large", "W-XS", "W-2XL"]),
    (["Women Large", "Youth Women Small", "Adult Large", "Women Youth XL", "Small"],
     ["Youth Women Small", "Women Youth XL", "Small", "Adult Large", "Women Large"]),
    (["W-YXL", "W-YS", "W-YXXS", "W-YM", "W-YXS", "W-YL"],
     ["W-YXXS", "W-YXS", "W-YS", "W-YM", "W-YL", "W-YXL"]),
    (["W-2XL", "W-M", "W-XS", "W-XL", "W-S", "W-L"],
     ["W-XS", "W-S", "W-M", "W-L", "W-XL", "W-2XL"]),
]
for raw, want in SORTS:
    check(f"_size_rank order {raw}", sorted(raw, key=size_rank), want)

# A women's block must never be split by the ladder it is graded with - that is
# what makes the render open each 135MB pattern file exactly once.
mixed = ["W-L", "XS", "W-YM", "YXS", "Large", "W-XS", "YXL", "W-YL"]
order = sorted(mixed, key=size_rank)
buckets = [size_rank(s)[0] for s in order]
check("pattern-file blocks stay contiguous", buckets, sorted(buckets))

# ---------------------------------------------------------------------- report
print(f"{checks - len(fails)}/{checks} passed")
for f in fails:
    print("  FAIL  " + f)
sys.exit(1 if fails else 0)
