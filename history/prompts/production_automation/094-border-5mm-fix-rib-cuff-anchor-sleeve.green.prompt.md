---
id: 094
title: Border 5mm typo fix and Rib and Cuff anchored below Sleeve
stage: green
date: 2026-08-11
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija9452
command: N/A
labels: ["hoodie", "rib-and-cuff", "border", "layout-anchoring"]
links:
  spec: history/prompts/production_automation/093-implement-hoodie-flow.green.prompt.md
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check (via temp .js copy) on automate_production.jsx - PASS
---

## Prompt

"or ek size ki ek hi pockt and and ek ek hi border and outside inside hood hon ge , until n unless koi personalization na hon ,"

"or border and rib n cuff kitne bnen ge ?? ek hi bnen ye bhi , border front k niche ho 5mm gap se or rib n cuf sleeve k niche ho 5mm gap se"

Clarification round: "front k niche hoga border production me 5mm gap se (55 typo tha) 2. Sb pr hi agr rib n cuff he to sb me hi sleeve k niche 5mm gap se 3. existing behaviour hi"

## Response snapshot

Confirmed the "one Pocket/Border/Outside Hood/Inside Hood per size, not per quantity" requirement was ALREADY satisfied by the existing `hoodieFrontBySize` architecture (PHR 093) - each size's cache entry gets overwritten by every Front instance of that size, so `buildHoodieExtras` naturally runs once per distinct size regardless of how many personalized units share it, and Hood/Pocket/Border never received any per-unit personalization in the first place. No code change needed for that part.

Two real changes made:

1. **Border gap 55mm -> 5mm**: user confirmed "55 tha typo" - fixed `hoodieBuildBorder`'s gap constant, now reuses the same `GAP_5MM_PT` global added for Rib & Cuff below (previously a border-local `GAP_55MM_PT`). Updated all comments/log strings that said "55mm" to "5mm".

2. **Rib & Cuff anchored 5mm below its size's Sleeve - GENERAL fix, not Hoodie-scoped** (confirmed explicitly: "Sb pr hi agr rib n cuff he to sb me hi sleeve k niche" = applies to every job that has a Rib & Cuff item, Hoodie or not). Rib & Cuff is a pre-existing general part (not introduced by Hoodie), previously flowing through the normal per-item row-flow like any other item with zero special positioning. Added:
   - `ribCuffSleeveBySize` global cache (sizeLabel -> {leftX, bottomY} of the last Sleeve placed for that size - "last wins", same simplicity as the existing `pmLastSleevePanel`).
   - `isRibCuffPart` computed early (right after `isAcc`, before placement) from `item.part_name`.
   - At placement time: if `isRibCuffPart` and a cached Sleeve exists for this sizeLabel, `pastedPattern.left/top` are set directly below that Sleeve's actual final position (5mm gap) instead of the normal `currentX/currentY` row-flow slot; a `ribCuffAnchored` flag is set.
   - The artboard's `finalRect` now reads `pastedPattern.left/top` (the item's ACTUAL placed position) instead of raw `currentX/currentY` - a small generalization needed so the artboard always matches wherever the item really ended up, correct for both the normal flow and the new anchored case.
   - Sleeve's own final position (post any FULL-BUTTON/SLEEVE-PAIR override) is cached into `ribCuffSleeveBySize` right after placement, for every `isSleevePart` item (any sleeve type/side).
   - Row-flow advancement at the end of the item's processing skips entirely when `ribCuffAnchored` (new first branch ahead of the existing `sleevePairStacked`/else split) - anchored Rib & Cuff never touched `currentX/currentY`, so there's nothing to advance or restore, consuming zero row-flow space, matching how the Hoodie Border above (also anchored, not flowed) behaves.
   - Graceful fallback: if no Sleeve has been cached yet for that size when Rib & Cuff is processed (order-dependent - Sleeve must appear earlier in that size's item list), it silently falls back to the normal row-flow placement rather than erroring.
   - Left "existing behavior" (one Rib & Cuff per size regardless of quantity) untouched per explicit instruction - no new dedupe mechanism added, since the user confirmed current quantity-driven behavior already covers it.

## Outcome

- ✅ Impact: Border now sits 5mm (not 55mm) below Front. Rib & Cuff, when present in ANY job (not just Hoodie), is now anchored 5mm below its size's Sleeve instead of flowing into the next row-flow column.
- 🧪 Tests: node --check PASS. No automated visual test - needs a real job with Rib & Cuff to confirm the anchored position looks correct and doesn't visually collide with adjacent flowed items (each artboard still exports its own independently-clipped JPG regardless).
- 📁 Files: Backend/scripts/automate_production.jsx only.
- 🔁 Next prompts: Run a real job with Rib & Cuff (Hoodie and non-Hoodie) to confirm the 5mm-below-Sleeve anchor, and a Hoodie job to confirm Border's corrected 5mm gap.
- 🧠 Reflection: Rib & Cuff's anchoring is order-dependent on Sleeve appearing earlier in that size's item list - not yet confirmed against a real plan's typical item ordering. If a real job ever shows Rib & Cuff falling back to normal-flow placement (i.e., the cache was empty), that's the signal this ordering assumption doesn't hold and needs a different trigger point (e.g. a post-pass like Hoodie's, rather than inline caching).

## Evaluation notes (flywheel)

- Failure modes observed: None yet - untested against a real Illustrator file.
- Graders run and results (PASS/FAIL): N/A.
- Prompt variant (if applicable): N/A.
- Next experiment (smallest change to try): Grep a real generated production_plan.json to confirm Sleeve items are always ordered before any Rib & Cuff item within the same size group; if not guaranteed, move the Rib & Cuff placement into a post-pass instead of inline caching.
