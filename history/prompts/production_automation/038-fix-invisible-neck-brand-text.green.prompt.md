---
id: 038
title: Fix invisible neck brand text
stage: green
date: 2026-07-14
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["neck", "text-rendering", "illustrator-bug", "rebuild-text", "big-kid"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - 8 Illustrator COM experiments on job c462e225 order file (scratchpad test_bigkid_*.py)
 - rebuild approach verified end-to-end: neck export shows BIG KID clothing white + MD + care text intact
 - node --check syntax PASS
---

## Prompt

neck pr text jitna bho ho use white kr skte hen ?? jo swatches me white ho, ?? dark background ho to white text kr do , or light background ho to black text.

thk he wo white black , lekin neck me nhi a rha he Jo big kid solution jo likha he

test print me jo remove likha he , wo to remove ho jna chahiye eh na , qk pattern se a rha he nec pr txt alg se , wo to aye ga na , us k color ka akahatha

kia ho rha he ??

kia mistake a rhi he ??

## Response snapshot

Investigation chain (job c462e225, Illustrator COM via Backend/.venv win32com):
1. Mockup's Neck design lives in a group named 'Remove' - user confirmed deleting it is intended; the neck brand text must come from pattern.ai's Medium Neck panel.
2. Pattern panel DOES contain the BIG KID/clothing text (BrassStencilJNL 21.7pt + BradleyTextingPro 16pt + tiny aAttackGraffiti/BuffaloNickel lockups) and it renders fine in pattern.ai (black text).
3. In the order doc the same frames exist - white CMYK(0,0,0,0) from smartContrast, opacity 100, not hidden, inside the artboard - yet never render. Forced to layer front: still invisible. Overprint off: invisible. Magenta at original size: invisible. Size 60: renders (ghosted). 0.1% size nudge: invisible. Fresh frame with identical font/size/color: RENDERS. Duplicate of the cursed frame: INVISIBLE. Conclusion: corrupt object-level appearance travels with the frame (opacity-mask-like), unfixable via attributes; releaseOpacityMask menu command not available in CC2015 (PARM).
4. Fix (verified by test8 export - BIG KID clothing + MD + care all correct): REBUILD each pattern-side text frame - new frame in same parent, copy contents/font/size/h+vScale/tracking/leading/justification/fill, PLACEBEFORE old, same position, delete old.

Implemented in automate_production.jsx: new rebuildTextFrames(container) (skips design_clip_group so mockup design text is untouched), called for neck instances after smartContrast and before bringPatternLabelsToFront.

## Outcome

- ✅ Impact: neck brand text (BIG KID clothing) will now print white-on-dark/black-on-light on every order; care/MD unaffected.
- 🧪 Tests: COM-verified on the real order file; node --check PASS; full-order regeneration pending.
- 📁 Files: Backend/scripts/automate_production.jsx (2 edits: call site + new function).
- 🔁 Next prompts: regenerate an order and confirm "Rebuilt N pattern text frame(s)" in debug log + BIG KID visible on neck render.
- 🧠 Reflection: when Illustrator objects refuse to render despite perfect attributes, rebuild them - attribute surgery cannot strip corrupt appearance baggage that survives duplicate().

## Evaluation notes (flywheel)

- Failure modes observed: text invisible only at original composition; ghost-render when glyphs outgrow the corrupt appearance region; ExtendScript reserved word 'short' broke one diagnostic.
- Graders run and results (PASS/FAIL): test8 rebuild export PASS; node --check PASS.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): if other parts ever show the same symptom, widen rebuildTextFrames beyond neck.
