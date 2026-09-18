"""Read-only probe: what is open in Illustrator right now?

Runs BEFORE anything touches the order .ai. Per docs/ILLUSTRATOR_COM.md the job
never closes a document it did not open, so the first thing to establish is
whether the user has unsaved work in the app.
"""
import win32com.client

app = win32com.client.GetActiveObject("Illustrator.Application")
js = r"""
(function () {
    var out = ["docs=" + app.documents.length];
    for (var i = 0; i < app.documents.length; i++) {
        var d = app.documents[i];
        var saved = "?";
        try { saved = d.saved ? "saved" : "UNSAVED"; } catch (e) {}
        var p = "";
        try { p = d.fullName.fsName; } catch (e) { p = "(never saved)"; }
        out.push(i + " | " + d.name + " | " + saved + " | " + p +
                 " | artboards=" + d.artboards.length +
                 " | space=" + d.documentColorSpace);
    }
    try { out.push("version=" + app.version); } catch (e) {}
    return out.join("\n");
})();
"""
print(app.DoJavaScript(js))
