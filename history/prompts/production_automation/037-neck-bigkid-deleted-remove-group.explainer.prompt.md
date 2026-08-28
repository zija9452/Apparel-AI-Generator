---
id: 037
title: Neck BIG KID deleted by Remove group
stage: explainer
date: 2026-07-14
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["neck", "remove-items", "naming-collision", "mockup", "smart-contrast"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (inspected, not modified)
 - Backend/uploads/c462e225-b156-4cd7-b1f8-97287af0b877/mockup.ai (inspected via Illustrator COM)
tests:
 - Illustrator COM structure dump of mockup Neck group (scratchpad/inspect_neck.py)
---

## Prompt

neck pr text jitna bho ho use white kr skte hen ?? jo swatches me white ho, ?? dark background ho to white text kr do , or light background ho to black text.

thk he wo white black , lekin neck me nhi a rha he Jo big kid solution jo likha he

## Response snapshot

White/black contrast already exists: smartContrast() (automate_production.jsx ~1333) runs on neck only and flips text to white on dark panels / black on light ones (user confirmed that part is fine).

Real issue - BIG KID branding missing from the neck: dumped the mockup's Neck group via Illustrator COM (win32com, prog_id Illustrator.Application.CC.2015). The ENTIRE neck design (BIG KID logo art, "BIG KID"/"clothing" text frames, character) sits inside a group named 'Remove'. removeNamedItems(pastedDesign, "remove") - the test-print size-tag cleanup at automate_production.jsx:328 - deletes it wholesale (neck log: "Removing 'Remove' (GroupItem) from design."). What still renders on the neck (care text, character, MD) comes from pattern.ai's own Medium Neck panel, not the mockup.

Fix: designer renames the neck design group in the mockup (anything but remove*); front/back 'Remove' groups are legit test-print tags and must stay. Offered optional code guard: skip deleting a 'remove' item whose area exceeds ~50% of the design bounds and log a warning (real test tags are tiny) - awaiting user consent.

## Outcome

- ✅ Impact: root cause identified as a mockup naming collision, not an automation bug; no code changed yet.
- 🧪 Tests: COM diagnostic dump confirmed structure; neck debug log confirmed the deletion.
- 📁 Files: none modified.
- 🔁 Next prompts: rename the group in mockup and regenerate; decide on the >50%-area safety guard for removeNamedItems.
- 🧠 Reflection: name-convention-driven deletions need a size sanity check - any designer can accidentally reuse the magic name on real artwork.

## Evaluation notes (flywheel)

- Failure modes observed: magic-name cleanup ("remove") swallowed an entire part design.
- Graders run and results (PASS/FAIL): N/A
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): area-guard in removeNamedItems (skip + warn when item covers >50% of design bounds).
