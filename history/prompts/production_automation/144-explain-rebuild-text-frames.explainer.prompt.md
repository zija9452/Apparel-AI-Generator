---
id: 144
title: Explain Rebuild Text Frames
stage: explainer
date: 2026-08-20
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct question)
labels: ["neck", "text-frames", "illustrator", "jsx", "export", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (none - explanation only, no code changed)
tests:
 - debug_log.txt of the swatchcheck run: 7 necks, "Rebuilt 1 pattern text frame(s)" each
---

## Prompt

rebuildTextFrames (jsx:1442) │ pattern ka brand text dobara banata hai, warna export par silently render nahi hota ye samjh nhi aya he

## Response snapshot

The row was from the PHR 143 neck-logic table and needed unpacking.

**The defect it works around.** Some text frames inside `pattern.ai` carry a corrupt
appearance. Such a frame looks perfectly normal on screen but **vanishes at JPEG
export** - no error, no warning, nothing in the log. Worse, the corruption travels with
the frame: duplicating it produces an equally invisible copy. Only a **brand-new** frame
with the same font/size/attributes renders. That test is recorded in the function's own
comment (jsx:2625-2631).

**What the function does** (jsx:2632): for each live text frame in the pattern panel it
reads contents, font, size, horizontal/vertical scale, tracking, leading/autoLeading,
fill colour, justification and position; creates a **fresh** frame; copies all of it
across; puts the new frame at the old one's z-order slot (`nf.move(tf, PLACEBEFORE)`)
and exact position; then deletes the old frame. Visually identical, minus the corrupt
appearance.

**Why neck only** - jsx:1442 guards with `if (isNeck)`. The neck pattern piece is the one
carrying brand text (e.g. "BIG KID"); that is where the bug appeared. Other panels have
no pattern-side text.

**Why after smartContrast** - smartContrast flips the text white or black against the
panel colour; the rebuild copies whatever fill is current, so running it second carries
the *final* colour. Reversed, it would copy the pre-contrast colour.

`design_clip_group` is skipped (jsx:2635) - that is the pasted mockup artwork, whose text
belongs to the replacement flow.

**Evidence:** the swatchcheck run logged "Rebuilt 1 pattern text frame(s)" exactly 7
times for 7 neck panels - one frame each, the size/brand label seen as the white "2XL" in
`2XL_Neck_Item1.jpg`.

## Outcome

- ✅ Impact: Clarified a non-obvious workaround so it is not mistaken for redundant work and removed later.
- 🧪 Tests: log evidence only (7 necks x 1 rebuild).
- 📁 Files: none changed.
- 🔁 Next prompts: led directly into the kerning investigation (PHR 145) - the same "contents assignment resets formatting" family of bug.
- 🧠 Reflection: The comment in the code explained WHAT was done but the user needed WHY a duplicate does not fix it - that the corruption is sticky is the whole point.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a (explanation).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): consider whether the same corrupt-appearance rebuild should run on every part rather than neck only - currently untested elsewhere because no other panel carries pattern-side text.
