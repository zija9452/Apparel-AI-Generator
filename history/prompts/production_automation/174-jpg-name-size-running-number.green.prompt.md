---
id: 174
title: JPG name size running number
stage: green
date: 2026-09-03
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat) rename exported JPGs to <Size><n>
labels: ["export", "naming", "jpg", "operator-facing"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (exportFileCounters, nextExportFileName, queueExport signature + re-queue branch, flushExports, 6 call sites)
tests:
 - node --check on a .js copy - PASS
 - all 6 queueExport call sites verified to pass sizeLabel
 - naming replayed against the real build order from Knuckle_Headz_Mint's debug_log.txt - 73 files, no collisions, every size counting from 1
 - no Illustrator run
---

## Prompt

ok , or export name  A RHA HE YEC:\Production\Knuckle_Headz_Mint\Knuckle_Headz_Mint\S\Small_Back_Item1.jpg , is me jpeg ka nam Small_Back_Item@ ki jga Small1 ho bs

(follow-up) size wise ho ye , jese large k Large1 alg ayen

## Response snapshot

**Clarified before implementing.** Taken literally, `Small_Back_Item1 -> Small1` collides:
`Small_Front_Item1` would also become `Small1`, and the S folder's 15 renders would silently collapse
to 7, since `exportFile` overwrites and `exportResult`'s catch swallows the error. Asked with a preview
of the resulting folder listing for three schemes; the user chose the running number per size and then
confirmed the counter is per size ("large k Large1 alg ayen").

**Implementation.** The queue is keyed by instance name and that had to stay - PLACKET-MATCH and
SHOULDER-MATCH both re-queue a panel they have changed, and the key is what makes a re-export replace
the entry instead of adding a second render. So the file name became a separate field:

- `exportFileCounters` (`sizeLabel -> count`), declared with `exportQueue`/`exportOrder` per this
  file's var-hoisting rule, and deliberately OUTSIDE the queue: `flushExports` empties the queue, and a
  size spanning two order documents has to keep counting (Small1..Small10, then Small11..Small15)
  rather than restart and overwrite its own renders.
- `nextExportFileName(sizeLabel, instanceName)` returns `<size><n>`, or the instance name unchanged
  when there is no size - `Universal` renders to the output root, not a size folder, so Twill Tape
  stays `Twill_Tape_Item1.jpg`.
- `queueExport(idx, folder, name, sizeLabel)` gained a re-queue branch: an already-queued name updates
  its artboard index and folder but KEEPS the file name it was given. Taking a fresh number on every
  re-export would burn numbers, leave gaps, and land the panel in a different file than the log
  promised.
- `flushExports` renders `job.file || job.name`; `exportResult`'s existing
  `replace(/[^a-zA-Z0-9]/g,'_')` is a no-op for `Small1`/`2XL1` and still sanitises the Universal
  fallback.
- Six call sites updated to pass `sizeLabel` (all six already had it in scope).

**Traceability.** The part name is gone from the file name, so `queueExport` now logs
`EXPORT NAME: <instance> -> <file>.jpg` once per panel. That is the only place the mapping exists.

**Verified by replay,** not by guesswork: parsed `Queued JPG for instance:` out of the finished job's
`debug_log.txt` (which is the real build order, not the alphabetical listing) and applied the new
numbering - S 15, M 19, L 13, XL 11, 2XL 15, root 1 = 73 files, no collisions. Front panels come first
in every size, then Back, then Neck, then the two sleeves, because that is the plan's item order.

## Outcome

- ✅ Impact: JPGs are now `Small1.jpg ... Small15.jpg`, `Large1.jpg ...`, each size counting from 1,
  with no risk of the overwrite the literal reading would have caused.
- 🧪 Tests: `node --check` PASS; call sites verified; naming replayed against the real build order.
  Not run through Illustrator.
- 📁 Files: 1 source file + this PHR.
- 🔁 Next prompts: on the re-run, confirm each size folder holds the same number of files it did before
  (S 15, M 19, L 13, XL 11, 2XL 15) - a short count means numbers collided somewhere.
- 🧠 Reflection: The instruction was one line and unambiguous in intent but destructive taken literally.
  The preview of the resulting folder listing was what made the collision visible to both of us -
  cheaper than shipping it and counting missing files afterwards.
- 📋 ADR: not suggested - an output naming change.

## Evaluation notes (flywheel)

- Failure modes observed: none at build time. The near-miss worth recording: `exportResult` wraps
  everything in `catch (e) {}`, so an overwrite - or any export failure - produces no error, no log
  line, and no missing-file complaint. A silent naming collision would have surfaced only as "kuch
  files kam hain" days later.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): give `exportResult`'s catch a log line, and have
  `flushExports` compare the number of files it wrote against the number it queued. Both are two lines
  and would turn this whole class of failure from silent into obvious.
