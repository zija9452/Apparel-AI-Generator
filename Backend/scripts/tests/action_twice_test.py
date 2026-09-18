"""Does running the Export As action a SECOND time pick up its own settings?

Adobe's bug report says the action "does not save parameters but uses ones from
the latest export instead". Read literally, that leaves a door open: the
action's parameters may still be WRITTEN into the dialog state even though the
export in that same run used the previous state. If so, run one is wrong and
run two is right - and a job could simply prime once and then export normally.

This session is factory-fresh and its last export was RGB at 72dpi, so a CMYK
result on run two or three cannot be inherited state - it could only have come
from the action's own blob.

Small scratch document, so three runs cost seconds. A 200pt artboard at 300dpi
is 833px; at 72dpi it is 200px, so resolution is readable straight off the
pixel count.
"""
import os

import win32com.client
from PIL import Image

OUT = r"E:\seam_test\twice"
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

app = win32com.client.GetActiveObject("Illustrator.Application")

BLOB = ("06000000" "01000000" "03000000" "02000000" "00002c01"
        "02000000" "02000000" "02000000"
        "69006d0061006700" "65006d0061007000" + "00000000" * 12 + "00000100")

js = r"""
(function () {
    var OUT = "%OUT%";
    var out = [];
    function toHex2(n) { return ("0" + n.toString(16)).slice(-2); }
    function hexStr(s) { var o = ""; for (var i = 0; i < s.length; i++) o += toHex2(s.charCodeAt(i)); return o; }
    function strParam(s) { var h = hexStr(s); return "[ " + (h.length / 2) + " " + h + " ]"; }

    var doc = app.documents.add(DocumentColorSpace.CMYK, 200, 200);
    var r = doc.pathItems.rectangle(180, 20, 160, 160);
    var c = new CMYKColor(); c.cyan = 0; c.magenta = 90; c.yellow = 10; c.black = 0;
    r.filled = true; r.fillColor = c; r.stroked = false;

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    function run(tag) {
        var outPath = OUT + "\\" + tag + ".jpg";
        var aia = "/version 3/name " + strParam("tw_set") + "/isOpen        0/actionCount   1" +
            "/action-1 {/name " + strParam("tw_act") + "/keyIndex    1/colorIndex  0" +
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
        var tmp = new File(Folder.temp + "/tw_probe.aia");
        tmp.open("w"); tmp.write(aia); tmp.close();
        try { app.unloadAction("tw_set", ""); } catch (e0) {}
        try { app.loadAction(tmp); app.doScript("tw_act", "tw_set", false); out.push(tag + ": ok"); }
        catch (e) { out.push(tag + ": FAILED " + e.message); }
        try { app.unloadAction("tw_set", ""); } catch (e1) {}
        try { tmp.remove(); } catch (e2) {}
    }

    run("run1");
    run("run2");
    run("run3");

    app.userInteractionLevel = prevUI;
    doc.close(SaveOptions.DONOTSAVECHANGES);
    return out.join("\n");
})();
""".replace("%OUT%", OUT.replace("\\", "\\\\")).replace("%BLOB%", BLOB)

print(app.DoJavaScript(js))

print("\n--- results (asked CMYK @300 every time; 200pt square) ---")
print("   300dpi = 833px,  72dpi = 200px")
for f in sorted(os.listdir(OUT)):
    if not f.lower().endswith(".jpg"):
        continue
    im = Image.open(os.path.join(OUT, f))
    dpi = round(im.width * 72 / 200)
    flag = "  <-- CMYK!" if im.mode == "CMYK" else ""
    print(f"   {f:22} {im.mode:5} {im.width}x{im.height}  (= {dpi} dpi){flag}")
