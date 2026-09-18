"""Which ExportOptionsTIFF property wants an enum?

`exportFile` keeps raising "Enumerated value expected" and names nothing, so
print every property's DEFAULT value and type. A property whose default already
prints as `SomeEnum.VALUE` is enum-typed, and the boolean we assigned to it is
what the exporter is rejecting.
"""
import win32com.client

app = win32com.client.GetActiveObject("Illustrator.Application")

js = r"""
(function () {
    var out = [];
    var o = new ExportOptionsTIFF();
    var props = o.reflect.properties;
    for (var i = 0; i < props.length; i++) {
        var n = String(props[i].name);
        if (n === "__proto__") continue;
        var v, t;
        try { v = o[n]; t = typeof v; } catch (e) { v = "<read failed: " + e.message + ">"; t = "?"; }
        out.push("  " + n + " = " + v + "   (typeof " + t + ")");
    }
    out.push("\nAntiAliasingMethod enum members:");
    try {
        out.push("  None=" + AntiAliasingMethod.None +
                 "  ARTOPTIMIZED=" + AntiAliasingMethod.ARTOPTIMIZED +
                 "  TYPEOPTIMIZED=" + AntiAliasingMethod.TYPEOPTIMIZED);
    } catch (e) { out.push("  AntiAliasingMethod not available: " + e.message); }
    out.push("TIFFByteOrder: IBMPC=" + TIFFByteOrder.IBMPC + " MACINTOSH=" + TIFFByteOrder.MACINTOSH);
    return out.join("\n");
})();
"""
print(app.DoJavaScript(js))
