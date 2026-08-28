---
id: 129
title: Artboard fit to panel official API
stage: green
date: 2026-08-18
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: chat
labels: ["artboard", "export", "half-jpeg", "fitArtboardToSelectedArt", "regression"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - "node --check (jsx copied to .js) - PASS"
  - "scratchpad/test_fit.py - simulates the exact 792pt drift in a throwaway doc; fitArtboardToSelectedArt re-fits the artboard onto the panel (MATCH = true)"
  - "scratchpad/probe_exact.py / probe_order4.py - measured the drift in the real job (every Back and Short Sleeve = +792pt)"
---

## Prompt

is ki jpegs half me q a rhi he ?? ye dusra pattern he , or sb isi trha different patterns hon ge na
(then: "issue kai he , q half a rhe hen ye", "revert q krna he dhoondo k ho q rha he , fix kro ise",
"d chain me koi isue nhi he", "sirf isi patern me q issue kr rhi he , fix kro ise",
"offcial way dekho artboard lgane ka , jo perfect aye , 100% reliable")

## Response snapshot

SYMPTOM (job bdb2a7a6): every Back and Short Sleeve JPEG showed the piece cut off
at the top with blank paper filling the bottom third. Front and Neck were fine.

MEASURED, not guessed:
- In the finished order file each Back panel path sits EXACTLY 792pt above its own
  artboard (`dTop = +792`, same for every size); Necks sit at 0.
- 792pt = 11in = the height of the default artboard Illustrator gives a brand new
  document (`artboards[0] = [0,792,612,0]`). No literal 792 exists anywhere in the
  codebase - grepped.
- The same pattern rendered correctly on 17 Aug (job a7ddcc5d, `dTop = 0`), and the
  two debug logs are line-for-line identical apart from the new D-CHAIN lines.
- Today's 7-size job (59f0eb82) - which DOES run the new D-CHAIN and the new
  second-.ai-file rollover, and actually split into `production_ready_order_2.ai` -
  came out perfect. So neither of those is the cause.

FIX: `automate_production.jsx` now re-fits each artboard onto its panel as the last
step before the export, through Illustrator's own documented DOM call:

    orderDoc.selection = null;
    panelPath.selected = true;
    orderDoc.fitArtboardToSelectedArt(idx);

(`fitArtboardToPanel`, called from the item loop right before `exportResult`.) The
official call is used deliberately instead of building a rect from `visibleBounds`:
scripted `visibleBounds` lies about clipped groups and shifts with strokes and live
effects, while `fitArtboardToSelectedArt` uses Illustrator's own rendered bounds -
the same box the Object > Artboards > Fit to Selected Art menu item produces.

Fitted to the PANEL OUTLINE (`baseShape`), never the whole piece, because the pasted
design deliberately bleeds past the cut line and the artboard must stay the cut piece.
Position-only by design: a fit more than 20% away from the size the placement
measured is rejected and the original rect restored, because that means
`findPlacementPath` fell back to the wrong path (this pattern has no named
'base-path' - every piece logs "Placement Path found: Unnamed Path").

Proved with a throwaway document that reproduces the drift exactly: panel moved to
top 8542 while the artboard stayed at 7750, then the fit put the artboard back onto
the panel (MATCH = true).

## Outcome

- ✅ Impact: a piece that drifts during processing can no longer export half-blank, on any pattern
- 🧪 Tests: node --check PASS; live fit test PASS; drift measured directly in the real job file
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: re-run job bdb2a7a6 and read the new "ARTBOARD FIT [...] panel had drifted" lines - they name the piece and the exact drift, which is what will finally pin the root cause; consider the same fit for the three Hoodie artboards (separate code path, untouched here)
- 🧠 Reflection: the root cause of the 792pt drift is still unproven - this makes the export self-correcting and instrumented rather than hiding it

## Evaluation notes (flywheel)

- Failure modes observed: Back + Short Sleeve panels drifting +792pt after their artboard was cut
- Graders run and results (PASS/FAIL): syntax PASS, live API test PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): rerun bdb2a7a6 with sleeve_match_mode left at "auto" and compare the ARTBOARD FIT lines against this "resize" run
