---
id: 027
title: Anchor personalized text gap
stage: green
date: 2026-07-08
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "personalization", "text", "alignment", "gap"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx
tests:
  - node --check on JSX copy (syntax OK)
  - Real personalized job run PENDING (acceptance: name/number gap matches mockup)
---

## Prompt

Ok , perfect personalized numbers ka scenario ye he k jb numbers zyada baray ho ajty hen to proportionally fix hota he size , ro wo abhi lkl fix size pr a rhe hen , lekin aese hota he k us number k uper koi text hota he us k fix margin pr hi number hota he to number porpotiionally fix krne se wo or niche chla jata he jisse uper zyada gap a jata he , lekin issue ye bhi he k hmy nhi pta k text kbhi niche hota he , or kbhi uper us number k , to text ko niche ki alignment note krni he ya uper ki , qk agr number k uper text ho to jitna gap he name and number me utna hi rhe , aese hi agr niche text ho to jitna niche wale name or number me gap he utna hi ho. Lekin hmy kese pta chle ga k niche he text ya uper ??? and how I fix this ??

## Edge-case decisions (user-confirmed via AskUserQuestion)

1. Text upar AUR neeche dono hon -> jo vertically zyada qareeb ho us ka gap preserve.
2. Neighbor sirf LIVE text frames (horizontal overlap zaroori) - logos/outlined paths nahi.
3. Same anchoring NAME par bhi (sirf number nahi).

## Response

Detection: replacement ke waqt design ke saare doosre text frames scan hote
hain; jo horizontally overlap kare aur vertically sab se qareeb ho - us ka
bottom number ke top se upar hai to "above", warna "below".

Implemented in automate_production.jsx:
- New helper findVerticalNeighborSide(root, tf, bounds) -> "above"/"below"/null.
- replaceInContainer now threads a `root` param (whole design) so the
  neighbor scan is not limited to the current subgroup; anchorSide computed
  from PRE-replacement bounds.
- Fit-to-mockup shrink: horizontal stays centered; vertical anchors the TOP
  edge when text is above (gap upar preserved), BOTTOM edge when below,
  CENTER when no neighbor (old behavior).
- tf.note now carries the anchor: PERS_TEXT_ABOVE / PERS_TEXT_BELOW / PERS_TEXT.
- normalizePersonalizedText applies the SAME edge anchoring after its height
  normalization (warna woh step gap dobara kharab kar deta).
- Name-above-number pairs anchor toward each other, locking the shared gap
  from both sides.

Verification: node --check OK. Acceptance on next personalized job: 3-digit
number (e.g. 666) with name above -> gap to name same as mockup, shrink goes
downward only.
