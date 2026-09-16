---
id: 190
title: AI Save PDF Compatible Stream
stage: green
date: 2026-09-14
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (conversation)
labels: ["performance", "saveAs", "pdfCompatible", "watchdog", "diagnosis"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check on automate_production.jsx (passes)
 - ES3 reserved-word scan on the new vars (clean)
 - measured from job Youth_w_adult_testing's own debug_log.txt (read-only)
---

## Prompt

Production statusJob Youth_w_adult_testingProcessingProcessing…Exporting (7 of 7)..y yhn q stuck ho gya he ?

(then) to aesakro na , pehle youth dekh lo agr hen to , agr youth k complete ho jaye phr adult pr aye , ek wakt me ek file open ho ?? possible he ?? or jese ek size youth or ek adult ho to pehle youth readkr le then refresh start or phr pattern adult readkr le

(then) issue kia a rha he ?? mene jo kaha he wo possible he us me kia edg case he

(then) ye file save hone me itna time q le rhi he , ise fix kro

## Response snapshot

### The job was never stuck

`status.json` held "Saving AI file..." written 28 seconds earlier. The status the
operator saw, "Exporting (7 of 7)", is written BEFORE `exportResult` runs
(`:11197`), so it always looks like a hang during the last export.

### Measured from the job's own log

| Stage | Time |
|---|---|
| Name index: adult pattern / youth pattern / mockup | 13ms / 4ms / 6ms |
| Youth pattern open | ~2s |
| Pre-measure, 12 panels, before the order doc | ~1s |
| YM export, 7 JPG | 49s |
| YL export, 7 JPG | 46s |
| XS export, 8 JPG | 1m 54s |
| **YM `saveAs`** (17:29:48 -> 17:35:28) | **5m 40s** |
| **YL `saveAs`** (17:36:40 -> 17:42:24) | **5m 44s** |

File sizes: `mockup.ai` **595 MB**, `pattern.ai` 1.3 MB, `pattern_youth.ai`
801 KB, each `production_ready_order_*.ai` **799 MB**.

So `saveAs` is ~85% of the per-size tail; with four sizes that is ~23 minutes of
pure saving. The two pattern files are NOT the cost - together they are 2.1 MB of
a 799 MB problem, and both indexed in single-digit milliseconds. Zero
"Embedded N linked image" lines in the log: the mockup's rasters are already
embedded in the mockup itself, which is why that file alone is 595 MB.

### Fix

`saveOrderDoc` called `orderDoc.saveAs(saveFile, new IllustratorSaveOptions())`
with bare defaults, and `IllustratorSaveOptions.pdfCompatible` defaults to TRUE -
Illustrator writes a COMPLETE second copy of the document as a PDF stream inside
the .ai, so 595 MB of rasters goes in twice. Now:

- `saveOpts.pdfCompatible = false` (architect confirmed these files are only ever
  opened in Illustrator, which reads its own native stream)
- `saveOpts.compressed = true` stated explicitly - the other half of what keeps
  the file down, and must not be switched off by accident
- an `updateStatus` immediately before `saveAs`, because the save is the longest
  silent stretch in the job and the staleness clock had already been running
  through the whole export flush
- the save is now TIMED into the log; it used to be measurable only as a gap
  between two unrelated lines, which is how it stayed invisible

### On the one-pattern-file-at-a-time proposal

Possible, and it needs no new machinery: `startNextOrderDoc` (`:4096`) already
saves, checkpoints and declines to open a new order document so Python can
restart Illustrator. It only needs a second reason to stop - the next size's
pattern file differing - plus Python opening only the file that chunk needs.

Told the architect plainly that it will NOT fix this slowness (2.1 MB against
799 MB), and surfaced the edge cases:

1. **More restarts, not fewer.** `FILES_PER_RUN = 2` already restarts every two
   files; an age boundary can force a stop after one, costing an extra ~80s
   restart plus re-open and re-index per switch.
2. **Sort order and file routing can disagree** - tested, three spellings do:
   `YXXL` and `Y2XL` sort into the youth block but route to the adult file, and a
   bare `YOUTH` sorts as unrecognised but routes youth. The whole design rests on
   "one youth block then one adult block", so these break it. The architect has
   said Y2XL does not exist in practice.
3. **Universal accessories** ride in whichever file is open and sort last, so in
   a mixed order they build in an ADULT chunk - the adult-then-youth fallback
   stops working and the accessory must be in the adult file. Architect chose
   exactly that, so the pre-flight would have to check that one file.
4. 792pt stays satisfied - everything above the size loop re-runs per chunk.

## Outcome

- ✅ Impact: the dominant cost in every job is halved-ish at one line; the save is now timed in the log, and the watchdog clock is refreshed before the longest silent operation. Diagnosis also cleared the two-pattern-file change of causing the slowdown.
- 🧪 Tests: JSX syntax + reserved-word scan; all timings measured from the live job's log read-only, nothing on the running job was touched.
- 📁 Files: `Backend/scripts/automate_production.jsx` only.
- 🔁 Next prompts: next run's log prints "AI file saved successfully: X (Ns, no PDF-compatible stream)" - compare against 340s. If more is needed, the 595 MB mockup is the root cause, not the pipeline.
- 🧠 Reflection: the operator's reported symptom ("stuck at Exporting"), the suspected cause (two pattern files) and the actual cause (the PDF-compatible stream on a 799 MB save) were three different things. Reading the log before building the proposed fix is what separated them - the proposed change would have shipped and the job would have been just as slow.

## Evaluation notes (flywheel)

- Failure modes observed: nearly implemented a one-pattern-file-at-a-time rework on the assumption that the second open document was the cost. The log showed it indexed in 4ms and is 801 KB. Also first assumed per-panel raster duplication, until `grep -c "Embedded .* linked image"` returned 0 and the file sizes showed the order doc is only 1.34x the mockup, not 7x.
- Graders run and results (PASS/FAIL): PASS - `node --check` clean; the sort-vs-routing disagreement check ran over 42 spellings and found exactly 3, all previously known.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): re-run the same order and read the new timed save line. If the drop is under ~30%, the PDF stream was not the bulk and the next lever is the mockup's embedded raster resolution against EXPORT_DPI = 300.
