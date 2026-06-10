// Simplified JSON Polyfill for Adobe Illustrator
if (typeof JSON !== "object") {
    JSON = {};
}

if (typeof JSON.stringify !== "function") {
    JSON.stringify = function(obj) {
        var t = typeof (obj);
        if (t !== "object" || obj === null) {
            if (t === "string") obj = '"' + obj + '"';
            return String(obj);
        } else {
            var n, v, json = [], arr = (obj && obj.constructor === Array);
            for (n in obj) {
                v = obj[n];
                t = typeof (v);
                if (t === "string") v = '"' + v + '"';
                else if (t === "object" && v !== null) v = JSON.stringify(v);
                json.push((arr ? "" : '"' + n + '":') + String(v));
            }
            return (arr ? "[" : "{") + String(json) + (arr ? "]" : "}");
        }
    };
}

if (typeof JSON.parse !== "function") {
    JSON.parse = function(str) {
        if (str === "") str = '""';
        var obj;
        eval("obj = " + str + ";");
        return obj;
    };
}