"""End-to-end: run the SHIPPED exportJpegViaAction against a real order .ai.

Extracts the function out of scripts/automate_production.jsx by brace matching
and evals that text in Illustrator - the same approach test_jsx.js uses, and for
the same reason: a copied-out version drifts, and then the test passes while the
file Illustrator actually runs is broken.

Checks what the job depends on and the earlier probes could not:
  * the file lands at the EXACT target name (Illustrator appends the artboard
    name to what you ask for; the function is supposed to undo that)
  * the result is CMYK, not RGB
  * the temp folder and the .aia are cleaned up
  * a second call over the same target overwrites instead of failing
"""
import os
import sys

import win32com.client
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

JSX = os.path.join(os.path.dirname(__file__), "..", "automate_production.jsx")
# Defaults are the 5XL bench file; pass a path to re-run against a real job's
# order document, which is what exposed the 72dpi/RGB regression that the
# bench file did not.
AI = sys.argv[1] if len(sys.argv) > 1 else \
    r"E:\5XL-TESTING_WITH_JPEGS\5XL-TESTING_WITH_JPEGS\production_ready_order_5XL.ai"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else r"E:\seam_test\e2e"
NAME = sys.argv[3] if len(sys.argv) > 3 else "5XL2"
ARTBOARD_IDX = int(sys.argv[4]) if len(sys.argv) > 4 else 0


def extract(src, fname):
    start = src.index("function " + fname + "(")
    i = src.index("{", start)
    depth, j = 0, i
    while j < len(src):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                return src[start:j + 1]
        j += 1
    raise SystemExit("could not brace-match " + fname)


src = open(JSX, encoding="utf-8", errors="replace").read()
fn = extract(src, "exportJpegViaAction")
print(f"extracted exportJpegViaAction: {len(fn)} chars from the shipped .jsx")

app = win32com.client.GetActiveObject("Illustrator.Application")

js = """
(function () {
    var LOG = [];
    function log(m) { LOG.push(String(m)); }
    var EXPORT_DPI = 300;

    %FN%

    var doc = null;
    for (var i = 0; i < app.documents.length; i++)
        if (app.documents[i].name.indexOf("production_ready_order") !== -1) doc = app.documents[i];
    if (!doc) doc = app.open(new File("%AI%"));
    doc.activate();

    var folder = "%OUT_DIR%";
    var f = new Folder(folder); if (!f.exists) f.create();
    var target = folder + "/%NAME%.jpg";

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    var t1 = new Date().getTime();
    var ok1 = exportJpegViaAction(doc, %IDX%, folder, "%NAME%", target);
    var d1 = (new Date().getTime() - t1) / 1000;

    // second run over the same target - the overwrite path
    var t2 = new Date().getTime();
    var ok2 = exportJpegViaAction(doc, %IDX%, folder, "%NAME%", target);
    var d2 = (new Date().getTime() - t2) / 1000;

    app.userInteractionLevel = prevUI;

    var leftovers = [];
    var tmp = new Folder(folder + "/.jpg_cmyk_tmp");
    if (tmp.exists) leftovers.push("temp folder still present");
    var aia = new File(Folder.temp + "/aiapparel_set.aia");
    if (aia.exists) leftovers.push(".aia still present");

    return "run1=" + ok1 + " (" + d1 + "s)\\nrun2=" + ok2 + " (" + d2 + "s)" +
           "\\nleftovers=" + (leftovers.length ? leftovers.join(", ") : "none") +
           "\\nlog=" + (LOG.length ? LOG.join(" | ") : "(silent)");
})();
""".replace("%FN%", fn) \
   .replace("%AI%", AI.replace("\\", "\\\\")) \
   .replace("%OUT_DIR%", OUT_DIR.replace("\\", "/")) \
   .replace("%NAME%", NAME) \
   .replace("%IDX%", str(ARTBOARD_IDX))

print(app.DoJavaScript(js))

target = os.path.join(OUT_DIR, NAME + ".jpg")
print("\n--- checks ---")
fails = 0
if not os.path.exists(target):
    print(f"FAIL  exact filename: {target} does not exist")
    print("      files present:", os.listdir(OUT_DIR) if os.path.isdir(OUT_DIR) else "(no folder)")
    fails += 1
else:
    im = Image.open(target)
    print(f"PASS  exact filename: {NAME}.jpg  ({os.path.getsize(target)/1e6:.1f}MB)")
    print(f"{'PASS' if im.mode == 'CMYK' else 'FAIL'}  colour space: {im.mode}")
    fails += im.mode != "CMYK"
    print(f"      size={im.width}x{im.height}")
    extra = [f for f in os.listdir(OUT_DIR) if f != NAME + ".jpg"]
    print(f"{'PASS' if not extra else 'FAIL'}  no stray files: {extra or 'none'}")
    fails += bool(extra)

sys.exit(1 if fails else 0)
