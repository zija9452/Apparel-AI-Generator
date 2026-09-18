"""Read-only: which object edges land on the seam columns?

Pixel -> point, for a 300dpi export of artboard [left, top, right, bottom]:
    doc_x = left + px * 72/300
A seam produced by ARTWORK sits on an object edge in both renders. A seam
produced by RASTERIZATION does not have to sit on anything, and moves between
two renders of the same artboard - which is what the two exports already show
(manual seams at px 5229 and 7760, software at px 7795 and nothing at 5229).

Nothing is modified: bounds reads only, on the already-active document.
"""
import win32com.client

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var doc = null;
    for (var i = 0; i < app.documents.length; i++)
        if (app.documents[i].name === "production_ready_order_5XL.ai") doc = app.documents[i];
    if (!doc) return "ORDER DOC NOT OPEN";
    var r = doc.artboards[0].artboardRect;      // left, top, right, bottom
    var L = r[0], T = r[1], R = r[2], B = r[3];
    var PX = 72 / 300;                          // one export pixel, in points
    var targets = [
        { px: 5229, x: L + 5229 * PX },
        { px: 7760, x: L + 7760 * PX },
        { px: 7795, x: L + 7795 * PX }
    ];
    var TOL = 1.0;                              // ~4 export pixels
    var out = ["artboard L=" + L.toFixed(2) + " R=" + R.toFixed(2) +
               " T=" + T.toFixed(2) + " B=" + B.toFixed(2) + "  1px=" + PX.toFixed(4) + "pt"];
    for (var t = 0; t < targets.length; t++)
        out.push("target px=" + targets[t].px + " -> doc x=" + targets[t].x.toFixed(3));

    var scanned = 0, found = 0;
    function look(items, path, depth) {
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            scanned++;
            var gb = null;
            try { gb = it.geometricBounds; } catch (e) { continue; }
            var lo = gb[0], hi = gb[2];
            // Skip anything that does not even overlap the artboard band.
            if (hi < L - 2 || lo > R + 2) continue;
            for (var t = 0; t < targets.length; t++) {
                var x = targets[t].x;
                var edge = null;
                if (Math.abs(lo - x) <= TOL) edge = "LEFT";
                else if (Math.abs(hi - x) <= TOL) edge = "RIGHT";
                if (!edge) continue;
                found++;
                var extra = "";
                try { extra += " w=" + (hi - lo).toFixed(3) + "pt h=" + (gb[1] - gb[3]).toFixed(3) + "pt"; } catch (e) {}
                try { extra += " op=" + it.opacity + " blend=" + it.blendingMode; } catch (e) {}
                try { if (it.typename === "PathItem") extra += " stroked=" + it.stroked + " filled=" + it.filled + " sw=" + it.strokeWidth; } catch (e) {}
                try { if (it.typename === "GroupItem") extra += " clipped=" + it.clipped + " n=" + it.pageItems.length; } catch (e) {}
                out.push("px" + targets[t].px + " " + edge + "  " + it.typename +
                         " '" + (it.name || "") + "'" + extra +
                         "  bounds=[" + lo.toFixed(3) + "," + gb[1].toFixed(2) + "," +
                         hi.toFixed(3) + "," + gb[3].toFixed(2) + "]  @ " + path);
                if (found > 120) return true;
            }
            if (it.typename === "GroupItem" && depth < 12) {
                if (look(it.pageItems, path + "/" + (it.name || it.typename) + "[" + i + "]", depth + 1)) return true;
            }
        }
        return false;
    }
    for (var L2 = 0; L2 < doc.layers.length; L2++)
        if (look(doc.layers[L2].pageItems, "L:" + doc.layers[L2].name, 0)) break;

    out.push("scanned " + scanned + " items, " + found + " edge hit(s)");
    return out.join("\n");
})();
"""
print(app.DoJavaScript(js))
