/* Diff the .aia the SHIPPED function builds against the one that was verified.
 *
 * The job's renders came back RGB at 72dpi with an imagemap .html beside them -
 * Illustrator's DEFAULTS. The action ran (exportJpegViaAction returned true and
 * a file appeared), so the path/format/artboard parameters parsed; only the raw
 * settings blob was thrown away. Something in that text differs from the
 * standalone version that produced a pixel-perfect CMYK file.
 *
 * Runs the shipped function under stubs that capture what it would write.
 */
const fs = require("fs");
const path = require("path");

const JSX = path.join(__dirname, "..", "automate_production.jsx");

function extract(src, fname) {
  const start = src.indexOf("function " + fname + "(");
  if (start < 0) throw new Error("not found: " + fname);
  let i = src.indexOf("{", start), depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error("unbalanced " + fname);
}

const src = fs.readFileSync(JSX, "utf8");
let captured = null;

// Stubs. Folder.temp/fsName are strings; File.open records what gets written.
global.EXPORT_DPI = 300;
global.log = () => {};
global.Folder = function (p) {
  this.fsName = p; this.exists = true;
  this.create = () => true;
  this.getFiles = (mask) => (mask === "*.jpg" ? [{ copy: () => true, remove: () => {} }] : []);
  this.remove = () => true;
};
global.Folder.temp = "C:\\Temp";
global.File = function (p) {
  this.fsName = p; this.exists = false;
  this.open = () => true;
  this.write = (s) => { captured = s; };
  this.close = () => {};
  this.remove = () => true;
};
global.app = {
  loadAction: () => {}, unloadAction: () => {}, doScript: () => {},
};

eval(extract(src, "exportJpegViaAction"));
exportJpegViaAction({}, 0, "C:/out/5XL", "5XL3", "C:/out/5XL/5XL3.jpg");

const shipped = captured;

// The standalone version, rebuilt from export_jpeg_cmyk_action.py's template.
function toHex2(n) { return ("0" + n.toString(16)).slice(-2); }
function u16to8(cd) {
  if (cd < 0x80) return toHex2(cd);
  if (cd < 0x800) return toHex2((cd >> 6 & 0x1f) | 0xc0) + toHex2((cd & 0x3f) | 0x80);
  return toHex2((cd >> 12) | 0xe0) + toHex2((cd >> 6 & 0x3f) | 0x80) + toHex2((cd & 0x3f) | 0x80);
}
function hexStr(s) { let o = ""; for (let i = 0; i < s.length; i++) o += u16to8(s.charCodeAt(i)); return o; }
const outPath = "C:\\out\\5XL\\.jpg_cmyk_tmp\\5XL3.jpg";
const pathHex = hexStr(outPath), rangeHex = hexStr("1");
const verified = "" +
  "/version 3" + "/name [ 4 73657431 ]" + "/isOpen        0" + "/actionCount   1" +
  "/action-1 {" + "/name [ 4 61637431 ]" + "/keyIndex    1" + "/colorIndex  0" +
  "/isOpen      1" + "/eventCount  1" + "/event-1 {" + "/useRulersIn1stQuadrant 0" +
  "/internalName (adobe_exportDocument)" + "/localizedName [ 9 4578706f7274204173 ]" +
  "/isOpen          0" + "/isOn            1" + "/hasDialog       1" + "/showDialog      0" +
  "/parameterCount  7" + "/parameter-1 {" + "/key 1885434477" + "/showInPalette 0" +
  "/type (raw)" + "/value < 100 " +
  "06000000" + "01000000" + "03000000" + "02000000" + "00002c01" + "02000000" + "02000000" + "02000000" +
  "69006d00   61006700   65006d00   61007000   00000000   00000000   00000000   00000000" +
  "00000000   00000000   00000000   00000000   00000000   00000000   00000000   00000000" +
  "00000100" + ">" + "/size 100" + "}" +
  "/parameter-2 {" + "/key 1851878757" + "/showInPalette 4294967295" + "/type (ustring)" +
  "/value [ " + pathHex.length / 2 + " " + pathHex + "]" + "}" +
  "/parameter-3 {" + "/key 1718775156" + "/showInPalette 4294967295" + "/type (ustring)" +
  "/value [ 16 4a5045472066696c6520666f726d6174 ]" + "}" +
  "/parameter-4 {" + "/key 1702392942" + "/showInPalette 4294967295" + "/type (ustring)" +
  "/value [ 12 6a70672c6a70652c6a706567 ]" + "}" +
  "/parameter-5 {" + "/key 1936548194" + "/showInPalette 4294967295" + "/type (boolean)" + "/value 1" + "}" +
  "/parameter-6 {" + "/key 1935764588" + "/showInPalette 4294967295" + "/type (boolean)" + "/value 0" + "}" +
  "/parameter-7 {" + "/key 1936875886" + "/showInPalette 4294967295" + "/type (ustring)" +
  "/value [ " + rangeHex.length / 2 + " " + rangeHex + "]" + "}" + "}" + "}";

console.log("shipped  length:", shipped.length);
console.log("verified length:", verified.length);

// Show the settings blob from each - that is the parameter Illustrator dropped.
const blob = (s) => { const i = s.indexOf("/value < 100 "); return s.slice(i, s.indexOf(">", i) + 1); };
console.log("\nshipped  blob:", JSON.stringify(blob(shipped)));
console.log("\nverified blob:", JSON.stringify(blob(verified)));
console.log("\nblobs equal:", blob(shipped) === blob(verified));

// First divergence overall.
let k = 0;
while (k < Math.min(shipped.length, verified.length) && shipped[k] === verified[k]) k++;
console.log("\nfirst difference at char", k);
console.log("  shipped : ..." + JSON.stringify(shipped.slice(Math.max(0, k - 50), k + 70)));
console.log("  verified: ..." + JSON.stringify(verified.slice(Math.max(0, k - 50), k + 70)));
