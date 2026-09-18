"""EVERY size family x EVERY part, on real .ai files, through the real chain.

Not just the women's ladder: adult XS-5XL, youth YXS-YXL, toddler 1T-10T, infant
months 1M-12M, the women's adult and youth codes, and the Universal accessories -
crossed with every part the job can ask for, including the full-button and hood
pieces and the abbreviations.

Two documents are built with the CANONICAL name for every panel, then every
plausible Excel spelling of every size is looked up against them. A miss here is
a real miss: the panel exists under its documented name and the chain failed to
reach it.
"""
import os
import re
import sys

import pythoncom
import win32com.client

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))   # Backend/scripts/tests -> repo root
JSX = open(os.path.join(ROOT, "Backend", "scripts", "automate_production.jsx"), encoding="utf-8").read()
ADULT = os.path.join(HERE, "MATRIX_Adult.ai").replace(os.sep, "/")
YOUTH = os.path.join(HERE, "MATRIX_Youth.ai").replace(os.sep, "/")

ADULT_SIZES = ["XS", "Small", "Medium", "Large", "XL", "2XL", "3XL", "4XL",
               "W-XS", "W-S", "W-M", "W-L", "W-XL", "W-2XL"]
YOUTH_SIZES = ["YXS", "YS", "YM", "YL", "YXL",
               "W-YXXS", "W-YXS", "W-YS", "W-YM", "W-YL", "W-YXL",
               "1T", "4T", "10T", "1M", "6M", "12M"]
# Per-size parts. Universal accessories carry no size and are added separately.
PARTS = ["Front", "Back", "Neck", "Short Sleeve", "Long Sleeve",
         "Right Sleeve", "Left Sleeve", "Rib & Cuff",
         "Front Left", "Front Right", "Patti", "Hood", "Border", "Pocket"]
ACCESSORIES = ["Placket", "Twill Tape", "Tukdi"]

# Every spelling of a size an order sheet realistically carries, per canonical
# label. These are INPUTS to getFriendlySize, not panel names.
CELLS = {
    "XS": ["XS", "xs", "X-Small", "XSmall", "Extra Small", "Adult XS", "AXS"],
    "Small": ["S", "Small", "small", "Adult Small", "Adult S", "AS"],
    "Medium": ["M", "Med", "Medium", "MEDIUM", "Adult Med", "Adult M", "AM"],
    "Large": ["L", "Lg", "Large", "Adult Large", "Adult L", "AL"],
    "XL": ["XL", "XLarge", "X-Large", "Extra Large", "Adult XL", "AXL"],
    "2XL": ["2XL", "XXL", "XX-Large", "XXLarge", "2X-Large", "Adult 2XL", "A2XL", "AXXL"],
    "3XL": ["3XL", "XXXL", "XXXLarge", "Adult 3XL", "A3XL"],
    "4XL": ["4XL", "XXXXL", "4XLarge", "Adult 4XL", "A4XL"],
    "YXS": ["YXS", "Youth XS", "youth-xs", "YOUTH  XS"],
    "YS": ["YS", "Youth S", "Youth Small"],
    "YM": ["YM", "Youth M", "Youth Med", "Youth Medium"],
    "YL": ["YL", "Youth L", "Youth Large", "Youth Lg"],
    "YXL": ["YXL", "Youth XL", "Youth XLarge", "Youth X-Large"],
    "1T": ["1T", "Toddler 1", "Toddler 1T", "1 Toddler"],
    "4T": ["4T", "Toddler 4", "Toddler 4T", "4 Toddler"],
    "10T": ["10T", "Toddler 10", "Toddler 10T"],
    "1M": ["1M", "1 Month", "Month 1", "Infant 1M", "1MO"],
    "6M": ["6M", "6 Months", "Month 6", "Infant 6M", "6MO", "Baby 6"],
    "12M": ["12M", "12 Months", "Month 12", "Infant 12M"],
    "W-XS": ["W-XS", "W XS", "WXS", "Women XS", "Womens XS", "Women's XS", "Ladies XS",
             "Women Adult XS", "Adult Women XS", "Women X-Small"],
    "W-S": ["W-S", "WS", "Women S", "Women Small", "Womens Small", "Women's S",
            "Ladies Small", "W Small", "Women Adult S", "Adult Women Small"],
    "W-M": ["W-M", "W M", "WM", "W.M", "Women M", "Women Medium", "Women Med",
            "Womens Medium", "Women's M", "Ladies M", "W Med", "Women Adult Medium",
            "Adult Women M", "Adult Womens Medium"],
    "W-L": ["W-L", "W L", "WL", "W_L", "Women L", "Women Large", "women large",
            "Womens Large", "Women's Large", "Ladies L", "W Lg", "W Large",
            "Women Adult Large", "Adult Women L"],
    "W-XL": ["W-XL", "WXL", "Women XL", "Women X-Large", "W XLarge", "Ladies XL",
             "Women Adult XL", "Adult Women XL"],
    "W-2XL": ["W-2XL", "W2XL", "WXXL", "W-XXL", "Women 2XL", "Women XXL",
              "Women XXLarge", "Women Adult 2XL", "Adult Women XXL"],
    "W-YXXS": ["W-YXXS", "WYXXS", "Women YXXS", "Women Youth XXS", "Youth Women XXS",
               "W Youth XXS", "Womens Youth XXS"],
    "W-YXS": ["W-YXS", "WYXS", "Women YXS", "Women Youth XS", "Youth Women XS"],
    "W-YS": ["W-YS", "WYS", "Women YS", "Women Youth S", "Women Youth Small",
             "Youth Women Small", "W Youth S"],
    "W-YM": ["W-YM", "WYM", "Women YM", "Women Youth M", "Women Youth Medium",
             "Womens Youth Medium", "Youth Women M", "W Youth Med", "Ladies Youth M"],
    "W-YL": ["W-YL", "WYL", "Women YL", "Women Youth Large", "Youth Women Large",
             "Womens Youth L", "W Youth Lg"],
    "W-YXL": ["W-YXL", "WYXL", "Women YXL", "Women Youth XL", "Women Youth X-Large",
              "Youth Women XL"],
}


