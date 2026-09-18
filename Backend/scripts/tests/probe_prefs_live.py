"""Can the JPEG export prefs be changed DURING a session, without restarting?

Restarting Illustrator for every export would be the expensive answer, so this
checks the cheap one first, and reads the prefs at every stage rather than only
at the end:

    before        -> what the session starts with
    after write   -> did setIntegerPreference take
    after export  -> did the export write its own state back over ours

That last read is the informative one. If our value survives the export but the
FILE is still the old colour space, the export is reading a copy it cached at
startup. If our value is gone after the export, the dialog's in-memory state is
authoritative and is writing back.

Also tries a document close/open in between, in case the plugin re-reads prefs
when a document event occurs.

Restores every pref before exiting.
"""
import os

import win32com.client
from PIL import Image

OUT = r"E:\seam_test\prefs_live"
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var OUT = "%OUT%";
    var out = [];
    var P = app.preferences;
    var CM = "plugin/JPEGFormat/ColorModel";

    function readAll(when) {
        var s = "";
        try { s += "ColorModel=" + P.getIntegerPreference(CM); } catch (e) { s += "ColorModel=ERR"; }
        try { s += "  Quality=" + P.getIntegerPreference("plugin/JPEGFormat/Quality"); } catch (e) {}
        try { s += "  AntiAlias=" + P.getIntegerPreference("plugin/JPEGFormat/AntiAlias"); } catch (e) {}
        try { s += "  DPI=" + P.getRealPreference("DPI"); } catch (e) { s += "  DPI=ERR"; }
        out.push("  [" + when + "] " + s);
    }

    var savedCM = P.getIntegerPreference(CM);
    var savedDPI = P.getRealPreference("DPI");

    function toHex2(n) { return ("0" + n.toString(16)).slice(-2); }
    function hexStr(s) { var o = ""; for (var i = 0; i < s.length; i++) o += toHex2(s.charCodeAt(i)); return o; }
    function strParam(s) { var h = hexStr(s); return "[ " + (h.length / 2) + " " + h + " ]"; }

    function runAction(tag) {
        var outPath = OUT + "\\" + tag + ".jpg";
        var aia = "/version 3/name " + strParam("live_set") + "/isOpen        0/actionCount   1" +
            "/action-1 {/name " + strParam("live_act") + "/keyIndex    1/colorIndex  0" +
            "/isOpen      1/eventCount  1/event-1 {/useRulersIn1stQuadrant 0" +
            "/internalName (adobe_exportDocument)/localizedName [ 9 4578706f7274204173 ]" +
            "/isOpen          0/isOn            1/hasDialog       1/showDialog      0/parameterCount  7" +
            "/parameter-1 {/key 1885434477/showInPalette 0/type (raw)/value < 100 " +
            "06000000010000000300000002000000" + "00002c01" + "02000000020000000200000" + "0" +
            "69006d00   61006700   65006d00   61007000   00000000   00000000   00000000   00000000" +
            "00000000   00000000   00000000   00000000   00000000   00000000   00000000   00000000" +
            "00000100>/size 100}" +
            "/parameter-2 {/key 1851878757/showInPalette 4294967295/type (ustring)/value " + strParam(outPath) + "}" +
            "/parameter-3 {/key 1718775156/showInPalette 4294967295/type (ustring)/value [ 16 4a5045472066696c6520666f726d6174 ]}" +
            "/parameter-4 {/key 1702392942/showInPalette 4294967295/type (ustring)/value [ 12 6a70672c6a70652c6a706567 ]}" +
            "/parameter-5 {/key 1936548194/showInPalette 4294967295/type (boolean)/value 1}" +
            "/parameter-6 {/key 1935764588/showInPalette 4294967295/type (boolean)/value 0}" +
            "/parameter-7 {/key 1936875886/showInPalette 4294967295/type (ustring)/value " + strParam("1") + "}}}";
        var tmp = new File(Folder.temp + "/live_probe.aia");
        tmp.open("w"); tmp.write(aia); tmp.close();
        try { app.unloadAction("live_set", ""); } catch (e0) {}
        try { app.loadAction(tmp); app.doScript("live_act", "live_set", false); }
        catch (e) { out.push("  doScript FAILED " + e.message); }
        try { app.unloadAction("live_set", ""); } catch (e1) {}
        try { tmp.remove(); } catch (e2) {}
    }

    function scratch() {
        var d = app.documents.add(DocumentColorSpace.CMYK, 200, 200);
        var r = d.pathItems.rectangle(180, 20, 160, 160);
        var c = new CMYKColor(); c.cyan = 0; c.magenta = 90; c.yellow = 10; c.black = 0;
        r.filled = true; r.fillColor = c; r.stroked = false;
        return d;
    }

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    out.push("STAGE 1 - write the pref, then export in the same session");
    readAll("before");
    P.setIntegerPreference(CM, 1);      // RGB
    P.setRealPreference("DPI", 150.0);
    readAll("after write");
    var d1 = scratch();
    runAction("A_same_session");
    readAll("after export");
    d1.close(SaveOptions.DONOTSAVECHANGES);

    out.push("\nSTAGE 2 - write the pref, then close/open a document first");
    P.setIntegerPreference(CM, 1);
    P.setRealPreference("DPI", 150.0);
    readAll("after write");
    var d2 = scratch();
    d2.close(SaveOptions.DONOTSAVECHANGES);   // a document event in between
    var d3 = scratch();
    readAll("after doc churn");
    runAction("B_after_doc_churn");
    readAll("after export");
    d3.close(SaveOptions.DONOTSAVECHANGES);

    P.setIntegerPreference(CM, savedCM);
    P.setRealPreference("DPI", savedDPI);
    out.push("\nrestored: ColorModel=" + P.getIntegerPreference(CM) + " DPI=" + P.getRealPreference("DPI"));

    app.userInteractionLevel = prevUI;
    return out.join("\n");
})();
""".replace("%OUT%", OUT.replace("\\", "\\\\"))

print(app.DoJavaScript(js))

print("\n--- files (200pt square; RGB@150 would be 417px, CMYK@300 is 833px) ---")
for f in sorted(os.listdir(OUT)):
    if f.lower().endswith(".jpg"):
        im = Image.open(os.path.join(OUT, f))
        print(f"   {f:26} {im.mode:5} {im.width}x{im.height}")
