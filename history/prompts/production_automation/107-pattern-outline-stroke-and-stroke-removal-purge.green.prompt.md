---
id: 107
title: Pattern Outline Stroke And Stroke Removal Purge
stage: green
date: 2026-08-15
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (conversation)
labels: ["illustrator", "strokes", "base-path", "hoodie", "size-tags", "scaling"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - node --check on automate_production.jsx (copied to .js) after every edit - PASS
  - Illustrator COM measurement of mockup.ai vs pattern.ai (read-only probe) - completed
  - Production log review of job 372ba14b (hood 3mm gap, design_scale_mode) - PASS
  - grep audits: no clearAllStrokes remains; single removeBasePaths reachable from both callers - PASS
---

## Prompt

acha ye 1 pt ki stroke ko 3 pt ka hi krna he order me , jese front and back me or jo bhi outline ki stroke ja rhi hen sb 3pt ki honi chahhiye heb

Follow-ups in the same session:

- "just outline jo 1 pt a rhi he , un me 3pt jaye ga , bss, baki aesa hi rhe , neck, twill tape , Tukdi , hoodie, Border Rib & Cuff in me stroke ko remove kia gya he , qkl is me base-path nhi hota he , to ab se in me bhi base-path hoga , to stroke remove krne wali logic hta do , or ye outline ki stroke 1 pt agr ho to 3 pt hi jaye gi , suirf outline pr hoti he ye , or kisi stroke ko nhi kharb krna he , clear ??"
- "hn thk he , or base-path remove hota he to jesa base-path fill hota he wesa pattern fill ho jata he ??"
- "strokes sirf pattern ki krni hen 3 pt , baki whi same logic he bss"
- "ye pattern ki stroke jb dup ho tb hi 3 pt kr dena"
- "jese border ki logic he wese hi rkho hood ki bhi , pattern ki stroke and size tags na remove hon , q ho rhe hen , kis ne lgaya fix ye kb ?"
- "hood me size tags bhi nhi a rhe hen jo dynamically rkh the , k ye outside hood he size k sath or ye inside ,"
- "pattern pr likha hua hota he size , just outside and inside hi likhna he"
- "size jo already hoga pattern me , us k sath Outside/inside likh dena bs ,"
- "clearAllStrokes ke aar-paar bachana ye kia he , ye to mene nhi kaha he , mene to base-path ka kaha tha"
- "clear all strokes ka pura function hta do , kahi se koi stroke remove na ho , kahi se bhi"
- "to ab base-path hoga na , to base-path delete ho jaye ga na" / "ab hr design me hoga base-path"
- "Neck , Twill tape, Tukdi , Patti , Border, Hood , in sb me bhi base-path delete hoga"
- "to border and hood ko alg se q treat kia ja rha he" / "or base-path name se dhoonda jata he , or delete hota he , dekho front me , tm ne kia impelment kr dia he" / "front wala call kr do , j npehle tha"

## Response snapshot

### Measurement that started it

Read-only Illustrator COM probe (opened nothing that was already open, closed only its own copies) compared job 372ba14b's mockup against its pattern:

| | geometricBounds | visibleBounds | stroke |
|---|---|---|---|
| mockup `base-path` | 1681.17 x 2056.67 | 1684.17 x 2063.07 | 3pt |
| pattern Small Front | 1681.17 x 2056.67 | 1682.17 x 2058.80 | 1pt |

Geometry is IDENTICAL - the mockup really is drawn on the Small panel, as the user said. The only discrepancy is the stroke, and because both scalers measure `visibleBounds` (which includes stroke), the height-only scale computed 2058.80 / 2063.07 = **99.79%** where 100% was intended. `getDesignBaseFill` copies the base-path's FILL onto the panel but never its stroke, which is how the two drifted apart.

### Changes

1. **`PATTERN_OUTLINE_PT = 3`** (`:301`) and **`applyPatternOutlineStroke`** (`:6213`) - sets width only, on one path (the placement path), never the colour, and never invents a stroke on an unstroked outline. Called the moment a piece is duplicated: `:640` (main loop) and `:6790-6791` (both hood halves). Duplication time is also the only correct time - the artboard bounds are measured on the very next line, and a piece measured at 1pt then stroked at 3pt loses ~1pt per side off its own artboard.

2. **`clearAllStrokes` deleted entirely** - the function plus all four callers (main loop's accessory/Patti/Rib&Cuff design wipe, `hoodiePasteDesign`, `hoodieBuildVariant`'s whole-piece wipe, `hoodieBuildBorder`'s). Also removed Rib & Cuff's `baseShape.stroked = false`. Nothing in the file strips a stroke now. The hood/border whole-piece wipes were what erased those pieces' own cut outlines, so a 3pt outline could not have survived to export on them otherwise.

3. **Hood size tags fixed** (`:6838-6839`) - the tag was never being deleted; the log proves it is renamed correctly ("1 tag" per half). `hoodiePasteDesign` moves the design clip group in FRONT of the piece's outline, which also puts it above the tag group, so a hood design that reaches the tag area paints it out. `bringPatternLabelsToFront` is the existing fix for exactly this - the main loop, Border and Pocket all carry it; Hood was the one builder it was never added to. Applied per half, since each half owns its own clip group.

4. **Hood tag text** (`:6811`) - `sizeLabel + " " + variantLabel`, so "Small Outside" / "Small Inside". The word "Hood" is gone and the pattern's own size word is preserved (renameSizeTags matches on sizeLabel, so sizeLabel IS that word).

5. **`removeBasePaths` lifted to a shared helper** (`:2079`) and called from both `:883` (main loop) and `:6414` (hoodiePasteDesign - Hood halves and Border). It had been declared INSIDE the item loop, which is the whole reason Hood and Border never removed their base-paths. The EXACT three-spelling name test is unchanged; only `item.part_name` became a `label` parameter and `removedCount` became the return value. An earlier attempt used `removeNamedItems` instead - rejected, correctly, because that helper matches on PREFIX and would also delete a legitimately-named "base-path guide".

### Answered without code change

- Base-path fill: `getDesignBaseFill` (`:5577`) copies the base-path's fill onto the panel BEFORE `removeBasePaths` deletes it - priority is the named `base-path`, else the largest filled path, "logo"-named paths skipped, applied as-is (solid CMYK, spot or gradient).
- Why Patti needed no separate handling but Hood/Border did: `isPatti`/`isAcc`/`isRibCuff` all derive from `item.part_name`, so Patti, Neck, Twill Tape and Tukdi are ORDER ITEMS and flow through the main loop. Hood/Border/Pocket are synthesized from the hoodie checkbox and appear in no plan item, so they got a parallel `hoodiePasteDesign` pipeline - which is why five separate fixes had to be applied twice this session.
- "Who added this fix and when": nobody - `git show HEAD:...jsx | grep -c "dupHood\|dupBorder"` returns 0. The entire hoodie builder is uncommitted working-tree code with no git history.

## Outcome

- ✅ Impact: pattern outlines print at a uniform 3pt everywhere including Hood and Border, no stroke is stripped anywhere in the pipeline, hood size tags survive to export, and Hood/Border finally delete their base-path. Matching the outline to the mockup's 3pt should also close the 99.79% -> 100% scale gap.
- 🧪 Tests: `node --check` passed after every edit; grep audits confirm zero `clearAllStrokes` remain and one `removeBasePaths` serves both callers. NOT yet run through Illustrator - none of these six changes has executed against a real job.
- 📁 Files: 1 - `Backend/scripts/automate_production.jsx`.
- 🔁 Next prompts: run a hoodie job and check (a) hood tag visible and reading "{Size} Outside"/"{Size} Inside", (b) 3pt outline on hood/border, (c) scale at 100%, (d) whether Twill Tape/Tukdi/Patti now show stray strokes their old cleanup used to hide.
- 🧠 Reflection: the 3pt request and the 99.79% scale anomaly turned out to be the same defect seen from two ends - fill transfers from the mockup's base-path but stroke does not, and visibleBounds carries stroke into every scale calculation.

## Evaluation notes (flywheel)

- Failure modes observed: twice implemented more than was asked - a save/restore around `clearAllStrokes` and a rewritten base-path remover - both correctly rejected by the user. The lesson is to reach for the EXISTING function before writing a variant of it, and when a caller cannot see that function, move it rather than reimplement it.
- Known regression risk, flagged not silently accepted: the removed accessory cleanup existed because Twill Tape/Tukdi/Placket carry no base-path fill for a stray stroke to blend into, and its own comment called the result "an out-of-place line on the finished part". Those strokes now print.
- Graders run and results (PASS/FAIL): node --check PASS (every edit); clearAllStrokes-absent grep PASS; removeBasePaths single-definition/two-caller grep PASS; scope check (helper at 4-space indent inside runAutomation, both callers deeper) PASS.
- Next experiment (smallest change to try): one Small-only run, then re-measure panel vs design visibleBounds with the same COM probe to confirm the scale lands at 100.00%.
