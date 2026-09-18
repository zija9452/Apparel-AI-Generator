"""Enumerate EVERY export/capture option class this Illustrator exposes and
reflect its real properties.

Two dead ends so far - ExportOptionsJPEG has no colour property, and the Export
As action ignores its own parameters - were both found by asking one object one
question. This asks every object at once: if any scriptable path in Illustrator
19.0.0 can name a colour model for a raster output, it will show up here as a
property that actually exists on the object rather than one that can be
assigned and read back.

`reflect.properties` is the authority. A property that is merely assignable is
worthless: that is exactly how imageColorSpace fooled this codebase for months.
"""
import win32com.client

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var NAMES = [
        "ExportOptionsJPEG", "ExportOptionsPNG8", "ExportOptionsPNG24",
        "ExportOptionsGIF", "ExportOptionsTIFF", "ExportOptionsPhotoshop",
        "ExportOptionsFlash", "ExportOptionsSVG", "ExportOptionsAutoCAD",
        "ExportOptionsWebOptimizedSVG", "ExportForScreensOptionsJPEG",
        "ExportForScreensOptionsPNG8", "ExportForScreensOptionsPNG24",
        "ExportForScreensOptionsWebOptimizedSVG", "ImageCaptureOptions",
        "RasterizeOptions", "PDFSaveOptions", "EPSSaveOptions",
        "IllustratorSaveOptions", "PrintOptions", "PrintColorManagementOptions"
    ];
    var out = [];
    var hits = [];
    for (var i = 0; i < NAMES.length; i++) {
        var n = NAMES[i];
        var obj = null;
        try { obj = new (eval(n))(); } catch (e) { out.push("  " + n + " : not available"); continue; }
        var props = obj.reflect.properties;
        var list = [];
        for (var p = 0; p < props.length; p++) {
            var pn = String(props[p].name);
            if (pn === "__proto__") continue;
            list.push(pn);
            if (/color|space|model|cmyk|rgb/i.test(pn)) hits.push(n + "." + pn);
        }
        list.sort();
        out.push("  " + n + " (" + list.length + "): " + list.join(", "));
    }
    out.unshift("=== colour-related properties that REALLY exist ===\n  " +
                (hits.length ? hits.join("\n  ") : "(none)") +
                "\n\n=== full property lists ===");

    // Does the document expose an imageCapture method at all?
    try {
        var d = app.documents.length ? app.activeDocument : null;
        out.push("\ndocument.imageCapture available: " +
                 (d ? (typeof d.imageCapture) : "(no document open to test)"));
    } catch (e) { out.push("\nimageCapture probe failed: " + e.message); }

    return out.join("\n");
})();
"""
print(app.DoJavaScript(js))
