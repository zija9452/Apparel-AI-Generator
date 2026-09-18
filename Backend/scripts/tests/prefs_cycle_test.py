"""Quit Illustrator, write JPEG export prefs, restart, export, report.

ColorModel is already proved to work: the file said RGB and an otherwise-CMYK
machine produced RGB. Resolution is the open question - /DPI 300.0 coincided
with 300dpi exports, but writing 150.0 produced 72dpi, which is neither. Two
readings fit: /DPI is the JPEG resolution and 150.0 was rejected back to the
72 default, or /DPI is unrelated and 300 was a coincidence.

Setting it back to 300.0 separates them. 300dpi out means the key works and the
whole mechanism is settled; 72dpi out means the resolution lives somewhere this
file does not show.

Illustrator is quit and restarted here, so it must have NOTHING open - it
rewrites the prefs on quit, which would undo the edit, and closing someone's
unsaved document is not recoverable.

Usage: prefs_cycle_test.py [colorModel] [dpi]
"""
import os
import re
import subprocess
import sys
import time

import win32com.client
from PIL import Image

PREFS = r"C:\Users\scb\AppData\Roaming\Adobe\Adobe Illustrator 19 Settings\en_US\x64\Adobe Illustrator Prefs"
EXE = r"C:\Program Files\Adobe\Adobe Illustrator CC 2015\Support Files\Contents\Windows\Illustrator.exe"
OUT = r"E:\seam_test\prefs_cycle"

COLOR_MODEL = int(sys.argv[1]) if len(sys.argv) > 1 else 2      # 2 = CMYK
DPI = float(sys.argv[2]) if len(sys.argv) > 2 else 300.0

BLOB = ("06000000" "01000000" "03000000" "02000000" "00002c01"
        "02000000" "02000000" "02000000"
        "69006d0061006700" "65006d0061007000" + "00000000" * 12 + "00000100")


def running():
    r = subprocess.run(["tasklist", "/FI", "IMAGENAME eq Illustrator.exe"],
                       capture_output=True, text=True)
    return "Illustrator.exe" in r.stdout


def open_docs():
    try:
        app = win32com.client.GetActiveObject("Illustrator.Application")
        return int(app.DoJavaScript("app.documents.length;"))
    except Exception:
        return 0


if running():
    n = open_docs()
    if n:
        sys.exit(f"Illustrator has {n} document(s) open - close them first, "
                 "this script must quit the app and will not risk unsaved work.")
    print("quitting Illustrator (nothing open)...")
    try:
        win32com.client.GetActiveObject("Illustrator.Application").Quit()
    except Exception:
        pass
    for _ in range(40):
        if not running():
            break
        time.sleep(1)
    if running():
        subprocess.run(["taskkill", "/IM", "Illustrator.exe", "/F"], capture_output=True)
        time.sleep(3)
print("Illustrator is closed")

# Patch ONLY the JPEGFormat block's ColorModel - /plugin/TIFFFileFormat has a
# key with the same leaf name and patching that one does nothing visible.
txt = open(PREFS, encoding="utf-8", errors="replace").read()
block = re.search(r"/JPEGFormat \{.*?\n\t\}", txt, re.S)
if not block:
    sys.exit("could not find the /JPEGFormat block in the prefs file")
patched_block = re.sub(r"(/ColorModel )\d+", r"\g<1>" + str(COLOR_MODEL), block.group(0))
txt = txt[:block.start()] + patched_block + txt[block.end():]
txt = re.sub(r"^/DPI [\d.]+", f"/DPI {DPI:.1f}", txt, count=1, flags=re.M)
open(PREFS, "w", encoding="utf-8", newline="").write(txt)
print(f"wrote JPEGFormat/ColorModel={COLOR_MODEL}, DPI={DPI}")

os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

print("starting Illustrator...")
subprocess.Popen([EXE])
app = None
for _ in range(90):
    time.sleep(2)
    try:
        app = win32com.client.GetActiveObject("Illustrator.Application")
        app.DoJavaScript("1;")
        break
    except Exception:
        app = None
