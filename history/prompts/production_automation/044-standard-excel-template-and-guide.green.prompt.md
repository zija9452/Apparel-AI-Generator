---
id: 044
title: Standard Excel Template And Guide
stage: green
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["excel-template", "standard-format", "checkbox-form-demo", "visual-guide", "artifact"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Standard_Order_Template.xlsx (created - Orders/Colors/READ ME sheets)
 - scratchpad/make_template.py (created - template generator)
 - scratchpad/verify_template.py (created - parser verification)
 - scratchpad/excel-template-guide.html (created - published as artifact)
tests:
 - Ran Standard_Order_Template.xlsx through Backend/services/excel_service.parse_order_excel via Backend/.venv - all 5 rows parsed, front/back name+number mapped correctly, leading zero "07" preserved, Colors sheet parsed (BODY/STRIPE/TEXT CMYK)
---

## Prompt

mjhe  dikhao bhi to , aese nhi a rha he samjh , ya ek excel standard file bna do , lekin dhyan rhe k wo zyada complex na ho . mtlb k easily bn jaye , or jo rkhna ho sirf whi field rkhen baki delte kr den hm agy , or checkbox kia ??

## Response snapshot

Created two deliverables:

1. Standard_Order_Template.xlsx at project root — 3 sheets:
   - Orders: title row + headers (Size, Sleeve, Front Name, Front Number, Back Name,
     Back Number, Sleeve Number, Neck Name) + 5 sample rows; number columns pre-formatted
     as Text so "07" keeps its zero; styled header, frozen panes.
   - Colors: optional vertical CMYK sheet matching the parser's expected format.
   - READ ME: Roman-Urdu usage rules (delete unused columns, Size mandatory, etc.).
   Verified with the project's own parse_order_excel: all fields route correctly today
   (Sleeve Number / Neck Name columns are ignored until Phase 1 — noted honestly).

2. Published visual guide artifact (https://claude.ai/code/artifact/6dbd1bb9-cbf4-4f99-a1ac-f5569b51e83d):
   Excel-style sheet preview, 3 simple rules, interactive scenario switcher showing which
   columns to keep/delete per order type (back-only, front-only, front+back, full), and a
   LIVE checkbox-form demo answering "checkbox kia??" — pre-checked matrix (parts x
   name/number/logo) with a working warning when a part without a mockup placeholder is
   ticked (e.g. Neck Name).

Core message to user: column name = print location; keep only used columns; the checkbox
form is a website step (not Excel) that the mockup scan pre-fills for confirmation.

## Outcome

- ✅ Impact: User has a ready-to-use, parser-verified Excel template and a visual/interactive explanation of both the format and the planned checkbox form.
- 🧪 Tests: template round-tripped through excel_service.parse_order_excel successfully (names, numbers with leading zeros, colors)
- 📁 Files: Standard_Order_Template.xlsx created in project root; guide published as artifact
- 🔁 Next prompts: confirm edge cases from PHR 043; begin Phase 1 (generic column parser) so Sleeve Number / Neck Name columns work
- 🧠 Reflection: Showing a working demo (interactive matrix + warning) communicated the checkbox concept far better than prose descriptions did.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): parser verification PASS (5/5 rows, leading zeros intact, colors parsed)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Phase 1 generic <part> <field> parser so the two future columns activate
