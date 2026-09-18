"""Open the order document in Illustrator and leave it there.

Opening only - never closes, never saves. The operator records the Export As
action on this document next, and a 239MB file takes about a minute to load, so
it is opened here rather than making them wait on a click.
"""
import sys
import time

import win32com.client

AI = (sys.argv[1] if len(sys.argv) > 1 else
      r"C:\Production\CMYK_EXPORTING_TESTING\CMYK_EXPORTING_TESTING\production_ready_order_5XL.ai")

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var AI = "%AI%";
    for (var i = 0; i < app.documents.length; i++)
        if (app.documents[i].fullName.fsName === AI)
            return "already open: " + app.documents[i].name +
                   "  artboards=" + app.documents[i].artboards.length +
                   "  space=" + app.documents[i].documentColorSpace;
    var t = new Date().getTime();
    var doc = app.open(new File(AI));
    doc.activate();
    return "opened " + doc.name + " in " + ((new Date().getTime() - t) / 1000) + "s" +
           "\n  artboards=" + doc.artboards.length +
           "\n  colour space=" + doc.documentColorSpace;
})();
""".replace("%AI%", AI.replace("\\", "\\\\"))

t0 = time.time()
print(app.DoJavaScript(js))
print(f"[{time.time() - t0:.0f}s]")
