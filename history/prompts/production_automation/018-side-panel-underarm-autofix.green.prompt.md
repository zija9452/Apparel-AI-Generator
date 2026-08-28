---
id: 018
title: Side panel underarm auto-anchor fix
stage: green
date_iso: 2026-07-16
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija-yaseen
command: implement
labels: [underarm, side-panel, auto-detect, corner-detection, alignAndScale, front-back, illustrator]
links: null
files_yaml:
 - Backend/scripts/automate_production.jsx (modified - new findUnderarmY/_uaWalkUp/_uaAnchors/adjustSidePanelsToUnderarm helpers + front/back call site before removeBasePaths + skip log in no-base-path branch)
tests_yaml:
 - report-only COM test on real files (scratchpad/test_ua_fix.py) - UA detected on all 8 pattern sizes front+back, both methods agree, L/R symmetric
 - mockup auto-detect test - exactly the 2 red side panels (Spot 186, left+right) selected on front AND back, no false positives (logo/name/placket excluded)
 - node --check syntax pass on the edited jsx
 - full pipeline run pending (user to run next order and check SIDE-PANEL FIX log lines)
prompt_text: "1.auto detect , 2.front/back, 3.hn jesa front wese logic ye wali back pr bhi"
response_text: "Implemented the dynamic side-panel underarm fix per user's choices (auto-detect, front/back only). New helpers in automate_production.jsx: _uaAnchors (anchor extraction, compound-safe), _uaWalkUp (traces outline up from each hem corner until the sharp inward turn where side seam meets armhole - works on straight/tapered/flared panels), findUnderarmY (runs both sides, validates L/R symmetry <=2.5% H, plausible height band 35-90%, cross-checks against widest-point method, logs CONFIRMED/differs; returns null -> caller skips with manual-check warning), adjustSidePanelsToUnderarm (delta = scaled design base-path UA y - panel placement path UA y; skips if <1mm or >15% panel height; auto-detects side-seam artwork = paths hugging silhouette left/right edge within 4% W whose vertical span crosses the UA +-6% H, height 10-85% of H, width <=45% W; shifts them vertically by delta; bottom overflow clipped later by design_clip_group). Called for front/back after alignAndScale+normalizePersonalizedText and BEFORE removeBasePaths (needs the scaled base-path). Initial criterion 'top at UA' failed on real mockup - red panels start 4.5in ABOVE the UA along the armhole curve; fixed to span-crossing test. Report-only test then selected exactly the 2 red Spot-186 side panels on front and back with zero false positives. Expected shifts: S 0.11in ... 3XL 1.74in ... 5XL 2.34in, computed at runtime per size/pattern."
outcome: implemented
evaluation: core-logic-verified-on-real-files-pending-full-order-run
---
