/* Prints SIZE_ALIAS_GROUPS out of the shipped JSX as JSON, so the workbook
 * checker can confirm the sheet promises only words the script really matches. */
const fs = require("fs");
const path = require("path");
const JSX = fs.readFileSync(
  path.join(__dirname, "..", "automate_production.jsx"),
  "utf8");
const at = JSX.indexOf("var SIZE_ALIAS_GROUPS = [");
if (at < 0) throw new Error("SIZE_ALIAS_GROUPS not found");
const start = JSX.indexOf("[", at);
let depth = 0, end = -1;
for (let j = start; j < JSX.length; j++) {
  if (JSX[j] === "[") depth++;
  else if (JSX[j] === "]" && --depth === 0) { end = j + 1; break; }
}
process.stdout.write(JSON.stringify(new Function("return " + JSX.slice(start, end))()));
