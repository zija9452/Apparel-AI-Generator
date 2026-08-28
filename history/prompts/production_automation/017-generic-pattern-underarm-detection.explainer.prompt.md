---
id: 017
title: Generic pattern underarm detection strategy
stage: explainer
date_iso: 2026-07-16
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija-yaseen
command: explore/explain
labels: [underarm, corner-detection, pattern-agnostic, grading, robustness, validation, illustrator]
links: null
files_yaml:
 - Backend/scripts/automate_production.jsx (context; no changes yet)
tests_yaml:
 - none (design discussion; validated concept against measured polo data from PHR 016)
prompt_text: "lekin ab issue ye he k hr dafa yhi pattern nhi rhe ga , qk patterns change hoty rhen ge , round neck ka alg or kisi dusre customer ka alg pattern us me alg inches , to dynamically kese script ye samjhe giii ?"
response_text: "Explained why the proposed fix is pattern-agnostic: no inches are hardcoded - the underarm is read from each panel's placement-path anchors at runtime, the design's own underarm from its base-path, delta computed fresh per size/pattern/customer. Neck style (round vs polo) is irrelevant since detection works on the side edges. To be robust across pattern shapes, detection should be upgraded from 'widest point' to CORNER DETECTION: trace the outline upward from each hem corner and find the first sharp inward turn (side seam meeting armhole always forms a corner) - this survives flared/tapered panels where the widest point is at the hem. Reliability plan for '100% perfect': (1) run both methods (corner + widest-point) and require agreement, (2) left/right symmetry cross-check, (3) if any check fails, log a warning in the job report and skip the shift for that panel so a human reviews it (human-as-tool checkpoint), (4) optional named marker (e.g. 'ua-marker') in pattern file as designer override for unusual garments. Honest limits stated: raglan/kimono/drop-shoulder panels have no underarm corner - those need the marker or no shift. Awaiting user's answers from PHR 016 (naming vs auto-detect, sleeves, back) before implementing."
outcome: analysis-delivered
evaluation: awaiting-user-decision
---
