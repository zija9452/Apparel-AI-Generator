"""Read-only: artboard rects of the order .ai, plus the top-level items on the
artboard the "-04" JPEG came from.

Illustrator names a multi-artboard export <file>-01.jpg, -02.jpg ... in artboard
ORDER, so -04 is the 4th artboard. Nothing here writes: the document is only
brought to the front, because a DOM read on a NON-active document costs ~125ms
against ~0.02ms active (see memory: jsx-name-index-dominates-runtime).
"""
import win32com.client

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var doc = null;
    for (var i = 0; i < app.documents.length; i++)
        if (app.documents[i].name === "production_ready_order_5XL.ai") doc = app.documents[i];
    if (!doc) return "ORDER DOC NOT OPEN";
    doc.activate();
    var out = ["artboards=" + doc.artboards.length, "space=" + doc.documentColorSpace];
    for (var a = 0; a < doc.artboards.length; a++) {
        var r = doc.artboards[a].artboardRect;   // [left, top, right, bottom] pt
        out.push("AB" + (a + 1) + " name=" + doc.artboards[a].name +
                 " rect=[" + r[0].toFixed(2) + "," + r[1].toFixed(2) + "," +
                 r[2].toFixed(2) + "," + r[3].toFixed(2) + "]" +
                 " w=" + (r[2] - r[0]).toFixed(2) + "pt h=" + (r[1] - r[3]).toFixed(2) + "pt" +
                 " px@300=" + Math.round((r[2] - r[0]) * 300 / 72) + "x" +
                 Math.round((r[1] - r[3]) * 300 / 72));
    }
    out.push("layers=" + doc.layers.length + "  topLevelItems=" + doc.pageItems.length);
    for (var L = 0; L < doc.layers.length; L++) {
        var ly = doc.layers[L];
        out.push("LAYER " + L + " '" + ly.name + "' items=" + ly.pageItems.length +
                 " opacity=" + ly.opacity + " blend=" + ly.blendingMode);
    }
    return out.join("\n");
})();
"""
print(app.DoJavaScript(js))
