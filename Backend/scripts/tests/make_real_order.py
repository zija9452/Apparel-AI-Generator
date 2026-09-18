"""Builds a real women's order sheet, then walks it through the REAL pipeline.

Nothing here is a mock: the workbook is written with openpyxl in the same shape
as public/Standard_Order_Template.xlsx, parsed by the shipped
services/excel_service.parse_order_excel, ordered by main._size_rank, and
resolved by illustrator_automation._friendly_size / _size_aliases - the same
functions the agent calls on a live job.
"""
import io
import os
import re
import sys

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

ROOT = os.path.abspath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))   # Backend/scripts/tests -> repo root
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "Womens_Order_Test.xlsx")

# The spellings a real customer sheet mixes, all in one order - the same size
# written four different ways in four different rows is the normal case, not the
# edge case.
ROWS = [
    ("Women Large",        "AYESHA",  "7",  "AYESHA",  "07", "Half"),
    ("Women Large",        "SARA",    "9",  "SARA",    "09", "Half"),
    ("women large",        "HINA",    "11", "HINA",    "11", "Half"),
    ("W-L",                "MARIA",   "4",  "MARIA",   "04", "Half"),
    ("Women's Medium",     "ZARA",    "3",  "ZARA",    "03", "Full"),
    ("W M",                "AMNA",    "5",  "AMNA",    "05", "Half"),
    ("Ladies M",           "FIZA",    "12", "FIZA",    "12", "Half"),
    ("W-XS",               "IQRA",    "1",  "IQRA",    "01", "Half"),
    ("Women Adult 2XL",    "FARAH",   "10", "FARAH",   "10", "Half"),
    ("W-YM",               "ALISHA",  "6",  "ALISHA",  "06", "Half"),
    ("Women Youth Large",  "RIDA",    "8",  "RIDA",    "08", "Half"),
    ("Youth Women Small",  "EMAN",    "2",  "EMAN",    "02", "Half"),
    ("W-YXXS",             "LAIBA",   "14", "LAIBA",   "14", "Half"),
    ("Large",              "ALI",     "21", "ALI",     "21", "Half"),
    ("YXS",                "OMAR",    "22", "OMAR",    "22", "Half"),
]
HEADERS = ["Size", "Front Name", "Front Number", "Back Name", "Back Number", "Sleeve"]

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Orders"
ws.append([None] * len(HEADERS))
ws.append(["WOMEN'S TEAM ORDER - TEST SHEET"])
ws.append(HEADERS)
for row in ROWS:
    ws.append(list(row))

title = ws.cell(row=2, column=1)
title.font = Font(bold=True, size=14, color="FF1F3864")
head_fill = PatternFill("solid", fgColor="FF1F3864")
thin = Side(style="thin", color="FFBFBFBF")
for c in range(1, len(HEADERS) + 1):
    cell = ws.cell(row=3, column=c)
    cell.font = Font(bold=True, color="FFFFFFFF")
    cell.fill = head_fill
    cell.alignment = Alignment(horizontal="center", vertical="center")
for r in range(4, 4 + len(ROWS)):
    for c in range(1, len(HEADERS) + 1):
        ws.cell(row=r, column=c).border = Border(left=thin, right=thin, top=thin, bottom=thin)
for col, width in zip("ABCDEF", (24, 18, 15, 18, 15, 10)):
    ws.column_dimensions[col].width = width
ws.freeze_panes = "A4"
wb.save(OUT)
print(f"wrote {OUT}\n")

# --------------------------------------------------------------- the pipeline
sys.path.insert(0, os.path.join(ROOT, "Backend"))
from services.excel_service import parse_order_excel  # noqa: E402


def slice_source(path, start, end):
    src = open(path, encoding="utf-8").read()
    return src[src.index(start):src.index(end)]


ia = {"re": re}
exec(slice_source(os.path.join(ROOT, "Backend", "services", "illustrator_automation.py"),
                  "_FRIENDLY_SIZE_MAP = {", "def pattern_files_needed"), ia)
from typing import Optional  # noqa: E402
mn = {"re": re, "Optional": Optional}
exec(slice_source(os.path.join(ROOT, "Backend", "main.py"),
                  "_SIZE_SEQUENCE = [", "def _sort_size_groups"), mn)
friendly, youth_file, aliases = ia["_friendly_size"], ia["is_youth_pattern_size"], ia["_size_aliases"]
size_rank = mn["_size_rank"]

parsed = parse_order_excel(open(OUT, "rb").read())
orders = parsed.get("orders") or parsed.get("raw_orders") or []

print("STEP 1 - what the parser read out of the sheet")
print(f"  {len(ROWS)} rows -> {len(orders)} print groups (identical prints merge)\n")

print("STEP 2 - every distinct size cell, and what it becomes")
print(f"  {'Excel cell':<22}{'label':<10}{'pattern file':<14}{'tag box':<9}rows")
seen = {}
for o in orders:
    seen.setdefault(o["size"], 0)
    seen[o["size"]] += o.get("quantity", 1)
for cell in sorted(seen, key=size_rank):
    label = friendly(cell)
    is_y = youth_file(label)
    print(f"  {cell!r:<22}{label:<10}{'youth.ai' if is_y else 'adult.ai':<14}"
          f"{'2.5in' if is_y else '3in':<9}{seen[cell]}")

print("\nSTEP 3 - plan order (this is the order pieces are laid out in the .ai)")
groups = sorted(seen, key=size_rank)
print("  " + "  ->  ".join(friendly(c) for c in groups))
files = sorted({("youth.ai" if youth_file(friendly(c)) else "adult.ai") for c in groups})
runs, last = [], None
for c in groups:
    f = "youth.ai" if youth_file(friendly(c)) else "adult.ai"
    if f != last:
        runs.append(f)
        last = f
print(f"  pattern files opened: {' -> '.join(runs)}   (each exactly once: "
      f"{'YES' if len(runs) == len(set(runs)) else 'NO - it reopens'})")

print("\nSTEP 4 - the exact panel names the job will look for, in order")
PARTS = ["Front", "Back", "Short Sleeve", "Neck"]
for cell in groups:
    label = friendly(cell)
    if not label.startswith("W-"):
        continue
    print(f"\n  {label}  ({'youth.ai' if youth_file(label) else 'adult.ai'})")
    for part in PARTS[:1]:
        names = [a + " " + part for a in aliases(label)]
        print(f"    {part}:")
        for i, n in enumerate(names, 1):
            print(f"      {i:>2}. {n}")

print("\nSTEP 5 - what the upload form will insist on")
need_adult = any(not youth_file(friendly(c)) for c in groups)
need_youth = any(youth_file(friendly(c)) for c in groups)
print(f"  Adult Pattern: {'REQUIRED' if need_adult else 'not needed'}")
print(f"  Youth Pattern: {'REQUIRED' if need_youth else 'not needed'}")

# The panel names a designer has to actually create, one per size per part.
wanted = []
for cell in groups:
    label = friendly(cell)
    for part in PARTS:
        wanted.append((("youth" if youth_file(label) else "adult"), label + " " + part))
with open(os.path.join(HERE, "panels_wanted.txt"), "w", encoding="utf-8") as fh:
    for doc, name in wanted:
        fh.write(f"{doc}\t{name}\n")
print(f"\n  {len(wanted)} panel names written to panels_wanted.txt "
      f"(for the Illustrator step)")
