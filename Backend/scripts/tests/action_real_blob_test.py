"""Build the Export action from Illustrator's OWN recorded bytes and test it.

The operator recorded a manual CMYK/300 export in Illustrator 19.0.0 and saved
it (E:\\cmyk_test.aia). Comparing that against everything sent so far shows why
none of it worked:

    Illustrator writes  /value < 104 ... >  /size 104
    this code sent      /value < 100 ... >  /size 100
    Illustrator writes  /localizedName [ 6 "Export" ]
    this code sent      /localizedName [ 9 "Export As" ]

The 100-byte layout came from nathandietz/ExportDocAsJPEG, which targets a
different Illustrator. A parameter of the wrong length is discarded, and a
discarded parameter is exactly the observed behaviour: the export ran, wrote
the file where asked, and used the dialog's leftover settings for everything
else.

Decoded, Illustrator's own 104-byte blob is 32 bytes of settings followed by 72
bytes of buffer it does not read back (the tail is a fragment of the filename
left in memory):

    05000000 quality 5      01000000 baseline      03000000 3 scans
    03000000 type optimized 00002c01 300 dpi       02000000 CMYK
    00000000 imagemap off   01000000 map style

Proof has to be a CHANGE. Three CMYK results in this investigation meant
nothing because the machine was already in a CMYK state. So this asks for
CMYK/300 and RGB/150 in the same fresh session and requires the output to
follow both times.
"""
import os
import subprocess
import sys
import time

import win32com.client
from PIL import Image

EXE = r"C:\Program Files\Adobe\Adobe Illustrator CC 2015\Support Files\Contents\Windows\Illustrator.exe"
OUT = r"E:\seam_test\real_blob"

# Illustrator's own 104-byte blob, verbatim from the recording. Only the eight
# 32-bit settings at the front are meaningful; the tail is left exactly as
# recorded rather than "cleaned up", because its length is what the parser
# checks and its content is evidently not read.
TAIL = ("69006d006100670065006d006100700000006e005f0072006500610064007900"
        "5f006f0072006400650072005f00350058004c002d004500580050004f005200"
        "0000000000000000")


def le32(n):
    return "".join(f"{(n >> (8 * i)) & 0xFF:02x}" for i in range(4))


def blob(quality, compression, scans, aliasing, dpi, color_model, imagemap, mapstyle):
    b = (le32(quality) + le32(compression) + le32(scans) + le32(aliasing)
         + le32(int(dpi * 65536)) + le32(color_model) + le32(imagemap) + le32(mapstyle)
         + TAIL)
    assert len(b) == 208, f"expected 104 bytes / 208 hex chars, got {len(b)/2}"
    return b


def running():
    r = subprocess.run(["tasklist", "/FI", "IMAGENAME eq Illustrator.exe"],
                       capture_output=True, text=True)
    return "Illustrator.exe" in r.stdout


if not running():
    print("starting Illustrator (fresh session - the state a job actually gets)...")
    subprocess.Popen([EXE])
app = None
for _ in range(90):
    try:
        app = win32com.client.GetActiveObject("Illustrator.Application")
        app.DoJavaScript("1;")
        break
    except Exception:
        app = None
        time.sleep(2)
if app is None:
    sys.exit("Illustrator did not answer COM")

os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

CASES = [
    ("A_cmyk300", blob(5, 1, 3, 3, 300, 2, 0, 1)),
    ("B_rgb150",  blob(5, 1, 3, 3, 150, 1, 0, 1)),
    ("C_gray600", blob(5, 1, 3, 3, 600, 3, 0, 1)),
]

