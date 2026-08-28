---
id: 099
title: Pocket design pasted behind label via Paste in Back
stage: green
date: 2026-08-13
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["hoodie", "pocket", "clipping-mask", "size-tag", "executeMenuCommand", "illustrator-jsx"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - Illustrator harness on job f6b1c036 pattern.ai, shipped logic mirrored, all 3 sizes - Paste in Back taken every time, white area Small 26.9% / XL 27.4% / 2XL 27.8%, size tag + background box visible in every export
 - Variant comparison in the same harness - A(DOM, content on top) 26.7/27.2/27.7 but NO tag; B(pasteBack) correct clip AND tag; C(content below mask) inverted, 72% white
 - node --check on automate_production.jsx (syntax)
---

## Prompt

D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\2f0d702b-a02b-4258-b9b1-01c99dde39bb\renders\Small_Pocket.jpg jo patterns me ye label hota he , wo q nhi a rha he is me ??kia logic he wo front pr lane ki , or is me wo front me q nhi he ?

manual me ye hota he k pattern me ek whi label already clip hota he , to hm bs usi label ko select krte hen or ctrl b kr dety hen to clip ho jata he design usi label k peeche , isse bg color bhi nhi jata he , or clip bhi ek whi pattern me ho jata he

ok , official way deko , or just pr try kro scratchpad pr revert krne k bd

## Response snapshot

**Why the Pocket had no size tag.** The tag was never deleted - it was buried.
`hoodieBuildPocket` put the Front's colour + design on TOP of the pattern piece,
so the base-colour copy covered the tag. Front/Back/Sleeve/Rib & Cuff show theirs
only because `bringPatternLabelsToFront` (automate_production.jsx:1599) is called
from the main per-item loop; the hoodie builders never went through it. Hood is
unaffected - `hoodieBuildVariant` has its own tag handling.

**What the user does by hand:** select the piece's already-clipped label, Ctrl+B
(Paste in Back). The design lands inside the pattern's own clipping group behind
the label - one clip, tag and its background box intact.

**First attempt (wrong):** translating Ctrl+B into a DOM move - content group to
`PLACEATEND` of the clipping group. Measured inverted: design rendered OUTSIDE
the pocket silhouette, the outline's white fill covered everything inside, 72%
white instead of 27%, all three sizes. Reverted.

**Official route (shipped):** `app.executeMenuCommand("pasteBack")` IS the menu
item, so Illustrator resolves the clipping itself. Stage a group holding the
Front's base colour + design, copy it, select the backmost label inside the clip
host, paste back. Verified on the real pattern: Small 26.9% / XL 27.4% / 2XL
27.8% white with the tag visible in all three.

Two traps handled:
- The paste is found BY NAME among the clip host's direct children, never via
  `orderDoc.selection`. On a Small pocket (label anchor is a GroupItem, not a
  TextFrame) the selection comes back with TWO items - the pasted group AND the
  still-selected anchor - so `selection[0]` grabs the pattern's own tag group,
  and the reject path would have deleted it.
- XL/2XL pocket pieces carry two tags, so the anchor is the BACKMOST label
  (`hoodiePocketBackmostLabel`), otherwise one tag stays under the design.

Fallback kept: if there is no label to paste behind, or the menu command does not
return exactly one named group, the previous verified DOM route runs and
`bringPatternLabelsToFront` lifts the tag back over the design.

## Outcome

- ✅ Impact: Pocket exports now carry the pattern's size tag (with its background box) and keep the correct single clip, matching the manual SOP's result at every size.
- 🧪 Tests: harness mirroring the shipped logic across all three sizes plus a three-way variant comparison; syntax check. Not yet re-run through the full pipeline.
- 📁 Files: Backend/scripts/automate_production.jsx (hoodiePocketBackmostLabel helper, Paste-in-Back path + fallback in hoodieBuildPocket, guarded bringPatternLabelsToFront call)
- 🔁 Next prompts: re-run the job and confirm the Pocket tag; decide whether Border needs the same treatment.
- 🧠 Reflection: the operator's manual step named the right mechanism - the mistake was re-implementing it through the DOM instead of calling the same menu command Illustrator runs.

## Evaluation notes (flywheel)

- Failure modes observed: assuming a UI action maps cleanly onto a DOM re-parent; trusting `document.selection` after a menu command.
- Graders run and results (PASS/FAIL): white-area per size PASS (26.9 / 27.4 / 27.8, all ≈ the outline's ~25% outside area); tag-visible check PASS on all three exports.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): check whether the Border piece carries a pattern tag, and if so give hoodieBuildBorder the same Paste-in-Back path.
