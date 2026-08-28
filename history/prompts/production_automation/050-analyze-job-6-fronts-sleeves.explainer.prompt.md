---
id: 050
title: Analyze Job 6 Fronts Sleeves
stage: explainer
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["debugging", "job-analysis", "llm-dedup-violation", "front-quantity", "sleeves", "twill-tape"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/uploads/166f1287-45eb-48b6-a31b-430e68f6b6ba/production_plan.json (inspected)
 - Backend/uploads/166f1287-45eb-48b6-a31b-430e68f6b6ba/renders/debug_log.txt (inspected)
 - Backend/main.py (inspected - excel not persisted to disk)
tests:
 - none (diagnosis only)
---

## Prompt

D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend\uploads\166f1287-45eb-48b6-a31b-430e68f6b6ba ye dekh kr btao ?? is me to medium k ek front tha to 6 quantity q ayi ??? or right and leftsleeve kahn gyi ,. is me sb analyze kr k btana , excel wagherAa sb

## Response snapshot

Full job post-mortem (finished successfully 16:14:23):

1. SLEEVES ARE PRESENT: detection + expansion worked ("Expanded 'sleeve-short' into
   Right + Left"), rendered LAST (16:13:49-51) after fronts/backs/necks.
   Medium_Short_Sleeve_Right_Item1.jpg + Left_Item1.jpg exist in renders/. The user
   checked mid-run (status.json frozen at 76% "Rendering Medium neck") before sleeves
   were exported.

2. 6 FRONTS (and 6 NECKS): Excel had 6 Medium jerseys with 6 unique BACK
   personalizations (Jordan 666, Auntie 13, Prima 29, Rocha 10, Smitty 11, Dennis 5);
   fronts identical/unpersonalized. The LLM agent set front quantity=6 and neck
   quantity=6, violating its own de-dup instruction (identical un-personalized parts =
   once per size group). Previous job 8c7763c4 with the same shape produced front=1,
   neck=1 - pure LLM nondeterminism. JSX expands each quantity unit into its own
   artboard -> 6 identical fronts + 6 identical necks, ~4 wasted render minutes.
   _enforce_personalization can't catch it: it only rebuilds personalized front/back
   items, never quantities of unpersonalized parts.

3. EXCEL NOT ON DISK: main.py reads the upload into memory only (excel_content) and
   never saves it to the job dir - the original sheet cannot be re-inspected after the
   fact; contents were inferred from the plan.

4. BONUS: Twill Tape and Tukdi both CRITICAL-skipped - this pattern.ai has no such
   panels (previous jobs' pattern did) - hence no Twill_Tape jpg in renders.

Recommended (not applied - analysis only): (a) deterministic quantity rule in Python
(unpersonalized part = quantity 1 per size group) - exactly the Phase 4 case; (b) save
the uploaded Excel into the job dir for traceability.

## Outcome

- ✅ Impact: User knows sleeves rendered fine (they looked mid-run), 6 fronts/necks is an LLM de-dup violation (not Excel), the Excel isn't persisted, and twill/tukdi were missing from this pattern file.
- 🧪 Tests: none (read-only)
- 📁 Files: none modified
- 🔁 Next prompts: apply deterministic quantity enforcement (Phase 4 or a small post-processor); persist uploaded Excel per job
- 🧠 Reflection: Second LLM-nondeterminism incident in one day (placement guessing, now quantity) - strengthens the case for the deterministic plan builder.

## Evaluation notes (flywheel)

- Failure modes observed: LLM ignored de-dup rule for unpersonalized front/neck quantities; mid-run status misread as final state; excel not persisted blocks after-the-fact audits
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): post-process plan - force quantity=1 on parts with empty text_replacements that repeat identically within a size group
