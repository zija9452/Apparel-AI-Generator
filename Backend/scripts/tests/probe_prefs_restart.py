"""Does writing the prefs FILE before Illustrator starts drive the JPEG export?

app.preferences.setIntegerPreference writes the pref store but the export
ignored it mid-session, which points at the plugin caching its settings when
Illustrator starts. If that is right, editing the file while Illustrator is
CLOSED should work - and that is a thing the agent can do, because the agent
already controls when Illustrator starts.

Proof must be a CHANGE, not a match: the prefs currently say CMYK/300, so this
writes RGB/150 and only believes the mechanism if the exported file comes back
RGB at 150dpi. Asking for what is already set proves nothing.

Backs the prefs file up first and restores CMYK/300 at the end.

Illustrator must be CLOSED when this starts - it rewrites the file on quit.
"""
import os
import re
import shutil
import subprocess
import sys
import time

import win32com.client
from PIL import Image

PREFS = r"C:\Users\scb\AppData\Roaming\Adobe\Adobe Illustrator 19 Settings\en_US\x64\Adobe Illustrator Prefs"
BACKUP = PREFS + ".claude-backup"
EXE = r"C:\Program Files\Adobe\Adobe Illustrator CC 2015\Support Files\Contents\Windows\Illustrator.exe"
OUT = r"E:\seam_test\prefs_restart"


def illustrator_running():
    r = subprocess.run(["tasklist", "/FI", "IMAGENAME eq Illustrator.exe"],
                       capture_output=True, text=True)
    return "Illustrator.exe" in r.stdout


def patch_prefs(color_model, dpi):
    """Set /plugin/JPEGFormat/ColorModel and the top-level /DPI in the file."""
    txt = open(PREFS, encoding="utf-8", errors="replace").read()
    before_cm = re.search(r"/ColorModel (\d+)", txt)
    before_dpi = re.search(r"^/DPI ([\d.]+)", txt, re.M)
    txt = re.sub(r"(/JPEGFormat \{[^}]*?/ColorModel )\d+", r"\g<1>" + str(color_model),
                 txt, count=1, flags=re.S)
    txt = re.sub(r"^/DPI [\d.]+", f"/DPI {dpi:.1f}", txt, count=1, flags=re.M)
    open(PREFS, "w", encoding="utf-8", newline="").write(txt)
    after_cm = re.search(r"/ColorModel (\d+)", txt)
    after_dpi = re.search(r"^/DPI ([\d.]+)", txt, re.M)
    print(f"  prefs file: ColorModel {before_cm.group(1)} -> {after_cm.group(1)}, "
          f"DPI {before_dpi.group(1)} -> {after_dpi.group(1)}")


if illustrator_running():
    sys.exit("Illustrator is running - close it first; it rewrites the prefs on quit.")

os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

if not os.path.exists(BACKUP):
    shutil.copy2(PREFS, BACKUP)
    print(f"backed up prefs -> {os.path.basename(BACKUP)}")

print("\nwriting RGB / 150 dpi into the closed prefs file:")
patch_prefs(1, 150.0)

print("\nstarting Illustrator...")
subprocess.Popen([EXE])
app = None
for _ in range(90):
    time.sleep(2)
    try:
        app = win32com.client.GetActiveObject("Illustrator.Application")
        break
    except Exception:
        pass
if app is None:
    sys.exit("Illustrator did not answer COM in 180s")
print("Illustrator answered COM")

js = r"""
(function () {
    var OUT = "%OUT%";
    var out = [];
    try {
        out.push("prefs as the new session sees them: ColorModel=" +
                 app.preferences.getIntegerPreference("plugin/JPEGFormat/ColorModel") +
                 " DPI=" + app.preferences.getRealPreference("DPI"));
    } catch (e) { out.push("pref read failed: " + e.message); }

    function toHex2(n) { return ("0" + n.toString(16)).slice(-2); }
    function hexStr(s) { var o = ""; for (var i = 0; i < s.length; i++) o += toHex2(s.charCodeAt(i)); return o; }
    function strParam(s) { var h = hexStr(s); return "[ " + (h.length / 2) + " " + h + " ]"; }

    var doc = app.documents.add(DocumentColorSpace.CMYK, 200, 200);
    var r = doc.pathItems.rectangle(180, 20, 160, 160);
    var c = new CMYKColor(); c.cyan = 0; c.magenta = 90; c.yellow = 10; c.black = 0;
    r.filled = true; r.fillColor = c; r.stroked = false;

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    var outPath = OUT + "\\after_restart.jpg";
    var aia = "/version 3/name " + strParam("rst_set") + "/isOpen        0/actionCount   1" +
        "/action-1 {/name " + strParam("rst_act") + "/keyIndex    1/colorIndex  0" +
        "/isOpen      1/eventCount  1/event-1 {/useRulersIn1stQuadrant 0" +
        "/internalName (adobe_exportDocument)/localizedName [ 9 4578706f7274204173 ]" +
        "/isOpen          0/isOn            1/hasDialog       1/showDialog      0/parameterCount  7" +
        "/parameter-1 {/key 1885434477/showInPalette 0/type (raw)/value < 100 " +
        "060000000100000003000000020000000000 2c0102000000020000000200000069006d00" .replace(" ", "") +
        "   61006700   65006d00   61007000   00000000   00000000   00000000   00000000" +
        "00000000   00000000   00000000   00000000   00000000   00000000   00000000   00000000" +
        "00000100>/size 100}" +
        "/parameter-2 {/key 1851878757/showInPalette 4294967295/type (ustring)/value " + strParam(outPath) + "}" +
        "/parameter-3 {/key 1718775156/showInPalette 4294967295/type (ustring)/value [ 16 4a5045472066696c6520666f726d6174 ]}" +
        "/parameter-4 {/key 1702392942/showInPalette 4294967295/type (ustring)/value [ 12 6a70672c6a70652c6a706567 ]}" +
        "/parameter-5 {/key 1936548194/showInPalette 4294967295/type (boolean)/value 1}" +
        "/parameter-6 {/key 1935764588/showInPalette 4294967295/type (boolean)/value 0}" +
        "/parameter-7 {/key 1936875886/showInPalette 4294967295/type (ustring)/value " + strParam("1") + "}}}";
    var tmp = new File(Folder.temp + "/rst_probe.aia");
    tmp.open("w"); tmp.write(aia); tmp.close();
    try { app.unloadAction("rst_set", ""); } catch (e0) {}
    try { app.loadAction(tmp); app.doScript("rst_act", "rst_set", false); out.push("doScript ok"); }
    catch (e) { out.push("doScript FAILED " + e.message); }
    try { app.unloadAction("rst_set", ""); } catch (e1) {}
    try { tmp.remove(); } catch (e2) {}

    app.userInteractionLevel = prevUI;
    doc.close(SaveOptions.DONOTSAVECHANGES);
    return out.join("\n");
})();
""".replace("%OUT%", OUT.replace("\\", "\\\\"))

print(app.DoJavaScript(js))

print("\n--- result ---")
print("   prefs asked for RGB @150dpi -> a 200pt square must be RGB 417x417")
print("   if it comes back CMYK 833x833, the prefs file does NOT drive the export")
for f in sorted(os.listdir(OUT)):
    if f.lower().endswith(".jpg"):
        im = Image.open(os.path.join(OUT, f))
        print(f"   {f:24} {im.mode:5} {im.width}x{im.height}")
        print("\n   VERDICT:", "PREFS FILE DRIVES THE EXPORT" if im.mode == "RGB"
              else "prefs file ignored too")
