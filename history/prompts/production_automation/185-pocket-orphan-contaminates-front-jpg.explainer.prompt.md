---
id: 185
title: Pocket orphan contaminates Front JPG
stage: explainer
date: 2026-09-11
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat) debug YM1.jpg white pocket over Front
labels: ["hoodie","pocket","clipping","orphan-cleanup","deferred-export","debug"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (inspected, not modified)
 - C:/Production/testing_hoodie_with_pocket/testing_hoodie_with_pocket/debug_log.txt (evidence)
 - C:/Production/testing_hoodie_with_pocket/testing_hoodie_with_pocket/hoodie_warnings.txt (evidence)
 - C:/Production/testing_hoodie_with_pocket/testing_hoodie_with_pocket/YM/YM1.jpg (symptom)
tests:
 - none (diagnosis only)
---

## Prompt

C:\Production\testing_hoodie_with_pocket\testing_hoodie_with_pocket\YM\YM1.jpg ye is trha se q ayi he ?? dekhna pattern and mockup ? is k uper q a gyi he ye pocket front k , debug check kro is ka , or mera project me kese he , kia error mistakle he

(follow-up, mid-turn)
C:\Production\testing_hoodie_with_pocket\testing_hoodie_with_pocket\hoodie_warnings.txt

## Response snapshot

Root cause chain, confirmed from hoodie_warnings.txt + debug_log.txt:

1. `YM Pocket` in pattern.ai is a **bare PathItem**, not a group. (Same file's hood
   sides are bare paths too — four "side is a bare PathItem, not a group" warnings.)
2. `findPlacementPath` (jsx:5048) returns the container itself for a bare path, so
   `pocketBaseShape === dupPocket`.
3. The clipHost walk (jsx:12704) starts at `pocketBaseShape.parent` — the Layer — so
   the `if (hostNode === dupPocket) break` guard never fires; it walks out of the
   piece, finds nothing clipped, and falls back to `clipHost = dupPocket`.
   → warning: "no clipping group found around the piece's outline".
4. `pocketBaseShape.duplicate(clipHost, …)` / `frontState.pastedDesign.duplicate(clipHost, …)`
   (jsx:12827-12828) try to duplicate INTO a PathItem → Illustrator throws
   "the new object cannot be created at the specified location".
   → warning: "could not duplicate Front's design for clipping".
5. jsx:12832 `return` — **with no cleanup of `dupPocket`**. The pocket was already
   staged at jsx:12657 h-centred on the Front, bottom flush with the Front's hem,
   and already painted with the Front's panel colour (white) at jsx:12760.
6. JPGs render at end-of-document from final state ("EXPORT: rendering 6 JPG(s) …
   from its final state"), so the orphan is inside the Front's artboard when YM1.jpg
   is written → white pocket blob over the ALOHA artwork.

Severity note: a Pocket failure silently destroyed a **Front** that had built
cleanly. `hoodieResolveLocalTagVsPocket` already has the right discipline
(`finally { tmpPocket.remove() }`); `hoodieBuildPocket` has none.

Same orphan-leak class also exists at jsx:12046 (`hoodieBuildVariant` returns after
`dupHood` was duplicated) — less visible only because the hood is never staged on
top of another panel.

Three fixes proposed (not yet applied, awaiting edge-case answers):
- A: try/finally in `hoodieBuildPocket` so every early return removes `dupPocket`.
- B: when `clipHost` is not a GroupItem, wrap `dupPocket` in a fresh group and host
  the clip there — makes a bare-path pocket piece actually build.
- C: start the clipHost walk at `pocketBaseShape` itself, and same finally-cleanup
  at jsx:12046.

## Outcome

- ✅ Impact: exact root cause and failing line identified; no code changed yet
- 🧪 Tests: none (diagnosis only)
- 📁 Files: none modified
- 🔁 Next prompts: apply fix A+B+C after confirming pocket-piece fallback behaviour
- 🧠 Reflection: the "X built and exported" log line missing from debug_log.txt was
  the fastest discriminator — every successful builder ends with one, so its absence
  pinpointed the early-return branch before any warnings file existed

## Evaluation notes (flywheel)

- Failure modes observed: silent early return leaving a staged duplicate in the order
  document; deferred end-of-document export turns any orphan into a corrupted panel
  JPG for a DIFFERENT, already-correct piece
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): wrap `hoodieBuildPocket` body in
  try/finally with `if (!pocketPlaced && dupPocket) dupPocket.remove()`
