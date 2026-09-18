"""Export one named panel of an order document as a CMYK 300dpi JPEG.

Picks the artboard BY NAME rather than by index. The index is not stable: the
same file showed one artboard when the operator had the others deleted in an
unsaved session, and three when read from disk, so "artboard 0" silently
exported the Front when the Back was asked for.

Runs the shipped exportJpegViaAction out of automate_production.jsx - the same
function the job uses - rather than a copy.

Usage: export_panel_cmyk.py <order.ai> <out-dir> <panel-name-fragment> [outname]
"""
import os
import sys

import win32com.client
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

JSX = os.path.join(os.path.dirname(__file__), "..", "automate_production.jsx")
AI = sys.argv[1]
OUT_DIR = sys.argv[2]
PANEL = sys.argv[3]
NAME = sys.argv[4] if len(sys.argv) > 4 else PANEL.replace(" ", "_")


def extract(src, fname):
    start = src.index("function " + fname + "(")
    i, depth, j = src.index("{", start), 0, src.index("{", start)
    while j < len(src):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                return src[start:j + 1]
        j += 1
    raise SystemExit("could not brace-match " + fname)


fn = extract(open(JSX, encoding="utf-8", errors="replace").read(), "exportJpegViaAction")
os.makedirs(OUT_DIR, exist_ok=True)

app = win32com.client.GetActiveObject("Illustrator.Application")

js = """
(function () {
    var LOG = [];
    function log(m) { LOG.push(String(m)); }
    var EXPORT_DPI = 300;

    %FN%

    var doc = null;
    for (var i = 0; i < app.documents.length; i++)
        if (app.documents[i].fullName.fsName === "%AI%") doc = app.documents[i];
    if (!doc) doc = app.open(new File("%AI%"));
    doc.activate();

    var out = ["artboards=" + doc.artboards.length];
    var idx = -1;
    for (var a = 0; a < doc.artboards.length; a++) {
        var r = doc.artboards[a].artboardRect;
        var nm = doc.artboards[a].name;
        out.push("  [" + a + "] '" + nm + "'  " +
                 Math.round((r[2] - r[0]) * 300 / 72) + "x" + Math.round((r[1] - r[3]) * 300 / 72) + "px");
        if (idx < 0 && nm.toLowerCase().indexOf("%PANEL%".toLowerCase()) !== -1) idx = a;
    }
    if (idx < 0) return out.join("\\n") + "\\nPANEL NOT FOUND: %PANEL%";
    out.push("chosen: [" + idx + "] '" + doc.artboards[idx].name + "'");

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    doc.artboards.setActiveArtboardIndex(idx);
    var folder = "%OUT_DIR%";
    var f = new Folder(folder); if (!f.exists) f.create();
    var target = folder + "/%NAME%.jpg";
    var t = new Date().getTime();
    var ok = exportJpegViaAction(doc, idx, folder, "%NAME%", target);
    out.push("export=" + ok + "  " + ((new Date().getTime() - t) / 1000) + "s");
    app.userInteractionLevel = prevUI;
    if (LOG.length) out.push("log: " + LOG.join(" | "));
    return out.join("\\n");
})();
""".replace("%FN%", fn) \
   .replace("%AI%", AI.replace("\\", "\\\\")) \
   .replace("%OUT_DIR%", OUT_DIR.replace("\\", "/")) \
   .replace("%PANEL%", PANEL) \
   .replace("%NAME%", NAME)

print(app.DoJavaScript(js))

target = os.path.join(OUT_DIR, NAME + ".jpg")
print("\n--- file ---")
if not os.path.exists(target):
    print(f"  MISSING: {target}")
    sys.exit(1)
im = Image.open(target)
print(f"  {target}")
print(f"  mode={im.mode}  {im.width}x{im.height}  {os.path.getsize(target)/1e6:.1f}MB")
print(f"  {'CMYK OK' if im.mode == 'CMYK' else '*** NOT CMYK ***'}   "
      f"{im.width * 72 / (im.width * 72 / 300):.0f} dpi equivalent"
      if im.mode == "CMYK" else "")
