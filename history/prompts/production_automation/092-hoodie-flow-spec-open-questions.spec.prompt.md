---
id: 092
title: Hoodie flow spec - open questions
stage: spec
date: 2026-08-11
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija9452
command: N/A
labels: ["hoodie", "new-garment-type", "pocket", "size-tag", "spec-clarification"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none yet (spec discussion only)
tests:
 - none yet (spec discussion only)
---

## Prompt

jese full button jersey he , wese hi ek or field ani he , Hoodie ki jis me wese ek check box rkhna he , agr user ye on kre to wese hi nomal jersey ka flow hoga , jese front back and sleeve bnte hen , or is me Inside hood and outside hood and border bhi add hon ge , or in teeno ki stroke remove krni hen , jese patti me hoti he , border hr front and back ka bne ga individually , jb k pattern me sirf size k Left and right hood hen , so , left and right hood mila kr ek hood bne ga , outside ka , tehn again left and right mila kr bne ga inside ka , clear ?? and is me ek pocket bhi hogi pattern m eto pattern se pocket uthana he or front k horizontally center and vertically bottom me rkhna he , phr whi base color jo front ka he , or jo design front ka he use hi copy and clipped krwa dena he pocket me , and pocket ko again 5mm k gap pr rkh dena he , is me agr size tag hon( sb se pehle size tags ka name local tags kro) so local tags agr is me hon to 1.5 inch bottom se and right se 1 inch ka gap dena he . (agr pocket front pr rkhne se ye local tags or pocktet overlap kren to pocket k andar -1 inch ka inset lena he , then again dekhna he k abhi bhi overlap ho rhe hen ye dono ? agr ho rhe hon to local tags ko 0.5 inch bottom kr dena , then again dekhna , agr phr bhi ho rha ho to jitna overlap kr rha ho to utna right kr dena , tight grip 0.5 inch he , isse zyada na krna, ab issues discuss kr lo , hallucinate na krna ,

## Response snapshot

Before writing any code, grepped the live codebase to ground the spec discussion instead of assuming: confirmed `full_button_jersey` checkbox wiring (UploadForm.tsx -> main.py Form field -> plan_dict -> automate_production.jsx), confirmed "Patti" = full-button placket strip with `isPatti`/`clearAllStrokes()` stroke-removal treatment, confirmed `SIZE_TAG_ON` is an existing independent checkbox-gated feature (`processSizeTagLabel`, `renameSizeTags`) with its own positioning logic separate from what's being proposed here, confirmed there is currently zero code reference to "hood", "hoodie", or "pocket" anywhere in the stack (fully new feature, no prior art to copy), and confirmed the project's existing gap convention is 5mm between artboards/pieces (matches the pocket's "5mm gap" ask).

Given the volume of genuine ambiguity in the spec and the user's explicit instruction to discuss issues rather than hallucinate, raised open questions grounded in that code review rather than proceeding to a plan: (1) Full Button Jersey vs Hoodie checkbox interaction/mutual exclusivity, (2) exact pattern part-naming convention needed for "Left Hood"/"Right Hood"/"Pocket"/"Border" so name-matching logic isn't guessed, (3) whether Inside Hood is a true duplicate-use of the same Left+Right merge or needs different treatment (e.g. blank/no design since it's a lining), (4) whether Border is a pre-existing per-front/back pattern piece or generated geometry, (5) whether the pocket's copied design must be registration-aligned to the front (so it reads as a continuation/window) or just visually matched (same colors/design content, independently centered), (6) the exact reference edge/anchor for "vertical bottom" and the final "5mm gap" pocket placement, (7) whether "rename size tags to local tags" is a global terminology change across the whole app or scoped only to this Hoodie feature's new tag-vs-pocket collision logic, (8) precise directional semantics of each step in the tag/pocket overlap-resolution recipe (does "-1 inch inset" shrink the pocket shape or the design window inside it; does "0.5 inch bottom" increase or decrease the existing 1.5in offset; is a residual overlap after all three fallback steps acceptable or should the job pause with a warning like the existing armhole-match/pattern-match pre-flight checks).

## Outcome

- ✅ Impact: No code changed yet - this PHR records the spec-clarification checkpoint before any Hoodie implementation begins.
- 🧪 Tests: N/A (spec/discussion stage, no code touched).
- 📁 Files: None modified. Reviewed Backend/scripts/automate_production.jsx, Backend/main.py, Backend/services/illustrator_automation.py, Frontend/my-app/components/UploadForm.tsx, Frontend/my-app/components/ProductionPlan.tsx read-only.
- 🔁 Next prompts: Awaiting user's answers to the open questions before drafting a plan (`/sp.plan`) for the Hoodie feature.
- 🧠 Reflection: This codebase's pattern-matching logic is entirely name-string-driven (isAccessory, isPatti, findByNormalizedName) - a brand-new garment type absolutely requires the exact pattern-file naming convention up front, otherwise the JSX will silently fail to find "Left Hood"/"Pocket" the same way missing "MATCH_"/"SIZE TAG" groups already trigger pre-flight pauses elsewhere in this file.

## Evaluation notes (flywheel)

- Failure modes observed: N/A (no implementation attempted yet).
- Graders run and results (PASS/FAIL): N/A.
- Prompt variant (if applicable): N/A.
- Next experiment (smallest change to try): Once naming convention and overlap-recipe semantics are confirmed, start with the frontend checkbox + main.py Form field plumbing (mirrors full_button_jersey exactly) before touching any JSX geometry logic.
