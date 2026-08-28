---
id: 162
title: Why Patti size tag is not clipped
stage: explainer
date: 2026-08-22
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat)
labels: ["patti", "size-tag", "clipping-mask", "extendscript", "full-button-jersey", "root-cause"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (read only - no edit yet)
tests:
 - live COM inspection of Backend/uploads/8fcab6ee-.../renders/production_ready_order.ai (already open in Illustrator - not opened, not closed, not saved)
---

## Prompt

full button me patti me clipped q nhi he size tag ?? jis trha front back , pocket or dusre me hoty hen ? patti me q nhi he ??

(follow-ups: "clipped nhi he , jb k wo pic me to de rha he , pd ki .ai file open kro is ki , or code analyze kro", "short me btao 2 lines me", "kia plan he , kese resolve hoga ??")

## Response snapshot

### Measured, not guessed - live DOM of job 8fcab6ee

Front Left (tag IS clipped):

```
GroupItem 'XL Front Left'  clipped=true  kids=2
  PathItem clipping=true                          <- the piece's own mask
  GroupItem 'design_clip_group' clipped=true kids=4
    PathItem clipping=true                        <- clip mask
    GroupItem 91x17 -> TextFrame 'X-LARGE'        <- SIZE TAG, inside the clip
    GroupItem 'center' ...                        <- design
    GroupItem 'Front Left' ...
```

Patti (tag is NOT clipped):

```
GroupItem 'XL Patti'  clipped=false  kids=2       <- not a clipping group at all
  GroupItem ''  clipped=true kids=2               <- strip A, its own clipping group
    PathItem clipping=true
    GroupItem 'design_clip_group' clipped=true    <- one level DEEPER than the lookup reaches
  GroupItem ''  clipped=true kids=1               <- strip B, its own clipping group

Layer 1 root #1  GroupItem 91x17 -> TextFrame 'X-LARGE'   <- Patti tag, at DOCUMENT ROOT
Layer 1 root #2  GroupItem 91x17 -> TextFrame 'X-LARGE'   <- second Patti tag, same
Layer 1 root #4  GroupItem 91x17 -> TextFrame 'X-LARGE'   <- Neck tag, same (different cause)
```

### Root cause

`bringPatternLabelsToFront` (`:2228-2233`) resolves the destination ONCE per piece and
only among DIRECT children:

```js
for (var cg = 0; cg < container.groupItems.length; cg++)
    if (container.groupItems[cg].name === "design_clip_group") { clipGroup = ...; break; }
```

- Front/Back/Sleeve: `baseShape` is a direct child, so `clipGroup.move(baseShape, PLACEBEFORE)`
  (`:1285`) leaves `design_clip_group` a direct child too -> found -> the tag is moved into it
  (`:2288`) and is clipped to the panel silhouette. That is why Front Left's tag renders
  visibly cut off at the panel edge in the JPG.
- Patti: the pattern draws TWO strips, each its own clipping group, wrapped in a plain
  `XL Patti` group. `findPlacementPath` returns strip A's outline, so `design_clip_group`
  lands INSIDE strip A - not a direct child of `XL Patti`. Lookup fails, `clipGroup` stays
  null, and the `else` branch (`:2290-2291`) runs:
  `moveTarget.move(dest /* orderDoc */, PLACEATBEGINNING); zOrder(BRINGTOFRONT)`.
  The tag leaves the piece entirely and sits at the document root - unclipped, but still
  physically over the patti, which is why it still shows in the export.

Second, DIFFERENT cause with the same symptom - Neck in this job: `remove` + `base-path`
deletion emptied the design, so `:1275`'s `pastedDesign.pageItems.length > 0` was false and
no `design_clip_group` was ever built ("Setting up Clipping Mask" is absent from the Neck
block of debug_log.txt, present in the Patti block). Same `else` branch, same root landing.

### Plan agreed for the fix (not yet implemented)

Resolve the destination PER LABEL from its own ancestor chain instead of once per piece:
climb to the nearest `clipped=true` ancestor, prefer that ancestor's `design_clip_group`
child, else the ancestor itself; insert right after `pageItems[0]` so the mask stays
frontmost. Document root remains the last resort. Front/Back/Sleeve resolve to the exact
same group they use today, so their behaviour is unchanged.

## Outcome

- Impact: explains a real, reproducible full-button symptom and localizes it to one lookup
- Tests: live COM read of the already-open order .ai; no document opened, closed or saved
- Files: none modified
- Next prompts: implement the per-label clip-host resolver; then a real job to confirm Front is byte-identical and both Patti tags land inside their own strips
- Reflection: the container-level lookup silently assumed "one piece = one clipping group";
  Patti is the first part that breaks that assumption, and the failure mode is a tag that
  still LOOKS fine in the JPG, which is why it went unnoticed

## Evaluation notes (flywheel)

- Failure modes observed: clip-host lookup limited to direct children; empty-design pieces get no clip group at all
- Graders run and results: n/a (read-only investigation)
- Next experiment: after the fix, re-run job 8fcab6ee and diff the Front Left JPG against the current one - it must be identical
