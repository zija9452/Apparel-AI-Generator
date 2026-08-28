---
id: 134
title: Remove Stale Neck Stretch UI Copy
stage: green
date: 2026-08-19
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat instruction)
labels: ["ui-copy", "neck", "design_scale_mode", "cleanup"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/components/UploadForm.tsx
tests:
 - none (copy-only removal, no behaviour change)
---

## Prompt

hn hta do

## Response snapshot

Removed the stale footnote under the "Design scaling" radio group in
`Frontend/my-app/components/UploadForm.tsx` (was lines 242-245):

> "The Neck strip always uses the stretch fit on both settings — it prints edge
> to edge, so a proportional fit would leave it short."

That stopped being true when the neck carve-out was removed from
`automate_production.jsx` (both call sites now route the neck through
`pmAlignAndScaleToHeight` like every other part), so the sentence was telling
users the opposite of what the code does.

Swept the rest of the app for the same claim:

- No other `.tsx` repeats it (`order-guide/page.tsx` only lists "Neck" as an
  Excel column / part name).
- `main.py:657-677` already describes the modes correctly — it says `"both"` is
  no longer offered on the form but is still honoured if posted directly, and
  makes no claim about the neck.

Left `alignAndScale` and the `"both"` whitelist entry in `main.py:679` in
place — deleting those is a separate, larger call that was not part of this
instruction.

## Outcome

- ✅ Impact: The scaling help text no longer contradicts what the neck actually does.
- 🧪 Tests: None — a JSX text node was deleted, no logic touched.
- 📁 Files: `Frontend/my-app/components/UploadForm.tsx` (4 lines removed).
- 🔁 Next prompts: Decide whether to drop `"both"` from `main.py`'s whitelist and delete `alignAndScale` entirely; verify the neck height-only scale on a 2XL Illustrator run.
- 🧠 Reflection: Behaviour changes that carry user-facing copy need the copy checked in the same pass — this one survived a full turn before being caught.

## Evaluation notes (flywheel)

- Failure modes observed: Help text drifted out of sync with a code change made one turn earlier.
- Graders run and results (PASS/FAIL): N/A
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): When editing a `design_scale_mode` branch, grep `UploadForm.tsx` for the affected part name before finishing.