js = r"""
(function () {
    var OUT = "%OUT%";
    var CASES = %CASES%;
    var out = ["session JPEG ColorModel pref = " +
               app.preferences.getIntegerPreference("plugin/JPEGFormat/ColorModel")];

    function toHex2(n) { return ("0" + n.toString(16)).slice(-2); }
    function hexStr(s) { var o = ""; for (var i = 0; i < s.length; i++) o += toHex2(s.charCodeAt(i)); return o; }
    function strParam(s) { var h = hexStr(s); return "[ " + (h.length / 2) + " " + h + " ]"; }

    var doc = app.documents.add(DocumentColorSpace.CMYK, 200, 200);
    var r = doc.pathItems.rectangle(180, 20, 160, 160);
    var c = new CMYKColor(); c.cyan = 0; c.magenta = 90; c.yellow = 10; c.black = 0;
    r.filled = true; r.fillColor = c; r.stroked = false;

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    for (var k = 0; k < CASES.length; k++) {
        var tag = CASES[k][0], hex = CASES[k][1];
        var outPath = OUT + "\\" + tag + ".jpg";
        // Structure copied from the recording: localizedName "Export" (6),
        // /size 104, showInPalette -1 on the string params, and only the one
        // export event - the two adobe_closeDocument events it recorded are
        // deliberately dropped, they would close the order document.
        var aia = "/version 3\n/name " + strParam("cmyk_set") + "\n/isOpen 1\n/actionCount 1\n" +
            "/action-1 {\n/name " + strParam("cmyk_act") + "\n/keyIndex 0\n/colorIndex 0\n" +
            "/isOpen 1\n/eventCount 1\n" +
            "/event-1 {\n/useRulersIn1stQuadrant 0\n" +
            "/internalName (adobe_exportDocument)\n" +
            "/localizedName [ 6 4578706f7274 ]\n" +
            "/isOpen 1\n/isOn 1\n/hasDialog 1\n/showDialog 0\n/parameterCount 7\n" +
            "/parameter-1 {\n/key 1885434477\n/showInPalette 0\n/type (raw)\n/value < 104\n" +
              hex + "\n>\n/size 104\n}\n" +
            "/parameter-2 {\n/key 1851878757\n/showInPalette -1\n/type (ustring)\n/value " + strParam(outPath) + "\n}\n" +
            "/parameter-3 {\n/key 1718775156\n/showInPalette -1\n/type (ustring)\n/value [ 16 4a5045472066696c6520666f726d6174 ]\n}\n" +
            "/parameter-4 {\n/key 1702392942\n/showInPalette -1\n/type (ustring)\n/value [ 12 6a70672c6a70652c6a706567 ]\n}\n" +
            "/parameter-5 {\n/key 1936548194\n/showInPalette -1\n/type (boolean)\n/value 1\n}\n" +
            "/parameter-6 {\n/key 1935764588\n/showInPalette -1\n/type (boolean)\n/value 0\n}\n" +
            "/parameter-7 {\n/key 1936875886\n/showInPalette -1\n/type (ustring)\n/value " + strParam("1") + "\n}\n" +
            "}\n}";
        var tmp = new File(Folder.temp + "/cmyk_probe.aia");
        tmp.open("w"); tmp.write(aia); tmp.close();
        try { app.unloadAction("cmyk_set", ""); } catch (e0) {}
        try { app.loadAction(tmp); app.doScript("cmyk_act", "cmyk_set", false); out.push(tag + ": ok"); }
        catch (e) { out.push(tag + ": FAILED " + e.message); }
        try { app.unloadAction("cmyk_set", ""); } catch (e1) {}
        try { tmp.remove(); } catch (e2) {}
    }

    app.userInteractionLevel = prevUI;
    doc.close(SaveOptions.DONOTSAVECHANGES);
    return out.join("\n");
})();
""".replace("%OUT%", OUT.replace("\\", "\\\\")) \
   .replace("%CASES%", "[" + ",".join(f'["{t}","{h}"]' for t, h in CASES) + "]")

print(app.DoJavaScript(js))

WANT = {"A_cmyk300": ("CMYK", 833), "B_rgb150": ("RGB", 417), "C_gray600": ("L", 1667)}
print("\n--- results (200pt square) ---")
ok = True
for f in sorted(os.listdir(OUT)):
    if not f.lower().endswith(".jpg"):
        continue
    tag = next((k for k in WANT if f.startswith(k)), None)
    im = Image.open(os.path.join(OUT, f))
    if tag:
        mode, px = WANT[tag]
        good = im.mode == mode and abs(im.width - px) <= 3
        ok &= good
        print(f"   {f:22} {im.mode:5} {im.width}x{im.height:<6} "
              f"wanted {mode}/{px}  {'OK' if good else '<-- MISMATCH'}")
    else:
        print(f"   {f:22} {im.mode:5} {im.width}x{im.height}")

print("\n   VERDICT:", "THE BLOB IS HONOURED - scripted CMYK JPEG works on CC 2015"
      if ok else "still not honoured")
