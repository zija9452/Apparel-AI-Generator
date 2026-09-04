---
id: 179
title: Clipping Mask Compound Path
stage: green
date: 2026-09-04
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat request)
labels: ["clipping-mask", "compound-path", "illustrator", "pattern", "youth-sizes", "makeMask"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - probe8/probe9 against the real pattern.ai - only YM Front / YL Front fail; unwrap makes both CLIP OK
 - probe10/probe12 synthetic holed compound - group.clipped rejects it, naive unwrap drops the hole, makeMask keeps it (verified in an exported JPEG)
 - probe13 in production's own nested clipGroup sequence, all 3 mask types - PASS, clipGroup/pastedPattern/pastedDesign references survive makeMask
 - full pipeline run, real pattern, YXS + YM + YL fronts - PASS, 0 PARM
 - probe14/probe15 on the produced .ai files - clipped=true, topIsClippingPath=true on all 3
 - node --check on automate_production.jsx - PASS
---

## Prompt

"C:\Production\Knuckle_Headz_White_Order_Youth\...\debug_log.txt youth medium front me parm error aya he ?"
then "kia mtlb hua jo wo clipped nhi hua ? pattern me issue he kia ?"
then "check kro isi k pattern dubra , isi job me hon ge"
then "so, ye case bhi handle kro na , pehle scratchpad pr test , then code me implement"

## Response snapshot

### What was actually wrong

Youth Medium front had **no** PARM. The whole log had two PARMs and neither was a
panel build: one in the colour-detect `Temp Expand` probe on YXL Back (harmless,
caught), one on 2T Front that the rollback **recovered on attempt 3 of 11**.

The real defect was a different error entirely, on YM Front and YL Front:

    Clipping setup failed: The top item in the group must be a path item to create a mask

`clipMask` is a duplicate of `baseShape` and it is **filled** (the panel base is
painted just before). It ends up ON TOP of the design. So a failed clip does not
merely leave the design untrimmed - it **hides the artwork completely**.

### Root cause: the pattern, not the code

probe8 walked all eight front groups in this job's `pattern.ai`:

    YXS / YS / YXL / 2T / 3T / 4T Front  ->  PathItem            (155-171 points)
    YM Front                             ->  GroupItem -> CompoundPathItem (1 subpath)
    YL Front                             ->  GroupItem -> CompoundPathItem (1 subpath)

Exactly the two failing panels, and reproducible - the same two failed in two
consecutive production jobs. Illustrator's DOM refuses `group.clipped = true`
unless the group's top item is a `PathItem`; a `CompoundPathItem` throws. Those
two outlines are plain outlines someone pressed Ctrl+8 on, wrapped in a
redundant group.

(probe8's own "CLIP FAILED -> PARM" verdicts were an artifact - duplicating
across documents always throws PARM. probe9 redid the test inside the document
and gave the clean result above.)

### The edge case the user asked to handle too

A compound path with MORE than one subpath is a real compound - it has holes.
Unwrapping subpath[0] "works" and silently clips to the outer shape alone.
probe10/probe12 proved this on a synthetic donut (polarity NEGATIVE on the inner
path), and proved `executeMenuCommand("makeMask")` is the route that keeps the
holes - confirmed by exporting the JPEG and seeing the hole.

    S1  group.clipped = true, 2-subpath compound   -> FAILED (same message)
    S2  naive unwrap of subpath[0]                 -> CLIP OK, hole GONE
    S3  executeMenuCommand("makeMask")             -> CLIP OK, 2 subpaths kept
    S4  subpath.clipping = true, then clipped      -> FAILED

### The fix

`applyClipMask(clipGroup, clipMask)`, added next to `removeWithRetry`:

    PathItem              -> clipped = true              (unchanged, almost every panel)
    CompoundPath, 1 sub   -> lift the subpath out, then clipped = true
    CompoundPath, n subs  -> executeMenuCommand("makeMask"), selection saved/restored,
                             then asserted (makeMask reports nothing)

Plus a safety net in the `catch`: whatever mask copy survived a failure is
removed, so any future clip failure leaves the design **visible but untrimmed**
instead of hidden. The log line now says which of the three routes ran.

### Verification

Real pipeline, real pattern, YXS (control) + YM + YL fronts:

    YXS Front  ->  Success: Clipping mask active (plain path).
    YM  Front  ->  Success: Clipping mask active (compound path, 1 subpath - unwrapped to a plain path).
    YL  Front  ->  Success: Clipping mask active (compound path, 1 subpath - unwrapped to a plain path).
    PARM: no PARM errors in this job.

Then opened the three produced `.ai` files: `clipped=true`,
`topIsClippingPath=true` in all three. JPEGs render correctly.

## Outcome

- ✅ Impact: YM/YL fronts clip correctly; any pattern outline that is a compound
  path now works, holes included. The plain-path route is byte-for-byte unchanged.
- 🧪 Tests: 6 scratchpad probes + a real pipeline run + output-file inspection,
  all PASS. `node --check` PASS.
- 📁 Files: 1 changed (`automate_production.jsx`).
- 🔁 Next prompts: (a) the fix only helps NEW runs - the YM/YL panels already
  shipped in the two earlier youth jobs are still wrong and must be re-run;
  (b) tidier long-term fix is Release Compound Path on those two pattern pieces;
  (c) the makeMask branch has never run against a real holed pattern - only the
  synthetic one.
- 🧠 Reflection: the first probe's cross-document `duplicate()` made all eight
  sizes look broken. A verdict that indicts everything is usually the harness,
  not the subject - re-run it in-document before believing it.

## Evaluation notes (flywheel)

- Failure modes observed: cross-document duplicate turning a discriminating test
  into a uniform PARM; a script-built "donut" that was not a donut because both
  subpaths wound the same way; an artboard framed off the artwork producing a
  blank JPEG that looked like a failed clip.
- Graders run and results (PASS/FAIL): per-panel clip verdict vs mask typename -
  PASS (8/8 explained); hole preservation by visual JPEG - PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): find or build a pattern whose panel
  outline is a genuine multi-subpath compound and run the makeMask branch in a
  real job.
