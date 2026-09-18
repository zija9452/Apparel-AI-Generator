"""Verify the two remaining CMYK-capable routes by CHANGING what we ask for.

Three CMYK results in this investigation turned out to prove nothing, because
the machine was already in a CMYK state and would have produced CMYK whatever
was asked. The only honest test is to ask for RGB, CMYK and Grayscale in turn
and require the output to follow each time.

This Illustrator session is factory-fresh - restarted, its export dialog never
opened - which is exactly the state a job runs in and the state that produced
RGB/72dpi from the action route.

Resolution is checked the same way: 150 and 300 must yield different pixel
counts on a 200pt artboard (417 vs 833), not just a different number in a
header.
"""
import os
import time

import win32com.client
from PIL import Image

OUT = r"E:\seam_test\verify_routes"
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var OUT = "%OUT%";
    var out = [];
    out.push("session prefs (should be irrelevant if the options object works):" +
             " JPEG ColorModel=" + app.preferences.getIntegerPreference("plugin/JPEGFormat/ColorModel") +
             ", TIFF ColorModel=" + app.preferences.getIntegerPreference("plugin/TIFFFileFormat/ColorModel"));

    var doc = app.documents.add(DocumentColorSpace.CMYK, 200, 200);
    var r = doc.pathItems.rectangle(180, 20, 160, 160);
    var c = new CMYKColor(); c.cyan = 0; c.magenta = 90; c.yellow = 10; c.black = 0;
    r.filled = true; r.fillColor = c; r.stroked = false;

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    function tif(tag, space, dpi) {
        var t = new Date().getTime();
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
            out.push(tag + ": ok " + ((new Date().getTime() - t) / 1000) + "s");
        } catch (e) { out.push(tag + ": FAILED " + e.message); }
    }

    function psd(tag, space, dpi) {
        var t = new Date().getTime();
        var o = new ExportOptionsPhotoshop();
        o.imageColorSpace = space;
        o.resolution = dpi;
        // PSD's antiAliasing is a BOOLEAN, unlike TIFF's AntiAliasingMethod
        // enum - passing the enum here is what raised "Boolean value expected".
        o.antiAliasing = true;
        o.embedICCProfile = true;
        o.editableText = false;
        o.maximumEditability = false;
        o.writeLayers = false;
        o.saveMultipleArtboards = true;
        o.artboardRange = "1";
        try {
            doc.exportFile(new File(OUT + "\\" + tag), ExportType.PHOTOSHOP, o);
            out.push(tag + ": ok " + ((new Date().getTime() - t) / 1000) + "s");
        } catch (e) { out.push(tag + ": FAILED " + e.message); }
    }

    tif("T1_rgb150",  ImageColorSpace.RGB,       150);
    tif("T2_cmyk300", ImageColorSpace.CMYK,      300);
    tif("T3_gray300", ImageColorSpace.GrayScale, 300);
    psd("P1_rgb150",  ImageColorSpace.RGB,       150);
    psd("P2_cmyk300", ImageColorSpace.CMYK,      300);
    psd("P3_gray300", ImageColorSpace.GrayScale, 300);

    app.userInteractionLevel = prevUI;
    doc.close(SaveOptions.DONOTSAVECHANGES);
    return out.join("\n");
})();
""".replace("%OUT%", OUT.replace("\\", "\\\\"))

print(app.DoJavaScript(js))

WANT = {
    "T1_rgb150":  ("RGB",  417), "T2_cmyk300": ("CMYK", 833), "T3_gray300": ("L", 833),
    "P1_rgb150":  ("RGB",  417), "P2_cmyk300": ("CMYK", 833), "P3_gray300": ("L", 833),
}
print(f"\n--- results (200pt square) ---")
print(f"{'file':34} {'got':6} {'px':>10}  {'wanted':10} verdict")
all_ok = {}
for f in sorted(os.listdir(OUT)):
    tag = next((k for k in WANT if f.startswith(k)), None)
    if tag is None:
        continue
    try:
        im = Image.open(os.path.join(OUT, f))
    except Exception as e:
        print(f"{f:34} unreadable: {e}")
        continue
    mode, px = WANT[tag]
    good = im.mode == mode and abs(im.width - px) <= 2
    all_ok[tag[0]] = all_ok.get(tag[0], True) and good
    print(f"{f:34} {im.mode:6} {im.width}x{im.height:<6}  {mode:4}/{px:<5} "
          f"{'OK' if good else 'MISMATCH'}")

print()
for k, name in (("T", "TIFF"), ("P", "PSD")):
    if k in all_ok:
        print(f"  {name}: {'options ARE honoured - route is real' if all_ok[k] else 'NOT honoured'}")
