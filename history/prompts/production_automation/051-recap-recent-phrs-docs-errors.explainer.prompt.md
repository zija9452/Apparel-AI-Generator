---
id: 051
title: Recap Recent PHRs Docs Errors
stage: explainer
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["phr-recap", "documentation", "llm-dedup-violation", "resolution-plan"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/production_automation/044-standard-excel-template-and-guide.green.prompt.md (reviewed)
 - history/prompts/production_automation/045-order-guide-page-nextjs.green.prompt.md (reviewed)
 - history/prompts/production_automation/049-debug-single-sleeve-name-order.explainer.prompt.md (reviewed)
 - history/prompts/production_automation/050-analyze-job-6-fronts-sleeves.explainer.prompt.md (reviewed)
tests:
 - none (recap only)
---

## Prompt

phr check kro recent last k ,. us me hm ne ek documentation bnai thi , or jo last error aya tha , wo kia tha , or resolve krne ka kia method he ???

## Response snapshot

Recapped the last PHRs:

- Documentation (PHR 044 + 045): Standard_Order_Template.xlsx (Orders/Colors/READ ME
  sheets) + Next.js /order-guide page in easy English with template download button;
  home "Documentation" nav now links to it. Verified with tsc + next build.
- Last error (PHR 050, job 166f1287): LLM agent set quantity=6 for the identical
  unpersonalized front and neck (should be 1 per size group per its own de-dup rule) ->
  6 duplicate fronts + 6 duplicate necks rendered. Sleeves were actually fine (rendered
  last); Twill Tape/Tukdi skipped because pattern.ai lacked those panels; uploaded Excel
  is never saved to disk so it couldn't be audited.
- Resolution method: deterministic quantity enforcement in Python — short-term: a
  post-processor after the LLM plan that forces quantity=1 on parts with empty
  text_replacements repeating identically within a size group; long-term: Phase 4
  deterministic plan builder that computes quantities from the parsed personalization
  dict so the LLM never decides them. Plus 2-line fix to persist the uploaded Excel in
  the job dir. Also noted PHR 049's earlier error (single sleeve from "Right Short
  Sleeve" word order) resolved by naming groups in supported order or adding reversed
  aliases to jsx pair list.

## Outcome

- ✅ Impact: User has a clear picture of the recent doc deliverables, the latest failure, and the fix options (not yet applied).
- 🧪 Tests: none (read-only)
- 📁 Files: none modified
- 🔁 Next prompts: apply the quantity post-processor + Excel persistence if approved
- 🧠 Reflection: PHR trail made this recap instant — exactly the audit value they're designed for.

## Evaluation notes (flywheel)

- Failure modes observed: none new
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): implement the quantity=1 post-processor
