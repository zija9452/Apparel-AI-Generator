---
id: 103
title: Border Front Left Align Rib Centred
stage: green
date: 2026-08-13
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (conversational)
labels: ["layout", "hoodie", "border", "rib-cuff", "artboard-flow"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - scratchpad/test_layout.jsx (32 assertions, 32 PASS)
 - scratchpad/dump_artboards.jsx (ground-truth artboard map of the finished order file)
 - scratchpad/probe_front_box.jsx (isolated the overhanging child group)
 - node --check on the modified automate_production.jsx (SYNTAX OK)
---

## Prompt

"""D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\d5d953b8-59d1-4a72-897b-68b7528692b0""" is me production ai file me jao , or btao k q jb front start hota he to thra right side se hota he jb k border thora right se hota he , ye sequence q nhi he ?? or sleeve k niche agr rib he to sleeve k center me aye wo bottom pr , or us ka sequence bhi btao mjhe

(follow-up, mid-turn) jhn border he whi pr front bhi rkh do

(follow-up, mid-turn) lekin is trha phr wo overlap kre ga niche ki lines se , jo 15mm k gap pr hen

## Response snapshot

Measured the finished `renders/production_ready_order.ai` directly (27 artboards) instead of
reasoning from the code. Real layout, per size, left to right:

    Front | Back | Long Sleeve Right | Long Sleeve Left | Outside Hood | Inside Hood | Pocket
            with Rib & Cuff anchored under the last Sleeve, and Border anchored under the Front

Build order is the plan's item order (front, back, sleeve-long, cuff) followed by
`buildHoodieExtras`: Outside Hood -> Inside Hood -> Border -> Pocket.

**Finding 1 - the Border was NOT flush with its Front.** Every piece and every size
label starts at x = -7500. The Border started at -7769.5 (Small) / -7809.1 (XL) /
-7825.4 (2XL): a different overshoot each size.

Root cause: `hoodieBuildBorder` anchored to `frontState.pastedPattern.visibleBounds[0]`
- the Front GROUP's box. That group holds the pasted mockup design in a clip group whose
`visibleBounds` reports its PRE-clip extent, so the box runs 270 / 309.6 / 325.9pt past
the panel's real left edge (confirmed by `probe_front_box.jsx`: the only child flagged
outside the artboard is the unnamed `clipped=true` group, and its box equals the whole
Front group's box). `hoodieBuildPocket` already documents this exact trap and anchors to
`frontState.baseShape` instead - the Border simply never got the same treatment.

**Finding 2 - the vertical position was already correct and must not move.** The user
raised this before any change was applied: XL Border bottom 2124.1 -> next row's label top
2081.6 = 42.5pt = exactly the 15mm `vSpacing`. The Border's TOP is measured from the same
overhanging group bottom, which is what keeps it clear of the Front's artwork. So the fix
changes X only; `dupBorder.top` is left byte-for-byte alone.

**Finding 3 - Rib & Cuff was left-aligned, not centred.** `ribCuffSleeveBySize` cached only
`{leftX, bottomY}`, so the Rib shared the Sleeve's left edge with all the slack on the right
(XL: 736.6pt rib under a 1624pt sleeve = 887pt of it). Cached `width` as well and inset the
Rib by half the difference.

## Outcome

- ✅ Impact: Border's left edge now lines up under its Front on every size (was 270-326pt
  further left, size-dependent); Rib & Cuff is centred under its Sleeve (inset 377.8 / 443.7 /
  481.3pt for Small / XL / 2XL). Vertical flow, the 5mm gaps and the 15mm row gap are
  untouched by design.
- 🧪 Tests: `test_layout.jsx` on the real pattern pieces - 32/32 PASS. Covers: OLD anchor
  genuinely off the Front's edge, NEW anchor == the Front's own left edge, Border lands on
  the sheet margin, Border still clears the Front's lowest artwork, Border TOP unchanged
  (the 15mm guarantee), rib centred / never pushed left of the sleeve / stays inside the
  sleeve's column / 5mm below the hem, plus two guards (rib wider than its sleeve, and a
  cache entry with no `width`, both falling back to left-aligned rather than NaN).
- 📁 Files: `Backend/scripts/automate_production.jsx` - three edits (rib centring, sleeve
  width cached, Border left anchor).
- 🔁 Next prompts: run a full pipeline job and confirm the Border/Rib positions in real
  renders - no end-to-end run has covered this or the hood smart-contrast fix in PHR 102.
- 🧠 Reflection: reading the finished .ai's artboard rects first turned a guessable question
  into a measured one. Two hypotheses (geometric-vs-visible bounds; a tag sticking out of the
  group) were both killed by probes before any code was touched.

## Evaluation notes (flywheel)

- Failure modes observed: `pageItem.left` was assumed to be geometric bounds; it is actually
  visibleBounds[0] (probe: setting `.left = -7500` gives geoL -7499.5, visL -7500). A clipped
  GroupItem's `visibleBounds` reports the PRE-clip extent, so a group can measure far larger
  than it renders - this is the same class of trap as the phantom `GrayColor(0)` in PHR 102.
- Graders run and results (PASS/FAIL): test_layout.jsx 32/32 PASS; node --check SYNTAX OK.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): audit the other `*.visibleBounds` anchors in the
  hoodie path (Hood, Pocket) for the same group-vs-baseShape confusion.
