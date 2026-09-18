"""Why did the exact-name lookup for the order doc start failing?

Two probes found `production_ready_order_5XL.ai` by `=== name`; two others got
"ORDER DOC NOT OPEN" minutes later against the same three open documents. Print
the names with character codes so an invisible difference cannot hide.
"""
import win32com.client

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var o = [];
    for (var i = 0; i < app.documents.length; i++) {
        var n = app.documents[i].name;
        var codes = [];
        for (var k = 0; k < n.length; k++) codes.push(n.charCodeAt(k));
        o.push(i + "  name=[" + n + "]  len=" + n.length +
               "  exactMatch=" + (n === "production_ready_order_5XL.ai") +
               "  codes=" + codes.join(","));
    }
    try { o.push("activeDocument=" + app.activeDocument.name); } catch (e) { o.push("activeDocument read failed: " + e.message); }
    return o.join("\n");
})();
"""
print(app.DoJavaScript(js))
