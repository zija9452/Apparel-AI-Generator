/* Women's-size support: the ExtendScript half.
 *
 * The functions are cut OUT OF THE SHIPPED automate_production.jsx by brace
 * matching and eval'd here, so this tests the file Illustrator actually runs -
 * not a copy that can drift from it. Same cases.json as test_py.py, so the two
 * implementations are checked against the same expectations and each other.
 */
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const ROOT = path.resolve(__dirname, "..", "..", "..");   // Backend/scripts/tests -> repo root
const JSX = fs.readFileSync(path.join(ROOT, "Backend", "scripts", "automate_production.jsx"), "utf8");
const CASES = JSON.parse(fs.readFileSync(path.join(HERE, "cases.json"), "utf8"));

/** The source of `function NAME(...) { ... }`, found by matching braces. */
function pull(name) {
  const at = JSX.indexOf("function " + name + "(");
  if (at < 0) throw new Error("function " + name + " not found in the JSX");
  let i = JSX.indexOf("{", at), depth = 0;
  for (let j = i; j < JSX.length; j++) {
    const c = JSX[j];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return JSX.slice(at, j + 1); }
  }
  throw new Error("unbalanced braces in " + name);
}

/** The source of `var NAME = [ ... ];`, found the same way. */
function pullArray(name) {
  const at = JSX.indexOf("var " + name + " = [");
  if (at < 0) throw new Error("var " + name + " not found in the JSX");
  let i = JSX.indexOf("[", at), depth = 0;
  for (let j = i; j < JSX.length; j++) {
    const c = JSX[j];
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) return JSX.slice(at, j + 1) + ";"; }
  }
  throw new Error("unbalanced brackets in " + name);
}

const NAMES = ["sizeCodes", "sizeWords", "womenHeads", "womenSize", "womenAliases",
               "getFriendlySize", "sizeAliases", "isYouthPatternSize", "normalizeSizeWord",
               "sizeAliasesFor", "findAnywhere"];
const src = NAMES.filter((n) => n !== "findAnywhere").map(pull).join("\n")
  + "\n" + pullArray("SIZE_ALIAS_GROUPS")
  + "\n" + pullArray("RENAME_SIZE_WORDS")
  + "\nmodule.exports = { getFriendlySize, sizeAliases, isYouthPatternSize, womenSize,"
  + " womenAliases, sizeCodes, sizeWords, normalizeSizeWord, sizeAliasesFor, SIZE_ALIAS_GROUPS };";

const mod = { exports: {} };
new Function("module", src)(mod);
const J = mod.exports;

let checks = 0;
const fails = [];
function check(name, got, want) {
  checks++;
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) fails.push(`${name}\n      got  ${g}\n      want ${w}`);
}

/* ------------------------------------------------------------ friendly size */
for (const [raw, want] of Object.entries(CASES.friendly)) {
  if (raw.startsWith("__")) continue;
  check(`getFriendlySize(${JSON.stringify(raw)})`, J.getFriendlySize(raw), want);
}

/* ----------------------------------------------------------- which .ai file */
// isYouthPatternSize is documented as taking the FRIENDLY label, never the raw
// cell - every caller in the JSX is already past getFriendlySize - so it is fed
// the same way here.
for (const raw of CASES.youth_file.__true__)
  check(`isYouthPatternSize(friendly(${JSON.stringify(raw)}))`, J.isYouthPatternSize(J.getFriendlySize(raw)), true);
for (const raw of CASES.youth_file.__false__)
  check(`isYouthPatternSize(friendly(${JSON.stringify(raw)}))`, J.isYouthPatternSize(J.getFriendlySize(raw)), false);