def pull(name):
    at = JSX.index("function " + name + "(")
    depth = 0
    for j in range(JSX.index("{", at), len(JSX)):
        if JSX[j] == "{":
            depth += 1
        elif JSX[j] == "}":
            depth -= 1
            if depth == 0:
                return JSX[at:j + 1]
    raise RuntimeError("unbalanced " + name)


REAL = "\n".join(pull(n) for n in [
    "sizeCodes", "sizeWords", "womenHeads", "womenSize", "womenAliases",
    "getFriendlySize", "sizeAliases", "isYouthPatternSize", "partLabelAliases"])


def build_jsx(sizes, path):
    names = [f"{s} {p}" for s in sizes for p in PARTS]
    if path == ADULT:
        names += ACCESSORIES                       # Universal: no size prefix
    body = ["var doc = app.documents.add(DocumentColorSpace.CMYK, 4000, 4000);"]
    for i, name in enumerate(names):
        col, row = i % 20, i // 20
        body += [
            f'var g{i} = doc.groupItems.add(); g{i}.name = {name!r};',
            f'var p{i} = doc.pathItems.rectangle({3960 - row * 90}, {20 + col * 190}, 170, 70);',
            f'p{i}.filled = false; p{i}.stroked = true; p{i}.moveToBeginning(g{i});',
        ]
    body += [f'var f = new File("{path}"); doc.saveAs(f, new IllustratorSaveOptions());',
             'var n = doc.groupItems.length; doc.close(SaveOptions.SAVECHANGES); n;']
    return ("try {\n" + "\n".join(body) + "\n} catch (e) { "
            '"JSX ERROR: " + e.message + " line " + e.line; }')


