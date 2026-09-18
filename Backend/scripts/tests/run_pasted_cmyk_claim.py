"""Run the pasted exportCMYK300DPIJPEG() verbatim and report what lands.

The suggestion is that ExportOptionsJPEG.imageColorSpace = ImageColorSpace.CMYK
produces a CMYK JPEG. That is the exact code that was already at
automate_production.jsx:11323 and shipped RGB for months, so rather than argue
it, run it unchanged on the operator's own document and read the result's
colour space off the file.

The function body below is copied CHARACTER FOR CHARACTER from the suggestion -
no edits, no extra options - so the outcome cannot be blamed on a rewrite. Only
the document lookup and a couple of report lines are added around it.
"""
import os

import win32com.client
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

AI = r"C:\Production\CMYK_EXPORTING_TESTING\CMYK_EXPORTING_TESTING\production_ready_order_5XL.ai"
OUT = r"E:\seam_test\pasted_claim"
os.makedirs(OUT, exist_ok=True)
TARGET = os.path.join(OUT, "pasted.jpg")
if os.path.exists(TARGET):
    os.remove(TARGET)

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    // ---- pasted function, verbatim ----------------------------------------
    function exportCMYK300DPIJPEG(destFilePath) {
        if (app.documents.length === 0) return;

        var doc = app.activeDocument;
        var options = new ExportOptionsJPEG();

        // Set quality to maximum (100)
        options.qualitySetting = 100;

        // 300 DPI scaling calculation: (300 DPI / 72 DPI base) * 100 = 416.666%
        options.horizontalScale = 416.67;
        options.verticalScale = 416.67;

        // Enable artboard clipping to match artboard bounds
        options.artBoardClipping = true;
        options.antiAliasing = true;

        // Set color space to CMYK
        options.imageColorSpace = ImageColorSpace.CMYK;

        var fileSpec = new File(destFilePath);
        doc.exportFile(fileSpec, ExportType.JPEG, options);
    }
    // ---- end pasted function ----------------------------------------------

    var doc = null;
    for (var i = 0; i < app.documents.length; i++)
        if (app.documents[i].name.indexOf("production_ready_order") !== -1) doc = app.documents[i];
    if (!doc) doc = app.open(new File("%AI%"));
    doc.activate();
    doc.artboards.setActiveArtboardIndex(0);

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    // What the options object itself says, before the export runs.
    var probe = new ExportOptionsJPEG();
    var before = String(probe.imageColorSpace);
    probe.imageColorSpace = ImageColorSpace.CMYK;
    var report = "document colour space   : " + doc.documentColorSpace +
                 "\nproperty exists on options? " + ("imageColorSpace" in probe) +
                 "\nreads back before setting : " + before +
                 "\nreads back after  setting : " + probe.imageColorSpace;

    var t = new Date().getTime();
    exportCMYK300DPIJPEG("%TARGET%");
    report += "\nexport took               : " + ((new Date().getTime() - t) / 1000) + "s";

    app.userInteractionLevel = prevUI;
    return report;
})();
""".replace("%AI%", AI.replace("\\", "\\\\")).replace("%TARGET%", TARGET.replace("\\", "\\\\"))

print(app.DoJavaScript(js))

print("\n--- what actually landed on disk ---")
if not os.path.exists(TARGET):
    print("  no file written")
else:
    im = Image.open(TARGET)
    print(f"  {os.path.basename(TARGET)}   mode = {im.mode}   {im.width}x{im.height}   "
          f"{os.path.getsize(TARGET)/1e6:.1f}MB")
    print()
    print("  VERDICT:", "CMYK - the suggestion works" if im.mode == "CMYK"
          else f"{im.mode} - the document is CMYK, the option read back as CMYK, "
               "and the file is still not CMYK")
