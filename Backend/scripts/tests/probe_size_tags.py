"""Would renameSizeTags find each piece's size tag? Read-only, on the real .ai.

renameSizeTags decides in three steps: the tag text equals the size label, or it
is in that size's own SIZE_ALIAS_GROUPS entry, or it is in the global
RENAME_SIZE_WORDS list. This runs the SAME three tests against the SAME text
frames in the open documents - but never writes, so the saved files stay clean.

A tag that matches none of the three is not an error: the run logs "no '<size>'
tag text found to update" and the piece keeps whatever text it was drawn with,
which is how a stale sample size ends up printed under the new tag box.
"""
import os
import sys

import pythoncom
import win32com.client

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))   # Backend/scripts/tests -> repo root
JSX = open(os.path.join(ROOT, "Backend", "scripts", "automate_production.jsx"), encoding="utf-8").read()
ADULT = os.path.join(HERE, "TEST_Pattern_Adult.ai").replace(os.sep, "/")
YOUTH = os.path.join(HERE, "TEST_Pattern_Youth.ai").replace(os.sep, "/")


def pull(name, kind="function"):
    at = JSX.index(("function " + name + "(") if kind == "function" else ("var " + name + " = ["))
    op, cl = ("{", "}") if kind == "function" else ("[", "]")
    depth = 0
    for j in range(JSX.index(op, at), len(JSX)):
        if JSX[j] == op:
            depth += 1
        elif JSX[j] == cl:
            depth -= 1
            if depth == 0:
                return JSX[at:j + 1] + ("" if kind == "function" else ";")
    raise RuntimeError("unbalanced " + name)


REAL = "\n".join([pull(n) for n in ["sizeCodes", "sizeWords", "womenHeads", "womenSize",
                                    "getFriendlySize", "normalizeSizeWord", "sizeAliasesFor"]]
                 + [pull("SIZE_ALIAS_GROUPS", "var"), pull("RENAME_SIZE_WORDS", "var")])

harness = REAL + r"""
function openOnce(path) {
    for (var d = 0; d < app.documents.length; d++) {
        if (app.documents[d].fullName && String(app.documents[d].fullName.fsName).replace(/\\/g, "/") === path) return app.documents[d];
    }
    return app.open(new File(path));
}
// Mirrors the FOUR tests inside renameSizeTags' recurse(), in the same order.
// Keep in step with that function - this is a copy, and a copy that drifts
// reports a pass the run does not actually give you.
function verdict(tagText, sizeLabel) {
    var c = normalizeSizeWord(tagText), want = normalizeSizeWord(sizeLabel);
    if (c === want) return "exact";
    var aliases = sizeAliasesFor(want);
    if (aliases) { for (var a = 0; a < aliases.length; a++) if (c === aliases[a]) return "scoped group"; }
    try { if (normalizeSizeWord(getFriendlySize(tagText)) === want) return "parser"; } catch (eF) {}
    for (var w = 0; w < RENAME_SIZE_WORDS.length; w++) if (c === RENAME_SIZE_WORDS[w]) return "global list";
    return "NO MATCH";
}
var out = [];
var docs = [openOnce(__ADULT__), openOnce(__YOUTH__)];
for (var d = 0; d < docs.length; d++) {
    app.activeDocument = docs[d];
    var doc = docs[d];
    for (var i = 0; i < doc.groupItems.length; i++) {
        var g = doc.groupItems[i], tag = "";
        for (var t = 0; t < g.textFrames.length && !tag; t++) tag = g.textFrames[t].contents;
        // The size the ORDER is for - what the panel name starts with, resolved
        // the way the run resolves the Excel cell.
        var parts = g.name.split(" "), label = "";
        for (var k = parts.length - 1; k > 0 && !label; k--) {
            var cand = getFriendlySize(parts.slice(0, k).join(" "));
            if (cand !== parts.slice(0, k).join(" ")) label = cand;
        }
        if (!label) label = getFriendlySize(parts[0]);
        out.push([g.name, tag, label, verdict(tag, label)].join("\t"));
    }
}
out.join("\n");
"""
harness = (harness.replace("__ADULT__", '"%s"' % ADULT).replace("__YOUTH__", '"%s"' % YOUTH))
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
print(f"{'group name':<30}{'tag text':<22}{'size':<9}renamed?")
print("-" * 82)
bad = 0
for name, tag, label, how in rows:
    if how == "NO MATCH":
        bad += 1
    print(f"{name:<30}{tag:<22}{label:<9}{how}")
print("-" * 82)
print(f"{len(rows) - bad}/{len(rows)} size tags would be renamed")
