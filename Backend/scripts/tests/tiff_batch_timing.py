"""Can the CMYK TIFF route export EVERY artboard in one call, and is it faster?

The TIFF route is the only verified way to a real CMYK file - its options
object genuinely carries imageColorSpace and resolution (asking for 300 moved
the output from the 150dpi default's 5115px to 10231px, which is proof the
object was read). Its problem is speed: ~105s for one big panel against ~55s
for the RGB JPEG it replaces.

But `saveMultipleArtboards` + an empty `artboardRange` renders ALL artboards in
a single exportFile, which is exactly what the operator does by hand when they
export three panels in one go. If the per-call overhead is what costs, one call
for N panels could land under N separate ones - possibly under the current RGB
path.

Timed against the real order document, not a bench file.
"""
import os
import time

import win32com.client
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

AI = r"C:\Production\CMYK_EXPORTING_TESTING\CMYK_EXPORTING_TESTING\production_ready_order_5XL.ai"
OUT = r"E:\seam_test\tiff_batch"
os.makedirs(OUT, exist_ok=True)

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var OUT = "%OUT%";
    var out = [];
    var doc = null;
    for (var i = 0; i < app.documents.length; i++)
        if (app.documents[i].name.indexOf("production_ready_order") !== -1) doc = app.documents[i];
    if (!doc) {
        var t0 = new Date().getTime();
        doc = app.open(new File("%AI%"));
        out.push("opened in " + ((new Date().getTime() - t0) / 1000) + "s");
    }
    doc.activate();
    out.push("artboards=" + doc.artboards.length);
    for (var a = 0; a < doc.artboards.length; a++) {
        var r = doc.artboards[a].artboardRect;
        out.push("  AB" + (a + 1) + " '" + doc.artboards[a].name + "' " +
                 Math.round((r[2] - r[0]) * 300 / 72) + "x" + Math.round((r[1] - r[3]) * 300 / 72));
    }

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    var o = new ExportOptionsTIFF();
    o.imageColorSpace = ImageColorSpace.CMYK;
    o.resolution = 300;
    o.antiAliasing = AntiAliasingMethod.ARTOPTIMIZED;
    o.lZWCompression = true;
    o.embedICCProfile = true;
    o.byteOrder = TIFFByteOrder.IBMPC;
    o.saveMultipleArtboards = true;
    o.artboardRange = "";            // empty = every artboard, one call

    var t = new Date().getTime();
    try {
        doc.exportFile(new File(OUT + "\\batch"), ExportType.TIFF, o);
        out.push("ALL artboards in ONE call: " + ((new Date().getTime() - t) / 1000) + "s");
    } catch (e) {
        out.push("batch TIFF FAILED: " + e.message);
    }

    app.userInteractionLevel = prevUI;
    return out.join("\n");
})();
""".replace("%OUT%", OUT.replace("\\", "\\\\")).replace("%AI%", AI.replace("\\", "\\\\"))

t0 = time.time()
print(app.DoJavaScript(js))
print(f"[{time.time() - t0:.0f}s wall]")

print("\n--- TIFFs written ---")
tot = 0
for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    mb = os.path.getsize(p) / 1e6
    tot += mb
    im = Image.open(p)
    print(f"  {f:38} {im.mode:5} {im.width}x{im.height:<6} {mb:7.1f}MB")
print(f"  peak disk for this order: {tot:.0f}MB")

print("\n--- TIFF -> CMYK JPEG ---")
t0 = time.time()
for f in sorted(os.listdir(OUT)):
    if not f.lower().endswith((".tif", ".tiff")):
        continue
    src = os.path.join(OUT, f)
    dst = os.path.splitext(src)[0] + ".jpg"
    im = Image.open(src)
    im.save(dst, "JPEG", quality=50, dpi=(300, 300), progressive=False)
    print(f"  {f} -> {os.path.basename(dst)}  {os.path.getsize(dst)/1e6:.1f}MB  {im.mode}")
print(f"  conversion total: {time.time() - t0:.0f}s")
