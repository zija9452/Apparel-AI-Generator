"""The session was started with JPEG ColorModel=1 (RGB) and DPI=150 in the
prefs file. Export now and see what comes out.

This is the clean version of the discriminator. The prefs currently on disk -
and therefore the ones this Illustrator loaded at startup - ask for RGB at
150dpi, while every export this machine has produced today has been CMYK at
300. So:

    RGB 417x417  -> the prefs file drives Export As. The agent can set it
                    before each Illustrator start and get Illustrator's own
                    encoder, i.e. a file identical to the manual export.
    CMYK 833x833 -> the prefs file is not the lever either.

There are TWO ColorModel keys in the file. /plugin/TIFFFileFormat/ColorModel
belongs to TIFF export; the one that matters here is
/plugin/JPEGFormat/ColorModel. Confusing them is what made the first patch a
no-op.
"""
import os

import win32com.client
from PIL import Image

OUT = r"E:\seam_test\prefs_verdict"
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

app = win32com.client.GetActiveObject("Illustrator.Application")

# Built in Python and injected as one literal so the hex cannot pick up stray
# whitespace from string surgery inside the JSX.
BLOB = ("06000000" "01000000" "03000000" "02000000" "00002c01"
        "02000000" "02000000" "02000000"
        "69006d0061006700" "65006d0061007000"
        + "00000000" * 12 + "00000100")
assert len(BLOB) == 200, f"blob must be 100 bytes / 200 hex chars, got {len(BLOB)}"

js = r"""
(function () {
    var OUT = "%OUT%";
    var out = [];
    out.push("this session loaded: JPEGFormat/ColorModel=" +
             app.preferences.getIntegerPreference("plugin/JPEGFormat/ColorModel") +
             "  DPI=" + app.preferences.getRealPreference("DPI"));

    function toHex2(n) { return ("0" + n.toString(16)).slice(-2); }
    function hexStr(s) { var o = ""; for (var i = 0; i < s.length; i++) o += toHex2(s.charCodeAt(i)); return o; }
    function strParam(s) { var h = hexStr(s); return "[ " + (h.length / 2) + " " + h + " ]"; }

    var doc = app.documents.add(DocumentColorSpace.CMYK, 200, 200);
    var r = doc.pathItems.rectangle(180, 20, 160, 160);
    var c = new CMYKColor(); c.cyan = 0; c.magenta = 90; c.yellow = 10; c.black = 0;
    r.filled = true; r.fillColor = c; r.stroked = false;

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    var outPath = OUT + "\\verdict.jpg";
    var aia = "/version 3/name " + strParam("vd_set") + "/isOpen        0/actionCount   1" +
        "/action-1 {/name " + strParam("vd_act") + "/keyIndex    1/colorIndex  0" +
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

    var tmp = new File(Folder.temp + "/vd_probe.aia");
    if (!tmp.open("w")) { out.push("could not write .aia"); }
    else { tmp.write(aia); tmp.close();
        try { app.unloadAction("vd_set", ""); } catch (e0) {}
        try { app.loadAction(tmp); app.doScript("vd_act", "vd_set", false); out.push("doScript ok"); }
        catch (e) { out.push("doScript FAILED: " + e.message); }
        try { app.unloadAction("vd_set", ""); } catch (e1) {}
        try { tmp.remove(); } catch (e2) {}
    }

    app.userInteractionLevel = prevUI;
    doc.close(SaveOptions.DONOTSAVECHANGES);
    return out.join("\n");
})();
""".replace("%OUT%", OUT.replace("\\", "\\\\")).replace("%BLOB%", BLOB)

print(app.DoJavaScript(js))

print("\n--- result ---")
for f in sorted(os.listdir(OUT)):
    if not f.lower().endswith(".jpg"):
        print(f"   {f}  (side file)")
        continue
    im = Image.open(os.path.join(OUT, f))
    print(f"   {f}   {im.mode}  {im.width}x{im.height}")
    print()
    if im.mode == "RGB":
        print("   VERDICT: the PREFS FILE drives Export As.")
        print("            Set it before Illustrator starts and the export obeys.")
    else:
        print("   VERDICT: prefs file ignored as well - no scripted lever exists.")
