---
id: 098
title: Rib & Cuff mockup colour and Pocket clip host
stage: green
date: 2026-08-13
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["hoodie", "pocket", "rib-cuff", "clipping-mask", "illustrator-jsx"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - Illustrator repro harness on job f6b1c036 pattern.ai: pocket clip, white-area % per size (Small 26.7% / XL 27.2% / 2XL 27.6% with the fix; XL/2XL 0.0% before)
 - node --check on automate_production.jsx (syntax)
 - Read-only structure dump of Small/XL/2XL Pocket groups in pattern.ai
---

## Prompt

"""D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\f6b1c036-fd7b-4997-9fe4-9d1dd99b38f3""" is me rib and cuff me mockup ka rib and cuff aye , wo hi color jo rib and cuff me he , jo logic twill tape ki he , and stroke remove bhi , and pocket me q ye black a rha he bg ?? small me thk a rha he xl and 2xl me kia front delte nhi ho rha he ?? check kro is me

(follow-ups in the same exchange)
- kia error tha , kia fix kia he
- kia ho rha he? issue kia he ?? explain kro pehle
- or sb me apply hoga sb sizes me ya medium me phr issue kre ga ?

## Response snapshot

Two independent defects, both diagnosed against the real job artefacts.

**1. Rib & Cuff kept the pattern file's stock fill.**
`getSourceView()` had no branch for `cuff`, so it fell through to the generic
logo fallback, which matched nothing. debug_log.txt:213 recorded
`SKIP: No matching design found in mockup for cuff - panel keeps the pattern
file's own fill`, and the panel exported in the pattern's stock red with a
black outline stroke. The mockup does contain a group named exactly
`Rib & Cuff` (647x397, verified by a read-only listing of mockup.ai).

Fix: an accessory-style early return for `cuff` that looks up only its own
mockup group (`Rib & Cuff` / `Rib and Cuff` / `Cuff & Rib` / `Cuff` / `Rib`,
no logo fallback), plus `baseShape.stroked = false` for rib/cuff panels.

**2. Pocket exported as a solid black rectangle on XL and 2XL.**
Measured white area of the exported pockets: Small 26.6% (correct kangaroo
silhouette), XL 0.0%, 2XL 0.0%. Pattern geometry was ruled out - all three
outlines are proper kangaroo shapes filling ~75% of their bbox.

Root cause: the confinement never came from this function's own
`clipGroup.clipped = true`. It came from the PATTERN PIECE'S OWN clipping
group, whose mask is the pocket outline. That group sits at a different depth
per size:
  - `Small Pocket` -> the piece group itself has `clipped=true`
  - `XL`/`2XL Pocket` -> `clipped=false`; the clip is one level deeper
`hoodieBuildPocket` always hosted the Front colour + design on `dupPocket`, so
on XL/2XL they landed outside the mask and nothing clipped them. A repro on the
real pattern confirmed a scripted `clipped=true` confines nothing here even
with a fresh purpose-built mask path - which is why the "clipping mask active"
log never warned.

Fix: walk up from the outline to the first ancestor with `clipped === true`
(stopping at the piece) and host the clip group there; warn instead of
silently exporting full-bleed when no such group exists. Verified on the real
pattern: Small 26.7% / XL 27.2% / 2XL 27.6% white.

## Outcome

- ✅ Impact: Rib & Cuff now takes the mockup's own colour with no outline stroke; Pocket clips correctly at every size instead of only where the pattern happened to nest its clip at the top level.
- 🧪 Tests: Illustrator repro harness against the job's real pattern.ai (three variants x three sizes, JPG exports measured for white area); node --check for syntax. No full pipeline run yet.
- 📁 Files: Backend/scripts/automate_production.jsx (getSourceView cuff branch, rib/cuff stroke clear, hoodieBuildPocket clipHost resolution)
- 🔁 Next prompts: re-run the job end to end and confirm Rib & Cuff colour + all three Pocket exports.
- 🧠 Reflection: the misleading success log hid this for a whole job - a clip that reports "active" is not a clip that confines.

## Evaluation notes (flywheel)

- Failure modes observed: success-logging a scripted `clipped = true` without verifying it confines anything; assuming a pattern piece nests its clipping group the same way at every size.
- Graders run and results (PASS/FAIL): white-area measurement per size - PASS (Small 26.7 / XL 27.2 / 2XL 27.6, all ≈ the outline's ~25% outside area).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add a post-clip bounds assertion in hoodieBuildPocket so a future unclipped export raises a hoodie warning on its own.
