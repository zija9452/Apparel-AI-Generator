/* Runs the SHIPPED automate_production.jsx size functions over a batch of inputs
 * so the Python suite can compare the two implementations line for line.
 * Reads bridge_in.json, writes bridge_out.json. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");   // Backend/scripts/tests -> repo root
const JSX = fs.readFileSync(path.join(ROOT, "Backend", "scripts", "automate_production.jsx"), "utf8");

function pull(name) {
  const at = JSX.indexOf("function " + name + "(");
  if (at < 0) throw new Error("function " + name + " not found");
  let depth = 0;
  for (let j = JSX.indexOf("{", at); j < JSX.length; j++) {
    if (JSX[j] === "{") depth++;
    else if (JSX[j] === "}" && --depth === 0) return JSX.slice(at, j + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

const NAMES = ["sizeCodes", "sizeWords", "womenHeads", "womenSize", "womenAliases",
               "getFriendlySize", "sizeAliases", "isYouthPatternSize"];
const mod = { exports: {} };
new Function("module", NAMES.map(pull).join("\n")
  + "\nmodule.exports = { getFriendlySize, sizeAliases, isYouthPatternSize };")(mod);

/* The TypeScript copy in the browser decides which pattern file to INSIST on
 * before a job is ever sent. It reads the RAW Excel cell, so it is fed raw. */
const TSX = fs.readFileSync(path.join(ROOT, "Frontend", "my-app", "components", "UploadForm.tsx"), "utf8");
function pullTs(name) {
  const at = TSX.indexOf("function " + name + "(");
  if (at < 0) throw new Error("ts function " + name + " not found");
  let depth = 0;
  for (let j = TSX.indexOf("{", at); j < TSX.length; j++) {
    if (TSX[j] === "{") depth++;
    else if (TSX[j] === "}" && --depth === 0) return TSX.slice(at, j + 1);
  }
  throw new Error("unbalanced braces in ts " + name);
}
const tsSrc = [pullTs("isWomenYouthSize"), pullTs("isYouthSize")].join("\n")
  .replace(/:\s*(string|boolean)\b/g, "")            // the only annotations in these two
  + "\nmodule.exports = { isYouthSize };";
const tsMod = { exports: {} };
new Function("module", tsSrc)(tsMod);

const input = JSON.parse(fs.readFileSync(path.join(__dirname, "bridge_in.json"), "utf8"));
const out = {
  friendly: input.raw.map((s) => mod.exports.getFriendlySize(s)),
  youth_from_raw: input.raw.map((s) => mod.exports.isYouthPatternSize(mod.exports.getFriendlySize(s))),
  ts_youth: input.raw.map((s) => tsMod.exports.isYouthSize(s)),
  aliases: {},
};
for (const label of input.labels) out.aliases[label] = mod.exports.sizeAliases(label);
fs.writeFileSync(path.join(__dirname, "bridge_out.json"), JSON.stringify(out));
console.log("bridge ok: " + input.raw.length + " cells, " + input.labels.length + " labels");
