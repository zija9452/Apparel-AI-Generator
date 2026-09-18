"""Is the TIFF route real, or another session artifact?

Twice now a CMYK result has meant nothing: the action route produced CMYK only
because a human had used the Export As dialog earlier in that session. The TIFF
route was verified in exactly such a session, so it has to be re-checked the
only way that proves anything - by asking for DIFFERENT things and seeing the
output follow.

This session is factory-fresh: Illustrator was just restarted and its export
dialog has never been opened, which is precisely the state a job runs in. If
TIFF answers RGB to RGB and CMYK to CMYK here, the option object is genuinely
driving it and the route is sound.

Resolution is checked the same way - 150 and 300 must give different pixel
counts, not just a number in a header.
"""
import os

import win32com.client
from PIL import Image

OUT = r"E:\seam_test\tiff_discriminate"
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var OUT = "%OUT%";
    var out = [];
    out.push("session prefs: JPEG ColorModel=" +
             app.preferences.getIntegerPreference("plugin/JPEGFormat/ColorModel") +
             "  TIFF ColorModel=" +
             app.preferences.getIntegerPreference("plugin/TIFFFileFormat/ColorModel"));

    var doc = app.documents.add(DocumentColorSpace.CMYK, 200, 200);
    var r = doc.pathItems.rectangle(180, 20, 160, 160);
    var c = new CMYKColor(); c.cyan = 0; c.magenta = 90; c.yellow = 10; c.black = 0;
    r.filled = true; r.fillColor = c; r.stroked = false;

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    function tif(tag, space, dpi) {
        var o = new ExportOptionsTIFF();
        o.imageColorSpace = space;
        o.resolution = dpi;
        o.antiAliasing = AntiAliasingMethod.ARTOPTIMIZED;
        o.lZWCompression = true;
        o.byteOrder = TIFFByteOrder.IBMPC;
        o.saveMultipleArtboards = true;
        o.artboardRange = "1";
        try {
            doc.exportFile(new File(OUT + "\\" + tag), ExportType.TIFF, o);
            out.push(tag + ": asked " + space + " @" + dpi + " -> written");
        } catch (e) { out.push(tag + ": FAILED " + e.message); }
    }

    tif("A_rgb150",  ImageColorSpace.RGB,       150);
    tif("B_cmyk300", ImageColorSpace.CMYK,      300);
    tif("C_gray300", ImageColorSpace.GrayScale, 300);

    app.userInteractionLevel = prevUI;
    doc.close(SaveOptions.DONOTSAVECHANGES);
    return out.join("\n");
})();
""".replace("%OUT%", OUT.replace("\\", "\\\\"))

print(app.DoJavaScript(js))

print("\n--- result (200pt square) ---")
print("   expected if the options object is honoured:")
print("     A_rgb150   RGB  417x417")
print("     B_cmyk300  CMYK 833x833")
print("     C_gray300  L    833x833")
ok = True
want = {"A_rgb150": ("RGB", 417), "B_cmyk300": ("CMYK", 833), "C_gray300": ("L", 833)}
for f in sorted(os.listdir(OUT)):
    im = Image.open(os.path.join(OUT, f))
    key = f.split("_5XL")[0].split(".")[0]
    for k, (mode, px) in want.items():
        if f.startswith(k):
            good = im.mode == mode and abs(im.width - px) <= 2
            ok &= good
            print(f"   {f:34} {im.mode:5} {im.width}x{im.height}  "
                  f"{'OK' if good else '<-- MISMATCH'}")
            break
    else:
        print(f"   {f:34} {im.mode:5} {im.width}x{im.height}")

print("\n   VERDICT:", "TIFF options ARE honoured - the route is real"
      if ok else "TIFF options not honoured either")
