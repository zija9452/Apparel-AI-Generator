---
id: 033
title: Size tag label personalize and clip
stage: green
date: 2026-07-14
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["size-tag", "clipping-mask", "personalization", "3-inch-width", "illustrator-automation"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check syntax validation (PASS)
 - runtime verification pending: user to regenerate an order and confirm SIZE-TAG renders clipped, 3in wide, correct letter
---

## Prompt

mjhe tag mask nhi aya he samjh , qk size tag bhi to whi group he na , ek hi group he to layer kis ka nam den ge tag mask ka?

to tag-mask wala kam to size tag se bhi ho jaye ga na , qk main group hi size-tag he usi me clip krna he na

KR DIYE HEN , AB CODE BHI UPDATE KR DO IS K ACCORDING

## Response snapshot

Clarified that a clipping mask needs a path, not a group - but since the mockup label is already clipped, its mask path already exists inside the SIZE-TAG group, so no TAG-MASK naming is needed by the designer (only SIZE-TAG group + SIZE text frame). Implemented in automate_production.jsx:

1. releaseInternalClippingMasks now takes an insideSizeTag flag; when it releases the clip of a SIZE-TAG group (or any group inside one), it renames the released clip path to "TAG-MASK" so it can be found again after scaling.
2. New helpers normalizeItemName / findByNormalizedName (name-tolerant DFS: "SIZE-TAG", "size_tag", "Size Tag" all match) and sizeToAbbrev (XS/Small/Medium/Large/XL/2XL/3XL/4XL -> XS/S/M/L/XL/2XL/3XL/4XL; anything containing "xl" passes through uppercase; neck care label's SM/MD logic untouched).
3. New processSizeTagLabel(designGroup, sizeLabel), called in the main flow after alignAndScale and before bringLogosToFront: sets the SIZE text frame to the abbreviation, resizes the whole label group uniformly so the TAG-MASK box is exactly 216pt (3in) wide (measured on the mask, not the inflated group bounds), then moves TAG-MASK to the top of the group and sets clipped=true to rebuild the label's own mask.

No backend change needed: illustrator_automation.py rebuilds automation_bundle.jsx from scripts/automate_production.jsx on every job.

## Outcome

- ✅ Impact: Size tag label now gets per-size letter (S/M/L/XL/2XL...), fixed 3in box width in every size, and its stitch lines clipped back inside the label box.
- 🧪 Tests: node --check syntax PASS; end-to-end pending a regenerated order (needs Illustrator run).
- 📁 Files: Backend/scripts/automate_production.jsx (3 edits).
- 🔁 Next prompts: regenerate the order for job b65820ed... and inspect the SIZE-TAG in production_ready_order.ai; check debug_log for "SIZE-TAG label found" lines.
- 🧠 Reflection: rebuilding released clips by tagging the mask path at release time avoids both the resize-crash workaround and any designer-side TAG-MASK naming requirement.

## Evaluation notes (flywheel)

- Failure modes observed: none yet; watch for a mockup where SIZE-TAG has no clip mask (fallback warning logs "no TAG-MASK path").
- Graders run and results (PASS/FAIL): node --check PASS
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): if the label must sit at a fixed spot (e.g. bottom-left of panel) rather than scaling in place, add an anchor rule after the 3in resize.
