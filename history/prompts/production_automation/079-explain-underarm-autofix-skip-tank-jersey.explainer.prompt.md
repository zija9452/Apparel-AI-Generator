---
id: 079
title: Explain underarm autofix skip on tank jersey
stage: explainer
date: 2026-07-22
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija-yaseen
command: explain
labels: [underarm, side-panel, autofix-skip, tank-jersey, XL-order, debug-log]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/uploads/ea91f850-d89d-469d-bc0f-61f53dc640cd/renders/debug_log.txt (inspected, no changes)
 - Backend/uploads/ea91f850-d89d-469d-bc0f-61f53dc640cd/renders/production_plan.json (inspected)
 - Backend/uploads/ea91f850-d89d-469d-bc0f-61f53dc640cd/renders/XL_Front_Left_Item1.jpg, XL_Front_Right_Item1.jpg, XL_Back_Item1.jpg (inspected)
 - Backend/scripts/automate_production.jsx (referenced, no changes)
tests:
 - none (read-only investigation of an existing job's output + debug log)
---

## Prompt

explore my whole project and is me ghlti ye a rhi he k me ek test print he M ka jisse mjhe order bnan he XL ka , to btao measurments design to kharab nhi hoga ?? front k 2 panel hen is me . to me kis trha bnaun ise ?? or jo ye red lines a rhi hen ye bhi match honi chahiye hen front ki back se, to ye sb kese manage krun ? or ye jo red line he xl order me to top se niche a rhi hen q ?? resize krne ki wja se ? isse to ye red top pr nazar a rhahe jo k ni ana chahiye he ,. to hm ise bara nhi kr skte is shape ko , """D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\ea91f850-d89d-469d-bc0f-61f53dc640cd"""

## Response snapshot

Checked debug_log.txt for job ea91f850 (Trojans Tehachapi sleeveless/racerback jersey, XL). Confirmed via SIDE-PANEL FIX log lines that the existing auto-anchor fix (built in [[016]]/[[018]]) ran but SKIPPED for every panel in this job:
- front-left / front-right (both copies): "UA-DETECT [panel]: WARNING - left/right underarm heights differ (308pt). Skipping shift - check this panel manually." (tolerance is 2.5% of panel height; 308pt is far outside it)
- back (both copies): "UA-DETECT [panel]: WARNING - underarm at unexpected height (95% up the panel). Skipping shift - check this panel manually." (plausible band is 35-90% up)

Root cause: this design's silhouette is a sleeveless/racerback tank cut (deep scooped armhole+neck, visible in the render JPGs), very different from the polo/t-shirt shape the corner-walk heuristic (_uaWalkUp/findUnderarmY) was validated against. The algorithm can't confidently find a symmetric "corner where side seam meets armhole" on this shape, so it safely bails out rather than risk a wrong shift - exactly the designed fallback behavior, not a random bug.

Practical implication for the user: the known "red line lands too high on bigger sizes because grading adds height mostly above the armhole while scaling is uniform" problem is real here AND uncorrected, because the auto-fix declined to touch it. Told the user: (1) don't just enlarge/rescale the shape further - that's the same uniform-scale mechanism that causes the drift; (2) two real fixes are manual nudge of the red-line group down to the true armhole per panel (front-left, front-right, back) before print, checking that all three line up at the shoulder/side seams, or (3) relax/adjust the detection heuristic for this racerback silhouette so autofix can run confidently. Offered to do a report-only underarm measurement pass (like [[016]]) on this specific pattern file if the user wants exact per-panel shift numbers instead of eyeballing it.

## Outcome

- ✅ Impact: User now understands the red-line-too-high symptom is the known underarm-drop issue, that it was explicitly skipped (not silently mis-shifted) for this job, and why (racerback shape breaks the L/R symmetry + height-band checks). No code changed yet.
- 🧪 Tests: none - read-only log/image inspection only.
- 📁 Files: none modified.
- 🔁 Next prompts: if user wants, run a report-only underarm measurement on this job's pattern.ai (like [[016]]) to give exact per-panel mm/pt shift values; or relax findUnderarmY's symmetry/height-band tolerances for racerback-style silhouettes.
- 🧠 Reflection: existing PHR history ([[016]], [[017]], [[018]]) already covers this exact failure mode's design and implementation, which made diagnosis fast from the debug log alone - confirms the log's WARNING messages are sufficient signal without needing to reopen Illustrator.

## Evaluation notes (flywheel)

- Failure modes observed: underarm auto-detect heuristic (tuned on polo/t-shirt silhouette) has no coverage for racerback/tank silhouettes; correctly refuses to guess rather than mis-shift, but leaves the user with a manual-fix order and no automatic remediation path yet.
- Graders run and results (PASS/FAIL): N/A (explainer only).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): widen/soften findUnderarmY's plausible height band and L/R symmetry tolerance specifically when the panel outline shows a racerback-style deep armhole (or add a second detection strategy) so front/back panels like this job's autofix instead of skip.
