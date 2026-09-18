"""Read-only: does ExportOptionsJPEG actually HAVE a colour-space property?

automate_production.jsx:11323 sets `opt.imageColorSpace = ImageColorSpace.CMYK`
and every rendered JPG still comes out RGB, with no error logged. Either the
assignment is silently dropped or it is honoured and something later undoes it.
ExtendScript exposes a host object's real property list through `reflect`, so
the question is answerable without exporting anything.

Also reflects ExportOptionsTIFF / ExportOptionsPhotoshop, the two export paths
that are documented to carry a colour space, to see what this build offers.
"""
import win32com.client

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var out = ["illustrator version=" + app.version];

    function reflectOf(label, maker) {
        try {
            var o = maker();
            var props = o.reflect.properties;
            var names = [];
            for (var i = 0; i < props.length; i++) names.push(String(props[i].name));
            names.sort();
            out.push("\n" + label + " properties (" + names.length + "):\n  " + names.join(", "));
            return o;
        } catch (e) {
            out.push("\n" + label + " -> could not construct: " + e.message);
            return null;
        }
    }

    var jpg = reflectOf("ExportOptionsJPEG", function () { return new ExportOptionsJPEG(); });
    if (jpg) {
        out.push("  'imageColorSpace' in obj        : " + ("imageColorSpace" in jpg));
        out.push("  reads back BEFORE set           : " + jpg.imageColorSpace);
        try {
            jpg.imageColorSpace = ImageColorSpace.CMYK;
            out.push("  assignment threw                : no");
        } catch (e) {
            out.push("  assignment threw                : YES - " + e.message);
        }
        out.push("  reads back AFTER set to CMYK    : " + jpg.imageColorSpace);
        out.push("  (ImageColorSpace.CMYK itself    : " + ImageColorSpace.CMYK + ")");
    }

    reflectOf("ExportOptionsTIFF", function () { return new ExportOptionsTIFF(); });
    reflectOf("ExportOptionsPhotoshop", function () { return new ExportOptionsPhotoshop(); });
    reflectOf("ExportOptionsPNG24", function () { return new ExportOptionsPNG24(); });

    // Flattener / raster context, for the hairline question.
    try {
        var doc = null;
        for (var i = 0; i < app.documents.length; i++)
            if (app.documents[i].name === "production_ready_order_5XL.ai") doc = app.documents[i];
        if (doc) {
            out.push("\norder doc rasterEffectSettings.resolution = " +
                     doc.rasterEffectSettings.resolution + " ppi");
            out.push("order doc colour space = " + doc.documentColorSpace);
        }
    } catch (e) { out.push("\nraster settings read failed: " + e.message); }

    return out.join("\n");
})();
"""
print(app.DoJavaScript(js))
