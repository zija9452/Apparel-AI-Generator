---
id: 026
title: Seam line inset and back white fix
stage: green
date: 2026-07-17
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeve-matching","seam-allowance","inset","bugfix","unfilled-paths","white-panel-bug"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (SM_SEAM_PT constant; _smInsetOutline winding-based -7mm inward offset; both measure sites now walk the seam line; applySpot unfilled/unstroked guard)
tests:
 - node --check JSX - PASS
 - sm_geom_test.js extended to 11 tests (inset geometry x=7/93, seam D=40, edge-only art invisible on seam, slanted seam D~54) - 11/11 PASS
 - Read-only Illustrator COM probe of job f7427682 mockup: BACK group has UNFILLED paths stacked ABOVE the red SPOT:186 side panels; FRONT has none - confirmed root cause
---

## Prompt

ok , jo logic lgayi thi matching ki , check kese krte ho tm ?? is trha k jersey pr -7mm ka mrgin lgaya , phr jahn tk design he wo lia jese Large pr 72.13 a rha he , then is ki sleeve pr bhi -7mm ka margin lgaya phr side se jahn tk design j rha he us ka mm a rha he 76.6mm to ye to 1 se zyada cross kr gya he, """...renders\XL_Back_Item1.jpg""" ye back he , back hm ne same hi di thi jese mopckup me thi wese hiii , to ?? ye order me kharab q a rhi he side outline a rhi he bs

(mid-turn) acha jo -7mm ka margin he wo dono sides se lety hen mtlb jersey k 4 corners se , jisse design me bhi -7mm ka gap aye or sleeve me bhi , tm ne -7mm ki logic ni rkhi he na , ,
(mid-turn) -77m ka margin kese dia he explain kro , or kese count hoga d??

## Response snapshot

Two real defects found from the first live job (f7427682) and fixed:

1. MEASUREMENT DEFINITION: v1 measured D along the panel's CUT EDGE; the customer measures along the -7mm SEAM LINE (stitch line, offset inward from all edges - their Ctrl+` workflow). Because the design crosses the armhole and the cap at different angles, an edge-match does not stay a seam-line match (their manual check: body 72.13mm vs sleeve 76.6mm while the script's edge numbers matched at 84.5mm). Fix: _smInsetOutline() offsets every sampled outline point 7mm inward along its local normal, with the interior side derived once from the polygon winding (signed area); both body and sleeve measurements now walk this seam line. Constant SM_SEAM_PT = 7mm.

2. BACK "SIRF OUTLINE" BUG: XL/Large backs rendered white side panels with only red piping visible. Read-only COM probe of the mockup proved the Back group carries UNFILLED construction paths z-stacked ABOVE the red SPOT:186 panels (invisible in the mockup); Front has none. mergeAndCleanupSwatches/applySpot read fillColor on those unfilled paths, got Illustrator's phantom GrayColor(0), baked it to CMYK 0/0/0/0 (WHITE) and force-set filled=true - painting them white over the red. Fix: applySpot now returns early for non-text paths when filled === false (fillColor pass) or stroked === false (strokeColor pass).

Also explained to the user how the -7mm inset is computed and how D is counted (sampled bezier outline -> winding -> inward normals -> walk from corner along seam polyline -> point-in-polygon transitions -> farthest boundary arc distance).

## Outcome

- ✅ Impact: D now matches the customer's own measuring convention; invisible mockup paths can never be force-painted again (back renders correctly).
- 🧪 Tests: 11/11 geometry tests; syntax checks pass. Needs one re-run of a real job to confirm both fixes on production patterns.
- 📁 Files: automate_production.jsx only.
- 🔁 Next prompts: Re-run the same order with checkbox ON; verify (a) body D on Large reads ~72mm matching the manual 72.13, (b) sleeve matches within 1mm on the seam line, (c) back side panels render solid red.
- 🧠 Reflection: The live job surfaced exactly the two things synthetic tests could not: the human measuring convention (seam line, not edge) and a mockup-authoring pattern (invisible unfilled paths) that the color pipeline mishandled.

## Evaluation notes (flywheel)

- Failure modes observed: edge-vs-seam-line definitional mismatch; phantom GrayColor(0) on unfilled paths force-filled white.
- Graders run and results (PASS/FAIL): sm_geom_test.js 11/11 PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): If corner-start position vs the user's exact inset-corner intersection ever matters (>1mm), intersect the two inset lines at the corner instead of nearest-sample start.
