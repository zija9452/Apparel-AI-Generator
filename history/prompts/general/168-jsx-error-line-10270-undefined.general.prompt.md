---
id: 168
title: JSX error line 10270 undefined
stage: explainer
date: 2026-09-07
surface: agent
model: claude-opus-5
feature: none
branch: main
user: zija9452
command: (chat question)
labels: ["jsx", "extendscript", "debugging", "line-offset", "automation-bundle"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (read-only investigation, no files modified)
 - Backend/scripts/automate_production.jsx
 - Backend/scripts/json2.jsx
 - Backend/services/illustrator_automation.py
 - C:/Production/0000000000000/automation_bundle.jsx
 - C:/Production/0000000000000/0000000000000/debug_log.txt
 - C:/Users/scb/AppData/Local/AIApparelAgent/agent.log
tests:
 - Verified bundle line offset by reading the live automation_bundle.jsx from job 0000000000000
 - diff -q agent JSX copy vs repo copy -> IDENTICAL (bundle not stale)
---

## Prompt

'JSX error 10270 is undefined , ye error q a rha he ??

## Response snapshot

> **CORRECTION (added after the user supplied the real log at
> `E:\error\Strictly_Molokai_Brown_Jersey_Order_Youth-3\`):** the root-cause
> section at the bottom of this file supersedes the `replaceInContainer`
> conclusion below. That conclusion came from reading job `0000000000000`'s
> bundle, which is a DIFFERENT (newer) JSX version than the bundle that actually
> failed. The +37 offset finding still holds for same-version bundles, but the
> only safe way to resolve a reported line is to read *that job's own*
> `automation_bundle.jsx`.

Key finding: **10270 is a line number in `automation_bundle.jsx`, not in
`automate_production.jsx`.**

`illustrator_automation.py:1605-1612` writes the bundle as:

```
line 1       // AI Apparel Automation Bundle
lines 2-34   json2.jsx (33 lines) + "\n"
line 35      // Arguments
line 36      var planPath = ...; var outputDir = ...;   (single line)
line 37      // Main Logic
line 38+     automate_production.jsx starts here
```

So `bundle_line - 37 = source_line`. Bundle **10270** -> `automate_production.jsx`
**10233**, verified byte-for-byte against the live bundle on disk:

```javascript
function replaceInContainer(container, target, value, alreadyMatched, root) {
    if (!target || !container) return;
    root = root || container;
    var tUpper = target.toUpperCase();
    var cName = (container.name || "").toUpperCase();   // <-- bundle 10270
```

Corroborating evidence from today's failed job `0000000000000` (17:35):
- `debug_log.txt` last line is `Applying Text Replacements (Name/Number)...`,
  which is the caller of `replaceInContainer`. The failure is in that function.
- `agent.log` shows `pywintypes.com_error: (-2147023170, 'The remote procedure
  call failed.')` -> Illustrator process died, so the `catch` at
  `automate_production.jsx:2141` never ran and no `error_log.txt` was written.
- The same log line above the crash: `PATH RELINK: non-standard item type
  'RasterItem' (name: ?)` - an embedded raster sits in that design, which ties
  back to the embedded-images question from the previous turn.
- `WARNING:apparel-agent:Could not check for a newer automation bundle
  (WinError 10061)` - backend :8000 was down, agent used its local copy. Ruled
  out as stale: `diff -q` against the repo copy returns IDENTICAL.

`"X is undefined"` in ExtendScript means an identifier was resolved to nothing
(undeclared variable / missing function), which is distinct from `"undefined is
not an object"` (property read on undefined). The exact identifier name that
prefixes "is undefined" was not available - not present in any `debug_log.txt`
under `C:/Production` and no `error_log.txt` exists anywhere - so the culprit
symbol was requested from the user.

Web search for a documented "ExtendScript Error 10270" catalog entry returned
nothing; there is no such error code. This supports the line-number reading
rather than an error-code reading.

## Root cause (confirmed)

The user supplied `E:\error\Strictly_Molokai_Brown_Jersey_Order_Youth-3\`, which
contains the failing job's own bundle, debug log and error log.

`error_log.txt`:
```
JSX Error: undefined is not an object
Line: 10270
```

Line 10270 of *that job's* `automation_bundle.jsx`:
```javascript
    var SIZE_CODES = {                                   // 10252
    ...
    function getFriendlySize(s) {                        // 10263
        ...
        if (SIZE_CODES[up]) return SIZE_CODES[up];       // 10270  <- throws
```

`var SIZE_CODES = {...}` is a statement: the name hoists, the value does not.
`getFriendlySize()` is called from the very top of the run (prebuildPatternSizes
and the main item loop), hundreds of lines above line 10252, so `SIZE_CODES` is
`undefined` there and `undefined[up]` throws.

First symptom in the same `debug_log.txt`, before the fatal one:
```
18:11:51: PATTERN SIZES: pre-measure failed (undefined is not an object) - overflow checks will simply skip.
```
The log also shows the pattern name index was never built at all (a healthy run
logs "Name index built (31 named items)" + "NAME INDEX: pattern indexed while it
was the active document" before "Mockup opened"; this run logs neither).

**Already fixed in the current source.** `automate_production.jsx:10746` replaces
the `var` with a hoisted function, and the comment at 10733-10745 records the
same failure on job `Knuckle_Headz_Mint_Order (2026-09-03)`:
```javascript
function sizeCodes() {
    if (!sizeCodes.map) sizeCodes.map = { "XS": "XS", ... };
    return sizeCodes.map;
}
```

So the failing job ran a **stale bundle**. `agent.log` confirms why:
`WARNING:apparel-agent:Could not check for a newer automation bundle
(WinError 10061) - using the local copy` - backend :8000 was down, so the agent
could not pull the fixed JSX. Remedy: start the backend and re-run the job.

## Second question: pattern-piece pre-flight warning

`"3XL Neck" (or "Adult 3XL Neck", "A3XL Neck", "XXXL Neck", "Adult XXXL Neck",
"AXXXL Neck") - needed for size 3XL, part 'neck'`

Produced by `_find_missing_pattern_pieces` / `_describe_missing_piece` /
`_size_aliases` in `illustrator_automation.py:810-947`. Not an error - a
pre-flight pause. Matching rules that decide it:

- `_norm_name` (line 845) lowercases and drops every non-alphanumeric, so
  `3XL-Neck`, `3xl neck`, `3XL_Neck` all match.
- Word ORDER is significant: `Neck 3XL` normalizes to `neck3xl` and does not
  match `3xlneck`.
- A different word (`Collar`, `Neckband`, `Neck Rib`) does not match.
- The probe walks only to `depth > 3` - deliberately identical to
  `_buildNameIndex` in the JSX, so anything deeper the renderer cannot reach
  either.

Choosing "Continue without these pieces" makes the JSX log
`CRITICAL: Could not find '<name>' ... Skipping.` and ship the 3XL order file
with no neck panel; every other size renders normally.

## Outcome

- ✅ Impact: Established the bundle->source line mapping (+37) so any future JSX line number from a job run can be translated to the real source line; localized this failure to `replaceInContainer` in the text-replacement pass.
- 🧪 Tests: Line offset verified against the live `automation_bundle.jsx`; agent-vs-repo JSX diff confirmed identical.
- 📁 Files: No files modified - read-only diagnosis.
- 🔁 Next prompts: Get the exact identifier name from the Illustrator dialog; then decide whether `replaceInContainer` needs a guard for the RasterItem/embedded-image container case.
- 🧠 Reflection: The +37 offset is a permanent property of the bundle builder and should be remembered - reading the reported line number directly in `automate_production.jsx` points at unrelated code and sends debugging down the wrong path.

## Evaluation notes (flywheel)

- Failure modes observed: Reported JSX line numbers silently refer to the generated bundle, not the source file; a hard Illustrator crash (RPC failure) bypasses the script's own `catch`, so `error_log.txt` is absent exactly when the failure is worst.
- Graders run and results (PASS/FAIL): PASS - offset independently confirmed by reading the on-disk bundle.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Have the bundle builder emit a `//#sourceOffset 37` header, or subtract the offset when logging `e.line`, so reported lines map to the source directly.