probe = REAL + r"""
function key(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function openOnce(path) {
    for (var d = 0; d < app.documents.length; d++) {
        if (app.documents[d].fullName && String(app.documents[d].fullName.fsName).replace(/\\/g, "/") === path) return app.documents[d];
    }
    return app.open(new File(path));
}
function buildIndex(doc) {
    app.activeDocument = doc;
    var ix = {};
    for (var i = 0; i < doc.groupItems.length; i++) if (!ix[key(doc.groupItems[i].name)]) ix[key(doc.groupItems[i].name)] = doc.groupItems[i].name;
    return ix;
}
var IX = { adult: buildIndex(openOnce(__ADULT__)), youth: buildIndex(openOnce(__YOUTH__)) };
var JOB = __JOB__, PARTS = __PARTS__, ACC = __ACC__;
var out = [], worst = 0;
for (var j = 0; j < JOB.length; j++) {
    var cell = JOB[j][0], expect = JOB[j][1];
    var label = getFriendlySize(cell);
    if (label !== expect) { out.push([cell, expect, label, "-", "WRONG LABEL", 0].join("\t")); continue; }
    var which = isYouthPatternSize(label) ? "youth" : "adult";
    for (var p = 0; p < PARTS.length; p++) {
        var sizes = sizeAliases(label), parts = partLabelAliases(PARTS[p]);
        var hit = "", tried = 0;
        for (var pi = 0; pi < parts.length && !hit; pi++)
            for (var si = 0; si < sizes.length && !hit; si++) {
                tried++;
                if (IX[which][key(sizes[si] + " " + parts[pi])]) hit = IX[which][key(sizes[si] + " " + parts[pi])];
            }
        if (tried > worst) worst = tried;
        if (!hit) out.push([cell, expect, label, PARTS[p], "NOT FOUND", tried].join("\t"));
    }
}
// Universal accessories: no size, looked up by the bare part name in either doc.
for (var a = 0; a < ACC.length; a++) {
    if (!IX.adult[key(ACC[a])] && !IX.youth[key(ACC[a])]) out.push(["-", "-", "Universal", ACC[a], "NOT FOUND", 1].join("\t"));
}
"WORST=" + worst + "\n" + out.join("\n");
"""

pythoncom.CoInitialize()
app = None
for pid in ["Illustrator.Application.CC.2015", "Illustrator.Application"]:
    try:
        app = win32com.client.GetActiveObject(pid)
        break
    except Exception:
        pass
if app is None:
    app = win32com.client.Dispatch("Illustrator.Application.CC.2015")

for sizes, path, tag in ((ADULT_SIZES, ADULT, "adult"), (YOUTH_SIZES, YOUTH, "youth")):
    if os.path.exists(path):
        os.remove(path)
    r = app.DoJavaScript(build_jsx(sizes, path))
    print(f"built {tag}: {r} groups  ({len(sizes)} sizes x {len(PARTS)} parts"
          f"{' + 3 accessories' if tag == 'adult' else ''})")

job = [(cell, label) for label, cells in CELLS.items() for cell in cells]
probe = (probe.replace("__ADULT__", '"%s"' % ADULT).replace("__YOUTH__", '"%s"' % YOUTH)
              .replace("__JOB__", "[" + ",".join('["%s","%s"]' % (c.replace('"', '\\"'), l) for c, l in job) + "]")
              .replace("__PARTS__", "[" + ",".join('"%s"' % p for p in PARTS) + "]")
              .replace("__ACC__", "[" + ",".join('"%s"' % a for a in ACCESSORIES) + "]"))
probe = 'try {\n' + probe + '\n} catch (e) { "JSX ERROR: " + e.message + " line " + e.line; }'

raw = str(app.DoJavaScript(probe))
if raw.startswith("JSX ERROR"):
    print(raw)
    sys.exit(1)

lines = raw.splitlines()
worst = lines[0].replace("WORST=", "")
problems = [l.split("\t") for l in lines[1:] if l.strip()]
total = len(job) * len(PARTS) + len(ACCESSORIES)
print(f"\n{len(job)} Excel spellings x {len(PARTS)} parts + {len(ACCESSORIES)} accessories "
      f"= {total} lookups")
print(f"worst-case probes for one hit: {worst}")
if problems:
    print(f"\n{len(problems)} PROBLEM(S):")
    print(f"  {'Excel cell':<24}{'expected':<9}{'got':<9}{'part':<14}{'why':<12}probes")
    for cell, expect, label, part, why, tried in problems[:40]:
        print(f"  {cell:<24}{expect:<9}{label:<9}{part:<14}{why:<12}{tried}")
else:
    print("\nno problems: every spelling of every size found every part it asked for")
print(f"\n{total - len(problems)}/{total} resolved")