/* ----------------------------------------------------------- pattern aliases */
for (const [label, mustHave] of Object.entries(CASES.aliases)) {
  const got = J.sizeAliases(label);
  const missing = mustHave.filter((n) => got.indexOf(n) < 0);
  check(`sizeAliases(${label}) contains`, missing.length ? missing : "all present", "all present");
  check(`sizeAliases(${label})[0] is the label`, got[0], label);
  const dupes = got.filter((n, i) => got.indexOf(n) !== i);
  check(`sizeAliases(${label}) has no duplicates`, dupes, []);
  const flat = got.map((n) => n.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  const twins = [...new Set(flat.filter((n, i) => flat.indexOf(n) !== i))].sort();
  check(`sizeAliases(${label}) no punctuation-only twins`, twins, []);
}
for (const [label, forbidden] of Object.entries(CASES.alias_must_not_contain)) {
  const got = J.sizeAliases(label);
  const present = forbidden.filter((n) => got.indexOf(n) >= 0);
  check(`sizeAliases(${label}) excludes`, present.length ? present : "none present", "none present");
}

/* --------------------------------------------------- size-tag rename groups */
// renameSizeTags looks the size up by its normalised label; a size with no group
// falls back to the global word list, which holds no bare letters - so a women's
// piece tagged "M" would never have been renamed.
for (const label of ["W-XS", "W-S", "W-M", "W-L", "W-XL", "W-2XL",
                     "W-YXXS", "W-YXS", "W-YS", "W-YM", "W-YL", "W-YXL"]) {
  const want = J.normalizeSizeWord(label);
  const group = J.sizeAliasesFor(want);
  check(`sizeAliasesFor(${label}) exists`, group !== null, true);
  if (group) {
    const body = label.slice(2).toLowerCase();
    check(`sizeAliasesFor(${label}) accepts the bare code "${body}"`, group.indexOf(body) >= 0, true);
  }
}
// Every entry in every group must already be normalised, or it can never match.
for (const group of J.SIZE_ALIAS_GROUPS) {
  for (const n of group) check(`SIZE_ALIAS_GROUPS entry ${JSON.stringify(n)} is normalised`, J.normalizeSizeWord(n), n);
}
// And no word may sit in two groups - that would rename a tag under two sizes.
const seen = {};
for (const group of J.SIZE_ALIAS_GROUPS) for (const n of group) (seen[n] = seen[n] || []).push(group[0]);
for (const [word, groups] of Object.entries(seen)) {
  // The bare adult words ARE shared with the women's groups on purpose: a
  // women's piece is usually tagged with the plain letter. Scoping makes it safe.
  if (groups.length > 1 && !groups.some((g) => g.startsWith("w"))) {
    check(`"${word}" appears in one group only`, groups, [groups[0]]);
  }
}

/* -------------------- the lookup a real pattern file would actually resolve */
// findAnywhere keys on name.toLowerCase().replace(/[^a-z0-9]/g,""), so this is
// exactly how a panel name in the .ai would be matched.
const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const PANELS = {
  "W-M": ["W-M Front", "WM Front", "W M Front", "Women M Front", "Women Medium Front",
          "Womens Medium Front", "Women Adult Large Front".replace("Large", "Medium"),
          "Adult Women M Front", "W Adult Medium Front"],
  "W-YL": ["W-YL Front", "WYL Front", "Women YL Front", "Women Youth Large Front",
           "Youth Women Large Front", "W Youth L Front"],
  "W-2XL": ["W-2XL Back", "WXXL Back", "Women XXL Back", "Women 2XL Back"],
};
for (const [label, panels] of Object.entries(PANELS)) {
  const part = panels[0].split(" ").pop();
  const probes = J.sizeAliases(label).map((a) => key(a + " " + part));
  for (const panel of panels) {
    check(`pattern panel "${panel}" is found for ${label}`, probes.indexOf(key(panel)) >= 0, true);
  }
}

/* ---------------------------------------------- ExtendScript (ES3) safeguards */
// node parses ES2023; Illustrator's engine does not. These are the traps that
// kill the whole bundle at parse time or fail silently at run time.
const NEW_CODE = NAMES.filter((n) => n !== "findAnywhere").map(pull).join("\n");
const RESERVED = ["short", "char", "int", "class", "byte", "long", "float", "double",
                  "final", "goto", "native", "synchronized", "throws", "transient"];
for (const w of RESERVED) {
  check(`no "var ${w}" (ES3 reserved word)`, new RegExp("\\bvar\\s+" + w + "\\b").test(NEW_CODE), false);
}
for (const [name, re] of [["Array.indexOf", /\w\.indexOf\s*\(/], ["Array.forEach", /\.forEach\s*\(/],
                          ["Object.keys", /Object\.keys\s*\(/], ["Array.map", /\.map\s*\(/],
                          ["String.trim()", /\.trim\s*\(\s*\)/], ["let/const", /\b(let|const)\s+\w/],
                          ["arrow function", /=>/], ["template literal", /`/]]) {
  const hits = NEW_CODE.split("\n").filter((l) => re.test(l) && !/^\s*(\/\/|\*)/.test(l));
  // String.indexOf is ES3 and fine; Array.prototype.indexOf is not. Only flag
  // the call when the receiver is something this code built as an array.
  const real = name === "Array.indexOf" ? hits.filter((l) => /(?:out|codes|list|HEADS|LEADS|bodies)\.indexOf/.test(l)) : hits;
  check(`no ${name} in the new code`, real, []);
}

/* -------------------------------------------------------------------- report */
console.log(`${checks - fails.length}/${checks} passed`);
for (const f of fails) console.log("  FAIL  " + f);
process.exit(fails.length ? 1 : 0);
