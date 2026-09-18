"""Render the SAME artboard several ways and see whether the hairline moves.

The question this settles: is the blue hairline in the artwork, or is it made by
the rasteriser? Artwork lands on the same document coordinate in every render.
A rasterisation artifact does not - it follows the pixel grid and the
anti-alias setting.

  A  JPEG 416.667%  antiAliasing=true    <- exactly what the job ships today
  B  JPEG 416.667%  antiAliasing=false
  C  TIFF CMYK 300dpi antiAliasing=true  <- the only scriptable CMYK path
  D  TIFF CMYK 300dpi antiAliasing=false

exportFile renders, it never edits. The document is opened here if it is not
already open and is LEFT OPEN afterwards - per memory
illustrator-com-never-close-open-docs, closing is how unsaved work dies.

Usage: seam_export_matrix.py [ABCD]
"""
import sys
import time

import win32com.client

AI = r"E:\5XL-TESTING_WITH_JPEGS\5XL-TESTING_WITH_JPEGS\production_ready_order_5XL.ai"
OUT = r"E:\seam_test"
PANEL = "5XL Back_Item1"
WHICH = (sys.argv[1] if len(sys.argv) > 1 else "AB").upper()

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var AI = "%AI%", OUT = "%OUT%", PANEL = "%PANEL%", WHICH = "%WHICH%";
    var f = new Folder(OUT); if (!f.exists) f.create();
    var out = [];

    var doc = null;
    for (var i = 0; i < app.documents.length; i++)
        if (app.documents[i].name.indexOf("production_ready_order_5XL.ai") !== -1) doc = app.documents[i];
    if (!doc) {
        var t0 = new Date().getTime();
        doc = app.open(new File(AI));
        out.push("opened " + doc.name + " in " + ((new Date().getTime() - t0) / 1000) + "s");
    } else {
        out.push("reusing already-open " + doc.name + " (saved=" + doc.saved + ")");
    }
    doc.activate();

    var prevUI = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    out.push("artboards=" + doc.artboards.length + "  space=" + doc.documentColorSpace);
    var idx = -1;
    for (var a = 0; a < doc.artboards.length; a++) {
        var r = doc.artboards[a].artboardRect;
        out.push("  AB" + (a + 1) + " '" + doc.artboards[a].name + "' " +
                 Math.round((r[2] - r[0]) * 300 / 72) + "x" + Math.round((r[1] - r[3]) * 300 / 72) + "px" +
                 " left=" + r[0].toFixed(2) + " top=" + r[1].toFixed(2));
        if (doc.artboards[a].name === PANEL) idx = a;
    }
    if (idx < 0) { app.userInteractionLevel = prevUI; return out.join("\n") + "\nPANEL NOT FOUND: " + PANEL; }
    doc.artboards.setActiveArtboardIndex(idx);
    out.push("active artboard = AB" + (idx + 1) + " '" + PANEL + "'");
    try { out.push("rasterEffectSettings.resolution = " + doc.rasterEffectSettings.resolution + " ppi"); } catch (e) {}

    function jpg(tag, aa) {
        var t = new Date().getTime();
        var o = new ExportOptionsJPEG();
        o.artBoardClipping = true;
        o.antiAliasing = aa;
        o.horizontalScale = 300 / 72 * 100;
        o.verticalScale = 300 / 72 * 100;
        o.qualitySetting = 50;
        o.optimization = false;
        try {
            doc.exportFile(new File(OUT + "\\" + tag + ".jpg"), ExportType.JPEG, o);
            out.push(tag + "  JPEG aa=" + aa + "  OK  " + ((new Date().getTime() - t) / 1000) + "s");
        } catch (e) { out.push(tag + "  JPEG aa=" + aa + "  FAILED  " + e.message); }
    }

    function tif(tag, aa) {
        var t = new Date().getTime();
        var o = new ExportOptionsTIFF();
        o.imageColorSpace = ImageColorSpace.CMYK;
        o.resolution = 300;                  // TIFF exposes a REAL dpi property
        // TIFF's antiAliasing is an AntiAliasingMethod ENUM, not the boolean
        // ExportOptionsJPEG takes. Handing it true/false is what raised
        // "Enumerated value expected". if/else, not a ternary - see memory
        // extendscript-chained-ternary-trap.
        if (aa === "art") o.antiAliasing = AntiAliasingMethod.ARTOPTIMIZED;
        else if (aa === "type") o.antiAliasing = AntiAliasingMethod.TYPEOPTIMIZED;
        else o.antiAliasing = AntiAliasingMethod.None;
        o.lZWCompression = true;
        o.embedICCProfile = true;
        // Required, not optional: leaving byteOrder at its default makes
        // exportFile raise "Enumerated value expected" before writing anything.
        o.byteOrder = TIFFByteOrder.IBMPC;
        // TIFF has no artBoardClipping: one artboard is picked by 1-based range.
        o.saveMultipleArtboards = true;
        o.artboardRange = String(idx + 1);
        out.push(tag + "  asked space=" + o.imageColorSpace + " res=" + o.resolution +
                 "  (property really exists = " + ("imageColorSpace" in o) + ")");
        try {
            doc.exportFile(new File(OUT + "\\" + tag), ExportType.TIFF, o);
            out.push(tag + "  TIFF aa=" + aa + "  OK  " + ((new Date().getTime() - t) / 1000) + "s");
        } catch (e) { out.push(tag + "  TIFF aa=" + aa + "  FAILED  " + e.message); }
    }

    // PSD is the other scriptable CMYK raster path. Worth timing against TIFF:
    // the TIFF took 296s against the JPEG's 100s, and if that 3x holds it
    // decides whether the CMYK route is usable on a full order.
    function psd(tag) {
        var t = new Date().getTime();
        var o = new ExportOptionsPhotoshop();
        o.imageColorSpace = ImageColorSpace.CMYK;
        o.resolution = 300;
        o.antiAliasing = AntiAliasingMethod.ARTOPTIMIZED;
        o.embedICCProfile = true;
        o.editableText = false;
        o.maximumEditability = false;   // flat raster, not a layered rebuild
        o.writeLayers = false;
        o.saveMultipleArtboards = true;
        o.artboardRange = String(idx + 1);
        try {
            doc.exportFile(new File(OUT + "\\" + tag), ExportType.PHOTOSHOP, o);
            out.push(tag + "  PSD CMYK  OK  " + ((new Date().getTime() - t) / 1000) + "s");
        } catch (e) { out.push(tag + "  PSD CMYK  FAILED  " + e.message); }
    }

    if (WHICH.indexOf("P") !== -1) psd("P_psd_cmyk");
    if (WHICH.indexOf("A") !== -1) jpg("A_jpeg_aa_on", true);
    if (WHICH.indexOf("B") !== -1) jpg("B_jpeg_aa_off", false);
    if (WHICH.indexOf("C") !== -1) tif("C_tiff_cmyk_aa_on", "art");
    if (WHICH.indexOf("D") !== -1) tif("D_tiff_cmyk_aa_off", "none");
    // The Export dialog's third anti-alias choice. "Type Optimized (Hinted)"
    // snaps edges to the pixel grid, which is a documented way to open a 1px
    // gap between shapes that meet exactly - the shape of the hairline in the
    // operator's manual export. If this render seams at x=5229 and the ART
    // render does not, the dialog setting is the whole cause.
    if (WHICH.indexOf("T") !== -1) tif("T_tiff_cmyk_type_opt", "type");

    app.userInteractionLevel = prevUI;
    out.push("left open, not saved, not closed by this script (saved=" + doc.saved + ")");
    return out.join("\n");
})();
""".replace("%AI%", AI.replace("\\", "\\\\")) \
   .replace("%OUT%", OUT.replace("\\", "\\\\")) \
   .replace("%PANEL%", PANEL) \
   .replace("%WHICH%", WHICH)

t0 = time.time()
print(app.DoJavaScript(js))
print(f"[{time.time() - t0:.0f}s total]")