if app is None:
    sys.exit("Illustrator did not answer COM")
print("Illustrator up")

js = r"""
(function () {
    var OUT = "%OUT%";
    var out = ["session loaded ColorModel=" +
               app.preferences.getIntegerPreference("plugin/JPEGFormat/ColorModel") +
               " DPI=" + app.preferences.getRealPreference("DPI")];
    function toHex2(n) { return ("0" + n.toString(16)).slice(-2); }
    function hexStr(s) { var o = ""; for (var i = 0; i < s.length; i++) o += toHex2(s.charCodeAt(i)); return o; }
    function strParam(s) { var h = hexStr(s); return "[ " + (h.length / 2) + " " + h + " ]"; }

    var doc = app.documents.add(DocumentColorSpace.CMYK, 200, 200);
    var r = doc.pathItems.rectangle(180, 20, 160, 160);
    var c = new CMYKColor(); c.cyan = 0; c.magenta = 90; c.yellow = 10; c.black = 0;
    r.filled = true; r.fillColor = c; r.stroked = false;

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    var outPath = OUT + "\\cycle.jpg";
    var aia = "/version 3/name " + strParam("cy_set") + "/isOpen        0/actionCount   1" +
        "/action-1 {/name " + strParam("cy_act") + "/keyIndex    1/colorIndex  0" +
        "/isOpen      1/eventCount  1/event-1 {/useRulersIn1stQuadrant 0" +
        "/internalName (adobe_exportDocument)/localizedName [ 9 4578706f7274204173 ]" +
        "/isOpen          0/isOn            1/hasDialog       1/showDialog      0/parameterCount  7" +
        "/parameter-1 {/key 1885434477/showInPalette 0/type (raw)/value < 100 %BLOB%>/size 100}" +
        "/parameter-2 {/key 1851878757/showInPalette 4294967295/type (ustring)/value " + strParam(outPath) + "}" +
        "/parameter-3 {/key 1718775156/showInPalette 4294967295/type (ustring)/value [ 16 4a5045472066696c6520666f726d6174 ]}" +
        "/parameter-4 {/key 1702392942/showInPalette 4294967295/type (ustring)/value [ 12 6a70672c6a70652c6a706567 ]}" +
        "/parameter-5 {/key 1936548194/showInPalette 4294967295/type (boolean)/value 1}" +
        "/parameter-6 {/key 1935764588/showInPalette 4294967295/type (boolean)/value 0}" +
        "/parameter-7 {/key 1936875886/showInPalette 4294967295/type (ustring)/value " + strParam("1") + "}}}";
    var tmp = new File(Folder.temp + "/cy_probe.aia");
    tmp.open("w"); tmp.write(aia); tmp.close();
    try { app.unloadAction("cy_set", ""); } catch (e0) {}
    try { app.loadAction(tmp); app.doScript("cy_act", "cy_set", false); out.push("doScript ok"); }
    catch (e) { out.push("doScript FAILED: " + e.message); }
    try { app.unloadAction("cy_set", ""); } catch (e1) {}
    try { tmp.remove(); } catch (e2) {}
    app.userInteractionLevel = prevUI;
    doc.close(SaveOptions.DONOTSAVECHANGES);
    return out.join("\n");
})();
""".replace("%OUT%", OUT.replace("\\", "\\\\")).replace("%BLOB%", BLOB)

print(app.DoJavaScript(js))

print("\n--- result (200pt square) ---")
print(f"   asked: ColorModel={COLOR_MODEL} ({'CMYK' if COLOR_MODEL == 2 else 'RGB' if COLOR_MODEL == 1 else 'Gray'})"
      f", DPI={DPI:.0f}  ->  expect {int(200 * DPI / 72)}px")
for f in sorted(os.listdir(OUT)):
    if f.lower().endswith(".jpg"):
        im = Image.open(os.path.join(OUT, f))
        got_dpi = round(im.width * 72 / 200)
        print(f"   {f}   {im.mode}  {im.width}x{im.height}   (= {got_dpi} dpi)")
