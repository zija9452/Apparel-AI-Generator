"""Which change broke the action - the names, or the whitespace?

The shipped .aia differs from the standalone one that produced a pixel-perfect
CMYK file in exactly two ways:
  A. set/action named "aiapparel_set"/"aiapparel_jpg" instead of "set1"/"act1"
  B. tokens separated by spaces: "/parameter-1 { /key ... > /size 100 }"
     instead of the original "/parameter-1 {/key ...>/size 100}"
The raw settings blob is byte-identical in both, so one of these two is making
Illustrator discard parameter-1 and fall back to its defaults (RGB, 72dpi,
imagemap on) - which is exactly what the job produced.

Runs on a THROWAWAY 200x200 CMYK document, not the 239MB order file: the
question is only what colour space comes out, and this answers it in seconds.
The scratch document is created and closed by this script, so no document the
operator opened is touched.
"""
import os

import win32com.client
from PIL import Image

OUT = r"E:\seam_test\aia_bisect"
os.makedirs(OUT, exist_ok=True)

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var OUT = "%OUT%";
    var results = [];

    function toHex2(n) { return ("0" + n.toString(16)).slice(-2); }
    function u16to8(cd) {
        if (cd < 0x80) return toHex2(cd);
        if (cd < 0x800) return toHex2(cd >> 6 & 0x1f | 0xc0) + toHex2(cd & 0x3f | 0x80);
        return toHex2(cd >> 12 | 0xe0) + toHex2(cd >> 6 & 0x3f | 0x80) + toHex2(cd & 0x3f | 0x80);
    }
    function hexStr(s) { var o = ""; for (var i = 0; i < s.length; i++) o += u16to8(s.charCodeAt(i)); return o; }
    function strParam(s) { var h = hexStr(s); return "[ " + (h.length / 2) + " " + h + " ]"; }

    var BLOB = "06000000" + "01000000" + "03000000" + "02000000" + "00002c01" +
               "02000000" + "02000000" + "02000000" +
               "69006d00   61006700   65006d00   61007000   00000000   00000000   00000000   00000000" +
               "00000000   00000000   00000000   00000000   00000000   00000000   00000000   00000000" +
               "00000100";

    // spaced = the shipped formatting; tight = the formatting that was verified
    function buildAia(setName, actName, outPath, spaced) {
        var p1, p2, p3, p4, p5, p6, p7;
        var pathHex = hexStr(outPath);
        if (spaced) {
            p1 = "/parameter-1 { /key 1885434477 /showInPalette 0 /type (raw) /value < 100 " + BLOB + "> /size 100 }";
            p2 = "/parameter-2 { /key 1851878757 /showInPalette 4294967295 /type (ustring) /value " + strParam(outPath) + " }";
            p3 = "/parameter-3 { /key 1718775156 /showInPalette 4294967295 /type (ustring) /value [ 16 4a5045472066696c6520666f726d6174 ] }";
            p4 = "/parameter-4 { /key 1702392942 /showInPalette 4294967295 /type (ustring) /value [ 12 6a70672c6a70652c6a706567 ] }";
            p5 = "/parameter-5 { /key 1936548194 /showInPalette 4294967295 /type (boolean) /value 1 }";
            p6 = "/parameter-6 { /key 1935764588 /showInPalette 4294967295 /type (boolean) /value 0 }";
            p7 = "/parameter-7 { /key 1936875886 /showInPalette 4294967295 /type (ustring) /value " + strParam("1") + " }";
        } else {
            p1 = "/parameter-1 {" + "/key 1885434477" + "/showInPalette 0" + "/type (raw)" + "/value < 100 " + BLOB + ">" + "/size 100" + "}";
            p2 = "/parameter-2 {" + "/key 1851878757" + "/showInPalette 4294967295" + "/type (ustring)" + "/value [ " + (pathHex.length / 2) + " " + pathHex + "]" + "}";
            p3 = "/parameter-3 {" + "/key 1718775156" + "/showInPalette 4294967295" + "/type (ustring)" + "/value [ 16 4a5045472066696c6520666f726d6174 ]" + "}";
            p4 = "/parameter-4 {" + "/key 1702392942" + "/showInPalette 4294967295" + "/type (ustring)" + "/value [ 12 6a70672c6a70652c6a706567 ]" + "}";
            p5 = "/parameter-5 {" + "/key 1936548194" + "/showInPalette 4294967295" + "/type (boolean)" + "/value 1" + "}";
            p6 = "/parameter-6 {" + "/key 1935764588" + "/showInPalette 4294967295" + "/type (boolean)" + "/value 0" + "}";
            p7 = "/parameter-7 {" + "/key 1936875886" + "/showInPalette 4294967295" + "/type (ustring)" + "/value [ 1 31]" + "}";
        }
        return "/version 3" + "/name " + strParam(setName) + "/isOpen        0" + "/actionCount   1" +
               "/action-1 {" + "/name " + strParam(actName) + "/keyIndex    1" + "/colorIndex  0" +
               "/isOpen      1" + "/eventCount  1" + "/event-1 {" + "/useRulersIn1stQuadrant 0" +
               "/internalName (adobe_exportDocument)" + "/localizedName [ 9 4578706f7274204173 ]" +
               "/isOpen          0" + "/isOn            1" + "/hasDialog       1" + "/showDialog      0" +
               "/parameterCount  7" + p1 + p2 + p3 + p4 + p5 + p6 + p7 + "}" + "}";
    }

    // Scratch document: 200x200pt, CMYK, one magenta square. Created here and
    // closed here - nothing the operator has open is involved.
    var doc = app.documents.add(DocumentColorSpace.CMYK, 200, 200);
    var r = doc.pathItems.rectangle(180, 20, 160, 160);
    var c = new CMYKColor(); c.cyan = 0; c.magenta = 90; c.yellow = 10; c.black = 0;
    r.filled = true; r.fillColor = c; r.stroked = false;

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    function run(tag, setName, actName, spaced) {
        var outPath = OUT + "\\" + tag + ".jpg";
        var tmp = new File(Folder.temp + "/bisect_" + tag + ".aia");
        tmp.open("w"); tmp.write(buildAia(setName, actName, outPath, spaced)); tmp.close();
        try { app.unloadAction(setName, ""); } catch (e0) {}
        try {
            app.loadAction(tmp);
            app.doScript(actName, setName, false);
            results.push(tag + ": doScript ok");
        } catch (e) {
            results.push(tag + ": FAILED " + e.message);
        }
        try { app.unloadAction(setName, ""); } catch (e1) {}
        try { tmp.remove(); } catch (e2) {}
    }

    run("A_tight_short",  "set1",          "act1",          false);
    run("B_tight_long",   "aiapparel_set", "aiapparel_jpg", false);
    run("C_spaced_short", "set1",          "act1",          true);
    run("D_spaced_long",  "aiapparel_set", "aiapparel_jpg", true);

    app.userInteractionLevel = prevUI;
    doc.close(SaveOptions.DONOTSAVECHANGES);   // scratch doc created above
    return results.join("\n");
})();
""".replace("%OUT%", OUT.replace("\\", "\\\\"))

print(app.DoJavaScript(js))

print("\n--- what landed ---")
for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    if f.lower().endswith(".jpg"):
        im = Image.open(p)
        verdict = "CMYK OK" if im.mode == "CMYK" else "*** " + im.mode + " - settings ignored"
        print(f"  {f:24} {im.mode:5} {im.width}x{im.height:<6} {verdict}")
    else:
        print(f"  {f:24} (side file)")
