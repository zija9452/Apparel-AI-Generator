---
id: 016
title: Red side panel underarm drop calculation
stage: explainer
date_iso: 2026-07-16
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija-yaseen
command: explore/explain
labels: [underarm, armhole, side-panel, alignAndScale, dynamic-anchoring, pathPoints, illustrator]
links: null
files_yaml:
 - Backend/scripts/automate_production.jsx (inspected; alignAndScale + clip flow)
 - Backend/uploads/525f626a-3952-4275-a9bc-e25b96c2ebc4/pattern.ai (measured read-only via COM)
 - E:/Testing order/File/Antelop/Black Polo File.ai (mockup base-path measured via COM)
tests_yaml:
 - none (geometry measurement session; anchors extracted from placement paths per size)
prompt_text: "ab issue sirf ye a rha he , jb hm height align krte hen to ye red panels uper chle jaty hen qk height to uper se brhti he , to small me jahn ye red side dikhta he 3xl me ye uper chla jata he red m, to ise kitne niche krna he , or kese ?? dynamically , k wo kud assume kr le armole wale ye issue , or wo bhi 100 percent perfect ? ye kese hoga ?"
response_text: "Measured true underarm (armhole bottom) per size from pattern placement-path anchors (highest anchor within 2% of extreme left/right x): UA depth from top grows S 9.51in -> 5XL 13.32in while hem->UA stays ~21-22.3in (confirms user's observation that growth is above the shoulder/armhole). Mockup front base-path UA depth = 9.51in (design height 31.44). Computed how far the red side panels land too high after the current non-uniform stretch (shift-down needed): S 0.11, M 0.30, L 0.58, XL 1.19, 2XL 1.47, 3XL 1.74, 4XL 1.97, 5XL 2.34 inches. Proposed 100%-geometric dynamic fix: (1) before removeBasePaths, read design base-path UA anchor after alignAndScale, (2) read panel placement-path UA anchor, (3) delta = designUA_y - panelUA_y, (4) shift side-panel artwork down by delta; bottom overflow is clipped by existing design_clip_group; side seams are vertical so sides stay flush. Identification of side panels pending user decision: naming convention vs auto-detect (paths whose top edge sits at design UA and hug left/right edges). Asked edge-case questions: sleeves (their base-path UA is asymmetric 6.99/2.13 - needs own rule), back panel, naming."
outcome: analysis-delivered
evaluation: awaiting-user-answers-before-implementation
---
