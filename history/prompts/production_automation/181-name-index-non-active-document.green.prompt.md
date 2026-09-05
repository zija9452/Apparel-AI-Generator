---
id: 181
title: Name index built on non-active document
stage: green
date: 2026-09-05
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat performance report)
labels: ["performance", "illustrator", "com", "name-index", "active-document", "findAnywhere"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - probe1 - census + three index algorithms on the real pattern/mockup copies (walk itself is 15ms, so the algorithm was never the problem)
 - probe2 - ms-per-DOM-read, active vs non-active, with a switch-back control (0.07 / 127.42 / 0.02 ms)
 - probe3 - old build order vs new build order, index tables fingerprinted (rawName|typename) and diffed - NONE
 - node --check on automate_production.jsx (as .js) - PASS
 - ES3 reserved-word scan on all new identifiers - clean
---

## Prompt

C:\Production\6666666666666666666666\6666666666666666666666\debug_log.txt automation started , is stage pr automatiuon 5 mints leti he , which is too much , how coul;d i convert this 5 minute into less than 1 minute , with the same output

then "pehle plan share kro sath , k q time le rha he , or kia fix he ? then scratchpad pr test kro pehle , then implement in code"

then "D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\scripts\docs\792PT_COORDINATE_SHIFT.md , ye wala issue to raise nhi hga fix se ?/"

## Response snapshot

### Where the five minutes went

From the job's own `debug_log.txt` (job `6666666666666666666666`, one size, 5 items):

```
10:13:08 Automation started
10:13:35 Mockup opened                                    27s
10:17:52 Name index built (31 named items, 257444ms)     4m17s
10:17:53 PATTERN SIZES: pre-measured 5 panel(s)
10:17:56 New Order document created (CMYK)
10:18:19 Name index built (13 named items,  23406ms)       23s
10:18:51 EXPORT: rendering 6 JPG(s)
```

**281s of the 343s before the first export was two `_buildNameIndex` calls
collecting 44 names.** The actual layout in that window took 58s.

### It was never the algorithm

First hypothesis - a redundant walk - was wrong, and the probe said so
immediately. The identical algorithm on copies of the same two files:

```
pattern.ai:  15ms, 31 names, 1048 DOM reads
mockup.ai :   2ms, 13 names,   86 DOM reads
```

But 1048 reads / 257.4s = **246ms per read**, and 86 / 23.4s = **272ms per
read** - the same per-read cost on both documents. That is environmental, not
algorithmic.

### The real cause: reads on a NON-ACTIVE document

Probe 2, 60 reads of `.name` each, with a switch-back control so the result is
causal and not correlational:

```
A  pattern ACTIVE (only doc open)   :   0.07 ms/read
B  pattern NON-active (mockup open) : 127.42 ms/read
C  pattern ACTIVE again             :   0.02 ms/read
D  mockup NON-active                : 122.71 ms/read
E  mockup ACTIVE                    :   0.14 ms/read
```

Same document, same reads; only `app.activeDocument` changed. Illustrator's CPU
counter stays flat throughout (346.3s -> 347.0s over 30 minutes of this) - it is
not computing, it is waiting per call. That flat-CPU-plus-flat-log signature is
exactly what has been misread as a hang before.

`automate_production.jsx:110` does `app.open(mockupPath)`, which makes the MOCKUP
active. Every later read of `patternDoc` - including all 1048 of the index walk,
triggered from `prebuildPatternSizes()` - then paid the cross-document price.

### Fix: index each document while it is still the active one

No `app.activeDocument` assignment anywhere - that is the tempting fix and it is
the one that risks 792pt. Instead each document is indexed at the moment
`app.open` has just made it active:

- `warmNameIndex(patternDoc, "pattern")` **before** the mockup is opened
- `warmNameIndex(mockupDoc, "mockup")` immediately after `app.open`
- `warmNameIndex(logoLibraryDoc, "logo library")` immediately after its open

Plus a `buildMs > 2000` warning inside `findAnywhere` so a future regression
names itself in the log instead of just being slow.

### 792pt question (asked explicitly)

Does not apply, and the change is a net improvement on that axis:

1. The index reads `.name`/`.typename`/`.pageItems`/`.layers` - never
   `geometricBounds`/`visibleBounds`/`.width`/`.height`. Checklist item 1 in
   `docs/792PT_COORDINATE_SHIFT.md` is not triggered.
2. All three warm calls run before `app.documents.add()` - the same
   pre-order-document window the doc mandates for `prebuildPatternSizes`.
3. The mockup index previously built at line ~780, i.e. AFTER the order document
   existed (log: orderDoc 10:17:56, mockup index 10:18:19). That was a foreign
   document access mid-layout; it is now in the safe window.

### Verification - old order vs new order, same session

```
NEW  pattern open 4944ms, index    63ms, 31 names
NEW  mockup  open 24727ms, index   97ms, 13 names
OLD  (order doc active) pattern index 258070ms, 31 names
OLD  (order doc active) mockup  index  23349ms, 13 names

SPEEDUP pattern: 258070ms -> 63ms   (4096x)
SPEEDUP mockup :  23349ms -> 97ms   (241x)
TOTAL saved: 281s

PATTERN index difference: NONE - tables are identical
MOCKUP  index difference: NONE - tables are identical
```

The old leg reproduced the production log's 257444ms as 258070ms - within 0.2%.
Tables were compared by fingerprint (`rawName|typename` per key), so a different
object under the same key would have been caught, not just a different key set.

## Outcome

- ✅ Impact: 281s removed from every job, regardless of size - the index cost is
  fixed per run, so short test jobs benefit most. The stage the user pointed at
  (start -> first export) goes from ~343s to ~62s, now dominated by the 27s
  mockup open and 32s of real layout.
- 🧪 Tests: 3 scratchpad probes (census, per-read timing with switch-back
  control, old-vs-new equivalence), `node --check` PASS, ES3 reserved-word scan
  clean. Not yet re-run through the full pipeline.
- 📁 Files: 1 changed (`automate_production.jsx`) - 3 warm calls, 1 helper, 1
  slow-build warning.
- 🔁 Next prompts: (a) re-run job `6666666666666666666666` and confirm the two
  "Name index built" lines are now milliseconds; (b) export is now the biggest
  remaining block (219s of this run) - that is `SLOW_EXPORTING.md`, RAM and
  Illustrator CC 2015, not code.
- 🧠 Reflection: I opened with a plausible algorithmic story (redundant
  recursion, 3x too many reads) and the first probe killed it in 15ms. The cost
  was never in what the code did - it was in where the code ran. Per-read cost is
  worth measuring before per-read count.

## Evaluation notes (flywheel)

- Failure modes observed: a memory note asserting `layer.pageItems` is recursive,
  which the census disproved for these files (107 direct children vs 5619 doc
  total); my own first hypothesis pointing at the walk instead of the
  environment; flat CPU + flat log looking like a hang when it is a per-call wait.
- Graders run and results (PASS/FAIL): per-read timing with switch-back control -
  PASS (causal); old-vs-new index fingerprint diff - PASS (identical); reproduction
  of the production 257444ms figure - PASS (258070ms, 0.2%).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): count how many other cross-document
  reads remain in the layout loop; at ~125ms each they may be worth the same
  treatment, but only where the 792pt rule allows.
