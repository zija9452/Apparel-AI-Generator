"""Export a CMYK JPEG the way the operator does it by hand - from a script.

`ExportOptionsJPEG` has no colour-space property (proved by reflect in
probe_export_options.py, and confirmed by Adobe's own scripting guide), so
`exportFile` can only ever write RGB. The Export As DIALOG does have the Image
Color Model dropdown, and an Illustrator ACTION can record that dialog. So the
route is: build a temporary .aia in memory, app.loadAction it, app.doScript it,
unload it. Illustrator runs its own export dialog with our settings.

The dialog's nine settings live in one 100-byte raw blob. Each is a 32-bit
little-endian value written as hex, e.g. resolution 300 = 16.16 fixed point
0x012C0000 -> "00002c01".

Technique from Silly-V on the Adobe forums via nathandietz/ExportDocAsJPEG.

Usage: export_jpeg_cmyk_action.py <out.jpg> [colorModel] [aliasing] [artboard]
       colorModel / aliasing default to the CMYK + Art Optimized pair.
"""
import sys
import time

import win32com.client

OUT = sys.argv[1] if len(sys.argv) > 1 else r"E:\seam_test\ACT_cmyk.jpg"
COLOR_MDL = sys.argv[2] if len(sys.argv) > 2 else "02000000"   # 2 = CMYK
ALIASING = sys.argv[3] if len(sys.argv) > 3 else "02000000"
ARTBOARD = sys.argv[4] if len(sys.argv) > 4 else "1"

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var OUT = "%OUT%", COLOR_MDL = "%COLOR_MDL%", ALIASING = "%ALIASING%", ARTBOARD = "%ARTBOARD%";

    var doc = null;
    for (var i = 0; i < app.documents.length; i++)
        if (app.documents[i].name.indexOf("production_ready_order_5XL.ai") !== -1) doc = app.documents[i];
    if (!doc) doc = app.open(new File("%AI%"));   // left open afterwards, never closed
    doc.activate();

    function toHex2(n) { return ("0" + n.toString(16)).slice(-2); }
    function u16to8(cd) {
        if (cd < 0x80) return toHex2(cd);
        if (cd < 0x800) return toHex2(cd >> 6 & 0x1f | 0xc0) + toHex2(cd & 0x3f | 0x80);
        return toHex2(cd >> 12 | 0xe0) + toHex2(cd >> 6 & 0x3f | 0x80) + toHex2(cd & 0x3f | 0x80);
    }
    function hexStr(s) {
        var out = "";
        for (var i = 0; i < s.length; i++) out += u16to8(s.charCodeAt(i));
        return out;
    }

    var pathHex = hexStr(OUT);
    var rangeHex = hexStr(ARTBOARD);

    var aia = "" +
    "/version 3" +
    "/name [ 4 73657431 ]" +              // set name "set1"
    "/isOpen        0" +
    "/actionCount   1" +
    "/action-1 {" +
      "/name [ 4 61637431 ]" +            // action name "act1"
      "/keyIndex    1" +
      "/colorIndex  0" +
      "/isOpen      1" +
      "/eventCount  1" +
      "/event-1 {" +
        "/useRulersIn1stQuadrant 0" +
        "/internalName (adobe_exportDocument)" +
        "/localizedName [ 9 4578706f7274204173 ]" +   // "Export As"
        "/isOpen          0" +
        "/isOn            1" +
        "/hasDialog       1" +
        "/showDialog      0" +
        "/parameterCount  7" +
        "/parameter-1 {" +
          "/key 1885434477" +
          "/showInPalette 0" +
          "/type (raw)" +
          "/value < 100 " +
             "06000000" +        // imagQual  6 = maximum on the 0-10 slider region
             "01000000" +        // compMeth  1 = Baseline (Standard)
             "03000000" +        // numScans  (progressive only)
             ALIASING +          // aliasing
             "00002c01" +        // imageRes  300 dpi, 16.16 fixed
             COLOR_MDL +         // colorMdl  <- the Image Color Model dropdown
             "02000000" +        // imageMap
             "02000000" +        // mapStyle
            "69006d00   61006700   65006d00   61007000   00000000   00000000   00000000   00000000" +
            "00000000   00000000   00000000   00000000   00000000   00000000   00000000   00000000" +
             "00000100" +        // iccProfl
          ">" +
          "/size 100" +
        "}" +
        "/parameter-2 {" +
          "/key 1851878757" +
          "/showInPalette 4294967295" +
          "/type (ustring)" +
          "/value [ " + (pathHex.length / 2) + " " + pathHex + " ]" +
        "}" +
        "/parameter-3 {" +
          "/key 1718775156" +
          "/showInPalette 4294967295" +
          "/type (ustring)" +
          "/value [ 16 4a5045472066696c6520666f726d6174 ]" +   // "JPEG file format"
        "}" +
        "/parameter-4 {" +
          "/key 1702392942" +
          "/showInPalette 4294967295" +
          "/type (ustring)" +
          "/value [ 12 6a70672c6a70652c6a706567 ]" +           // "jpg,jpe,jpeg"
        "}" +
        "/parameter-5 {" +
          "/key 1936548194" +
          "/showInPalette 4294967295" +
          "/type (boolean)" +
          "/value 1" +                    // Use Artboards = on, so the crop matches
        "}" +
        "/parameter-6 {" +
          "/key 1935764588" +
          "/showInPalette 4294967295" +
          "/type (boolean)" +
          "/value 0" +                    // 0 = Range (not All)
        "}" +
        "/parameter-7 {" +
          "/key 1936875886" +
          "/showInPalette 4294967295" +
          "/type (ustring)" +
          "/value [ " + (rangeHex.length / 2) + " " + rangeHex + " ]" +
        "}" +
      "}" +
    "}";

    var out = ["artboards=" + doc.artboards.length + "  exporting range '" + ARTBOARD + "'",
               "colorMdl=" + COLOR_MDL + "  aliasing=" + ALIASING];

    var tmp = new File(Folder.temp + "/ai_cmyk_jpeg.aia");
    if (!tmp.open("w")) return out.join("\n") + "\nCOULD NOT WRITE .aia";
    tmp.write(aia);
    tmp.close();

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    var t = new Date().getTime();
    try {
        app.loadAction(tmp);
        app.doScript("act1", "set1", false);
        out.push("doScript OK  " + ((new Date().getTime() - t) / 1000) + "s");
    } catch (e) {
        out.push("doScript FAILED: " + e.message);
    }
    try { app.unloadAction("set1", ""); } catch (e) { out.push("unloadAction: " + e.message); }
    try { tmp.remove(); } catch (e) {}
    app.userInteractionLevel = prevUI;
    out.push("doc left open, saved=" + doc.saved);
    return out.join("\n");
})();
""".replace("%AI%", r"E:\5XL-TESTING_WITH_JPEGS\5XL-TESTING_WITH_JPEGS\production_ready_order_5XL.ai".replace("\\", "\\\\")) \
   .replace("%OUT%", OUT.replace("\\", "\\\\")) \
   .replace("%COLOR_MDL%", COLOR_MDL) \
   .replace("%ALIASING%", ALIASING) \
   .replace("%ARTBOARD%", ARTBOARD)

t0 = time.time()
print(app.DoJavaScript(js))
print(f"[{time.time() - t0:.0f}s total]")
