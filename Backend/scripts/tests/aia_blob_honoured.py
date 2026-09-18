"""Is the raw settings blob honoured at all, or is Illustrator using remembered
Export As settings?

Every CMYK result so far is ambiguous. The Export As dialog remembers its last
used settings, and this Illustrator session has had CMYK/300 set repeatedly -
by the operator's manual exports and by every action run since. So "the action
produced CMYK" does not prove the blob did anything; it is equally consistent
with the blob being discarded and the remembered setting being used. The job
got a fresh Illustrator with nothing remembered, and produced RGB at 72dpi.

Discriminator that needs no restart: ASK FOR SOMETHING DIFFERENT.
  colorMdl=1 + res=150  -> if the blob is honoured, the file must come back
                           RGB at 150dpi, against the remembered CMYK/300.
                        -> if it comes back CMYK/300, the blob is ignored.
Then ask for CMYK/300 again to confirm the channel still works both ways.
"""
import os

import win32com.client
from PIL import Image

OUT = r"E:\seam_test\aia_honour"
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
    function le32(n) { var o = ""; for (var i = 0; i < 4; i++) { o += toHex2(n % 256); n = Math.floor(n / 256); } return o; }

    function buildAia(outPath, colorMdl, dpi) {
        var blob = le32(6) + le32(1) + le32(3) + le32(2) + le32(dpi * 65536) +
                   le32(colorMdl) + le32(2) + le32(2) +
                   "69006d00   61006700   65006d00   61007000   00000000   00000000   00000000   00000000" +
                   "00000000   00000000   00000000   00000000   00000000   00000000   00000000   00000000" +
                   "00000100";
        return "/version 3/name " + strParam("probe_set") + "/isOpen        0/actionCount   1" +
               "/action-1 {/name " + strParam("probe_act") + "/keyIndex    1/colorIndex  0" +
               "/isOpen      1/eventCount  1/event-1 {/useRulersIn1stQuadrant 0" +
               "/internalName (adobe_exportDocument)/localizedName [ 9 4578706f7274204173 ]" +
               "/isOpen          0/isOn            1/hasDialog       1/showDialog      0" +
               "/parameterCount  7" +
               "/parameter-1 {/key 1885434477/showInPalette 0/type (raw)/value < 100 " + blob + ">/size 100}" +
               "/parameter-2 {/key 1851878757/showInPalette 4294967295/type (ustring)/value " + strParam(outPath) + "}" +
               "/parameter-3 {/key 1718775156/showInPalette 4294967295/type (ustring)/value [ 16 4a5045472066696c6520666f726d6174 ]}" +
               "/parameter-4 {/key 1702392942/showInPalette 4294967295/type (ustring)/value [ 12 6a70672c6a70652c6a706567 ]}" +
               "/parameter-5 {/key 1936548194/showInPalette 4294967295/type (boolean)/value 1}" +
               "/parameter-6 {/key 1935764588/showInPalette 4294967295/type (boolean)/value 0}" +
               "/parameter-7 {/key 1936875886/showInPalette 4294967295/type (ustring)/value " + strParam("1") + "}" +
               "}}";
    }

    var doc = app.documents.add(DocumentColorSpace.CMYK, 200, 200);
    var r = doc.pathItems.rectangle(180, 20, 160, 160);
    var c = new CMYKColor(); c.cyan = 0; c.magenta = 90; c.yellow = 10; c.black = 0;
    r.filled = true; r.fillColor = c; r.stroked = false;

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    function run(tag, colorMdl, dpi) {
        var tmp = new File(Folder.temp + "/probe_" + tag + ".aia");
        tmp.open("w"); tmp.write(buildAia(OUT + "\\" + tag + ".jpg", colorMdl, dpi)); tmp.close();
        try { app.unloadAction("probe_set", ""); } catch (e0) {}
        try {
            app.loadAction(tmp);
            app.doScript("probe_act", "probe_set", false);
            results.push(tag + " asked colorMdl=" + colorMdl + " dpi=" + dpi + " -> doScript ok");
        } catch (e) { results.push(tag + " FAILED " + e.message); }
        try { app.unloadAction("probe_set", ""); } catch (e1) {}
        try { tmp.remove(); } catch (e2) {}
    }

    run("ask_RGB_150", 1, 150);
    run("ask_CMYK_300", 2, 300);
    run("ask_GRAY_200", 3, 200);

    app.userInteractionLevel = prevUI;
    doc.close(SaveOptions.DONOTSAVECHANGES);
    return results.join("\n");
})();
""".replace("%OUT%", OUT.replace("\\", "\\\\"))

print(app.DoJavaScript(js))

print("\n--- what landed (200pt square) ---")
print("   expected if blob honoured: RGB 625px / CMYK 833px / L 555px")
for f in sorted(os.listdir(OUT)):
    if not f.lower().endswith(".jpg"):
        continue
    im = Image.open(os.path.join(OUT, f))
    print(f"   {f:22} {im.mode:5} {im.width}x{im.height}")
