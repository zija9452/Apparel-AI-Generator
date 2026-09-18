"""Can the Export As JPEG settings be driven through app.preferences?

Illustrator's prefs file carries the dialog's remembered settings:

    /plugin { /JPEGFormat { /ColorModel 2 /Quality 5 /AntiAlias 3
                            /Compression 1 /DoImageMap 0 } }
    /DPI 300.0

Export As ignores an action's own parameters and uses these instead (Adobe's
own bug report). So if these are writable from script, the action route stops
being a gamble: set them, run the action, and Illustrator itself encodes the
JPEG - which is the only way to get a file identical to the operator's manual
export rather than merely equivalent to it.

Proof has to be a CHANGE, not a match. Asking for CMYK while the pref already
says CMYK proves nothing - that is exactly the trap the earlier action tests
fell into. So this sets ColorModel to RGB, exports, and only believes the
mechanism if the file comes back RGB.

Restores every pref it touches before exiting.
"""
import os

import win32com.client
from PIL import Image

OUT = r"E:\seam_test\prefs_probe"
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var OUT = "%OUT%";
    var out = [];
    var P = app.preferences;

    var KEYS = ["plugin/JPEGFormat/ColorModel", "plugin/JPEGFormat/Quality",
                "plugin/JPEGFormat/AntiAlias", "plugin/JPEGFormat/Compression",
                "plugin/JPEGFormat/DoImageMap", "plugin/JPEGFormat/NumScans"];

    out.push("--- reading current prefs ---");
    var saved = {};
    for (var k = 0; k < KEYS.length; k++) {
        try {
            saved[KEYS[k]] = P.getIntegerPreference(KEYS[k]);
            out.push("  " + KEYS[k] + " = " + saved[KEYS[k]]);
        } catch (e) { out.push("  " + KEYS[k] + " READ FAILED: " + e.message); }
    }
    var savedDPI = null;
    try { savedDPI = P.getRealPreference("DPI"); out.push("  DPI = " + savedDPI); }
    catch (e) { out.push("  DPI READ FAILED: " + e.message); }

    // Scratch document, so nothing of the operator's is involved.
    var doc = app.documents.add(DocumentColorSpace.CMYK, 200, 200);
    var r = doc.pathItems.rectangle(180, 20, 160, 160);
    var c = new CMYKColor(); c.cyan = 0; c.magenta = 90; c.yellow = 10; c.black = 0;
    r.filled = true; r.fillColor = c; r.stroked = false;

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    function toHex2(n) { return ("0" + n.toString(16)).slice(-2); }
    function hexStr(s) { var o = ""; for (var i = 0; i < s.length; i++) o += toHex2(s.charCodeAt(i)); return o; }
    function strParam(s) { var h = hexStr(s); return "[ " + (h.length / 2) + " " + h + " ]"; }

    function runAction(tag) {
        var outPath = OUT + "\\" + tag + ".jpg";
        var aia = "/version 3/name " + strParam("pref_set") + "/isOpen        0/actionCount   1" +
            "/action-1 {/name " + strParam("pref_act") + "/keyIndex    1/colorIndex  0" +
            "/isOpen      1/eventCount  1/event-1 {/useRulersIn1stQuadrant 0" +
            "/internalName (adobe_exportDocument)/localizedName [ 9 4578706f7274204173 ]" +
            "/isOpen          0/isOn            1/hasDialog       1/showDialog      0" +
            "/parameterCount  7" +
            "/parameter-1 {/key 1885434477/showInPalette 0/type (raw)/value < 100 " +
            "060000000100000003000000020000000000 2c01" .replace(" ", "") +
            "02000000020000000200000069006d00   61006700   65006d00   61007000   00000000   00000000   00000000   00000000" +
            "00000000   00000000   00000000   00000000   00000000   00000000   00000000   00000000" +
            "00000100>/size 100}" +
            "/parameter-2 {/key 1851878757/showInPalette 4294967295/type (ustring)/value " + strParam(outPath) + "}" +
            "/parameter-3 {/key 1718775156/showInPalette 4294967295/type (ustring)/value [ 16 4a5045472066696c6520666f726d6174 ]}" +
            "/parameter-4 {/key 1702392942/showInPalette 4294967295/type (ustring)/value [ 12 6a70672c6a70652c6a706567 ]}" +
            "/parameter-5 {/key 1936548194/showInPalette 4294967295/type (boolean)/value 1}" +
            "/parameter-6 {/key 1935764588/showInPalette 4294967295/type (boolean)/value 0}" +
            "/parameter-7 {/key 1936875886/showInPalette 4294967295/type (ustring)/value " + strParam("1") + "}}}";
        var tmp = new File(Folder.temp + "/pref_probe.aia");
        tmp.open("w"); tmp.write(aia); tmp.close();
        try { app.unloadAction("pref_set", ""); } catch (e0) {}
        try { app.loadAction(tmp); app.doScript("pref_act", "pref_set", false); }
        catch (e) { out.push("  " + tag + " doScript FAILED " + e.message); }
        try { app.unloadAction("pref_set", ""); } catch (e1) {}
        try { tmp.remove(); } catch (e2) {}
    }

    out.push("\n--- forcing ColorModel=1 (RGB), DPI=150 ---");
    try {
        P.setIntegerPreference("plugin/JPEGFormat/ColorModel", 1);
        P.setRealPreference("DPI", 150.0);
        out.push("  wrote; reads back ColorModel=" + P.getIntegerPreference("plugin/JPEGFormat/ColorModel") +
                 " DPI=" + P.getRealPreference("DPI"));
    } catch (e) { out.push("  WRITE FAILED: " + e.message); }
    runAction("forced_RGB_150");

    out.push("\n--- forcing ColorModel=2 (CMYK), DPI=300 ---");
    try {
        P.setIntegerPreference("plugin/JPEGFormat/ColorModel", 2);
        P.setRealPreference("DPI", 300.0);
        out.push("  wrote; reads back ColorModel=" + P.getIntegerPreference("plugin/JPEGFormat/ColorModel") +
                 " DPI=" + P.getRealPreference("DPI"));
    } catch (e) { out.push("  WRITE FAILED: " + e.message); }
    runAction("forced_CMYK_300");

    // Put everything back exactly as found.
    for (var k2 = 0; k2 < KEYS.length; k2++)
        if (saved.hasOwnProperty(KEYS[k2]))
            try { P.setIntegerPreference(KEYS[k2], saved[KEYS[k2]]); } catch (e) {}
    if (savedDPI !== null) try { P.setRealPreference("DPI", savedDPI); } catch (e) {}
    out.push("\nprefs restored to what they were.");

    app.userInteractionLevel = prevUI;
    doc.close(SaveOptions.DONOTSAVECHANGES);
    return out.join("\n");
})();
""".replace("%OUT%", OUT.replace("\\", "\\\\"))

print(app.DoJavaScript(js))

print("\n--- files (200pt square) ---")
print("   if prefs drive the export: forced_RGB_150 must be RGB 417px,")
print("   forced_CMYK_300 must be CMYK 833px")
for f in sorted(os.listdir(OUT)):
    if f.lower().endswith(".jpg"):
        im = Image.open(os.path.join(OUT, f))
        print(f"   {f:26} {im.mode:5} {im.width}x{im.height}")
    else:
        print(f"   {f:26} (side file)")
