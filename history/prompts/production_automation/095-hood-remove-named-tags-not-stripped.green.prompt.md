---
id: 095
title: Hood remove-named tags not stripped
stage: green
date: 2026-08-12
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["hoodie", "hood", "border", "remove-named-items", "size-tags", "renameSizeTags"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - Read-only evidence from Backend/uploads/b1c5568a-.../renders/debug_log.txt (job deleted mid-analysis; same evidence re-confirmed on job 560c9a19-...)
 - Zoomed crop of XL_Outside_Hood.jpg to inspect the truncated left-piece tag
---

## Prompt

mockup me mene S-outside and inside ko remove ka nam dia tha , lekin ye remove nhi hue hen ,. q ?D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\b1c5568a-8f1a-44a2-a547-cc2208133523\renders\XL_Outside_Hood.jpg is me dekho ,or left side wala to cut ho gya he naam

## Response snapshot

Two separate causes, both established from the job's own debug log rather than inference.

**1. "remove"-named items surviving on Hood/Border — root cause found and fixed.**

`removeNamedItems()` (defined at `automate_production.jsx:1809`) was called from exactly ONE place:
`automate_production.jsx:672`, inside the main per-item loop. The debug log confirms it only ever ran
for `front`, `back` and `sleeve-long` — never for Hood, Border or Pocket:

```
Checking for 'remove'-named items (test-print size tags) in front...
   - Removing 'remove' (GroupItem) from design.
   - Total 'remove' items removed: 1
```
(repeated for back / sleeve-long only; zero occurrences for any Hood or Border part)

Hood and Border do not go through that loop — they are built by `hoodieBuildVariant` /
`hoodieBuildBorder`, which paste the mockup design via `hoodiePasteDesign()` (line 5920).
That function duplicates the mockup side group, embeds, fixes rasters, merges swatches, applies the
base fill, clears strokes and aligns — but never stripped `remove`-named items. So the mockup's
"remove" group (the test-print size tags "S-outside" / "S-inside") rode along onto every Hood and
Border export.

Fix: added the same cleanup call inside `hoodiePasteDesign`, positioned BEFORE `alignAndScale` for
the same reason as the main loop (the design must scale on clean bounds). One insertion covers Hood
Left, Hood Right and Border, since all three route through this function. Pocket is unaffected —
it clips the already-cleaned Front artwork.

**2. Left hood piece showing "XL" instead of "XL Outside Hood" — NOT a rename failure.**

The log proves both sides were renamed successfully:
```
HOODIE: Outside Hood Left-piece tag updated to 'XL Outside Hood' (1 tag).
HOODIE: Outside Hood Right-piece tag updated to 'XL Outside Hood' (1 tag).
```

A 5x zoom of the render shows the left piece's text terminating exactly at the piece's right-hand
(seam) edge, with empty white space beyond it — i.e. the extra words are being cut at the piece
boundary, not failing to be written. The asymmetry is explained by anchor direction: the right
piece's tag sits at its LEFT edge so the longer text grows inward and stays visible; the left
piece's tag sits at its RIGHT edge so the longer text grows outward past the boundary and is cut.

Two candidate mechanisms remain, and they need one look at `pattern.ai` to separate:
(a) the pattern piece group is itself a clipping group, so the overflow is masked away, or
(b) the tag is AREATEXT whose text box ends at the piece edge, so the overflow is hidden.
`resizeTagBox()` (line 1681) only grows the tag's background PathItem sibling — it never resizes the
TextFrame's own area, so it cannot help in case (b). NOT fixed yet; deliberately left pending
verification rather than guessed at.

Also noted: the scratchpad Offset Path verification run (`b3qdv5dwj`) failed with
`com_error -2147023170 'The remote procedure call failed'` because it collided with the user's live
production run on the same Illustrator instance. Illustrator did not crash.

## Outcome

- ✅ Impact: Hood and Border exports will no longer carry the mockup's test-print size tags.
- 🧪 Tests: Evidence-only (debug_log + render inspection); no pipeline run yet — Illustrator was busy with the user's production job.
- 📁 Files: `Backend/scripts/automate_production.jsx` (one insertion in `hoodiePasteDesign`)
- 🔁 Next prompts: confirm the left-tag truncation mechanism against `pattern.ai`, then decide the fix (re-anchor vs. right-align vs. resize the text area).
- 🧠 Reflection: The log answered "why" outright for issue 1 and disproved the obvious guess for issue 2 (rename failure) — reading the job's own log first avoided two wrong hypotheses.

## Evaluation notes (flywheel)

- Failure modes observed: a cleanup step added to the main per-item loop was never mirrored into the HOODIE branch's parallel paste path — the two paths have drifted before (base fill, clip setup, placement-path lookup) and are worth auditing as a whole.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): open `pattern.ai`, inspect one hood piece's tag TextFrame for `kind === TextType.AREATEXT` and check whether the parent group is `clipped`.
