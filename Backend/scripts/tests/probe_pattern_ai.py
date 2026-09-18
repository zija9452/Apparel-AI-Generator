"""Runs the REAL lookup chain against the REAL .ai files, inside Illustrator.

The size functions are cut straight out of the shipped automate_production.jsx
and injected, so this is the chain the render uses - not a reimplementation. The
name index is built with findAnywhere's own key (lowercase, every non-alphanumeric
dropped) over the actual GroupItems in the open documents.

Every size in Womens_Order_Test.xlsx is looked up for every part it would need,
and the report says WHICH spelling matched - the canonical one, or the alias that
saved it.
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
ADULT = os.path.join(HERE, "TEST_Pattern_Adult.ai").replace(os.sep, "/")
YOUTH = os.path.join(HERE, "TEST_Pattern_Youth.ai").replace(os.sep, "/")

CELLS = ["Women Large", "women large", "W-L", "Women's Medium", "W M", "Ladies M",
         "W-XS", "Women Adult 2XL", "W-YM", "Women Youth Large",
         "Youth Women Small", "W-YXXS", "Large", "YXS"]
PARTS = ["Front", "Back", "Short Sleeve"]


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

harness = REAL + r"""
function key(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function buildIndex(doc) {
    app.activeDocument = doc;              // DOM reads on a non-active doc are ~125ms each
    var ix = {};
    for (var i = 0; i < doc.groupItems.length; i++) {
        var g = doc.groupItems[i];
        if (!ix[key(g.name)]) ix[key(g.name)] = g.name;
    }
    return ix;
}
function openOnce(path) {
    for (var d = 0; d < app.documents.length; d++) {
        if (app.documents[d].fullName && String(app.documents[d].fullName.fsName).replace(/\\/g, "/") === path) {
            return app.documents[d];        // already open - NEVER reopen or close it
        }
    }
    return app.open(new File(path));
}
var adultDoc = openOnce(__ADULT__);
var youthDoc = openOnce(__YOUTH__);
var IX = { adult: buildIndex(adultDoc), youth: buildIndex(youthDoc) };
var CELLS = __CELLS__, PARTS = __PARTS__;
var out = [];
for (var c = 0; c < CELLS.length; c++) {
    var cell = CELLS[c];
    var label = getFriendlySize(cell);
    var which = isYouthPatternSize(label) ? "youth" : "adult";
    var ix = IX[which];
    for (var p = 0; p < PARTS.length; p++) {
        var sizes = sizeAliases(label), parts = partLabelAliases(PARTS[p]);
        var hit = "", tried = 0, viaSize = "", viaPart = "";
        for (var pi = 0; pi < parts.length && !hit; pi++) {
            for (var si = 0; si < sizes.length && !hit; si++) {
                tried++;
                var probe = sizes[si] + " " + parts[pi];
                if (ix[key(probe)]) { hit = ix[key(probe)]; viaSize = sizes[si]; viaPart = parts[pi]; }
            }
        }
        out.push([cell, label, which, PARTS[p], hit, tried,
                  (hit === label + " " + PARTS[p]) ? "canonical" : (hit ? "alias #" + tried : "")].join("\t"));
    }
}
out.join("\n");
"""
harness = (harness.replace("__ADULT__", repr(ADULT).replace("'", '"'))
                  .replace("__YOUTH__", repr(YOUTH).replace("'", '"'))
                  .replace("__CELLS__", "[" + ",".join('"%s"' % c for c in CELLS) + "]")
                  .replace("__PARTS__", "[" + ",".join('"%s"' % p for p in PARTS) + "]"))
harness = 'try {\n' + harness + '\n} catch (e) { "JSX ERROR: " + e.message + " line " + e.line; }'

pythoncom.CoInitialize()
app = None
for pid in ["Illustrator.Application.CC.2015", "Illustrator.Application"]:
    try:
        app = win32com.client.GetActiveObject(pid)
        break
    except Exception:
        pass
if app is None:
    print("Illustrator is not running")
    sys.exit(2)

raw = str(app.DoJavaScript(harness))
if raw.startswith("JSX ERROR"):
    print(raw)
    sys.exit(1)

rows = [line.split("\t") for line in raw.splitlines() if line.strip()]
print(f"{'Excel cell':<20}{'label':<9}{'.ai':<7}{'part':<14}{'matched group name':<30}{'probes':<8}how")
print("-" * 100)
missing = 0
for cell, label, which, part, hit, tried, how in rows:
    if not hit:
        missing += 1
        hit, how = "-- NOT FOUND --", "job PAUSES here"
    print(f"{cell:<20}{label:<9}{which:<7}{part:<14}{hit:<30}{tried:<8}{how}")
print("-" * 100)
print(f"{len(rows) - missing}/{len(rows)} lookups resolved against the real .ai files")
