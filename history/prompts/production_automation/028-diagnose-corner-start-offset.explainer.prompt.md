---
id: 028
title: Diagnose corner start offset
stage: explainer
date: 2026-07-17
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeve-matching","seam-line","corner-intersection","diagnosis","measurement-convention"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none modified (read-only: Backend/uploads/2464c948-2237-4164-97c8-8065bf6bef77/renders/debug_log.txt)
tests:
 - none (diagnosis only)
---

## Prompt

mene abhi x-large ka isi trha -7mm ka mrgin de kr design napa , to jersey ka a rha h 81.72 or jb k sleeve ka design jo k sleeve k andar nazar a rha he wo he km isse , to me kia real world approach use krun k  ye best aye , blkl perfect , kia ye possible he bhi ya nhiii ?? sach btao

## Response snapshot

Read latest job log (2464c948). Script measured XL body D = 89.1mm and matched both XL sleeves at 89.1mm; user manually measured 81.72mm. Gap = 7.38mm ~ 7mm = the START-POINT definition difference predicted in PHR 026's "next experiment":

- User starts D at the INSET-CORNER INTERSECTION (where the two -7mm inset lines cross).
- Script starts the walk at the seam-line sample NEAREST the original cut-edge corner (~7mm earlier along the seam), inflating D by ~7mm on the body and a different amount on the sleeve cap (different corner angle) - so script-matched sleeves still look short by the user's ruler.

Honest verdict: perfect matching IS possible by the user's own convention - fix is to intersect the two inset seam lines and start the arc walk there, on both body and sleeve. Two limits stated honestly: (1) below +/-1mm is meaningless (sewing tolerance +/-2-3mm, fabric stretch, cap ease); (2) this job had 7 warnings - several left sleeves (Medium/Large/2XL/3XL/4XL) could not reach target (shift too large, guard limit) and rendered unmatched; that is a separate issue from the corner fix. Offered to implement the inset-corner-intersection fix; awaiting go-ahead.

## Outcome

- ✅ Impact: root cause of the 81.72 vs 89.1 discrepancy identified from the live log without code changes; user has an honest answer (possible, with the corner fix, to +/-1mm).
- 🧪 Tests: none - diagnosis from debug_log.txt SLEEVE-MATCH lines.
- 📁 Files: none.
- 🔁 Next prompts: implement inset-corner intersection start point (body + sleeve); investigate why left sleeves fail to converge (large required shifts vs 30%-height guard).
- 🧠 Reflection: the ~7mm delta matching SM_SEAM_PT exactly was the tell; PHR 026 had already predicted this residual.

## Evaluation notes (flywheel)

- Failure modes observed: nearest-sample corner start vs inset-corner intersection (~7mm bias); left-sleeve non-convergence (7 warnings).
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): intersect the two inset seam lines at each corner and start the walk there.
