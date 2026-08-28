---
id: 133
title: Where Is Width Height Scale Still Used
stage: explainer
date: 2026-08-19
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat question)
labels: ["scaling", "alignAndScale", "design_scale_mode", "neck", "dead-code"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (inspected)
 - Backend/main.py (inspected)
 - Frontend/my-app/components/UploadForm.tsx (inspected)
tests:
 - none (read-only audit)
---

## Prompt

ab kahi use ho rha he width and heigh scale functionality ??

## Response snapshot

Audited every call site of `alignAndScale` (the two-axis independent width+height
stretch) after removing the neck carve-out.

Three call sites remain, all three sitting in the `else` branch of
`SCALE_HEIGHT_ONLY`:

- `automate_production.jsx:981` — main part branch (with base path)
- `automate_production.jsx:1023` — main part branch (no base path)
- `automate_production.jsx:8295` — hood halves / border

`SCALE_HEIGHT_ONLY` is `(plan.design_scale_mode !== "both")`
(`automate_production.jsx:344`), so the stretch only runs when the plan says
`design_scale_mode = "both"`.

The frontend never sends `"both"`. `UploadForm.tsx` renders exactly two radios:
`value="height"` (defaultChecked, line 204) and `value="height_sides"`
(line 224). So from the UI the two-axis stretch is unreachable — it is dead
code in practice.

It is still reachable through the API: `main.py:678-679` whitelists
`("height_sides", "both")` and falls back to `"height"` otherwise, so a direct
POST with `design_scale_mode=both` would still take that branch.

Also found stale UI copy: `UploadForm.tsx:242-245` still tells the user "The
Neck strip always uses the stretch fit on both settings", which stopped being
true when the neck carve-out was removed.

## Outcome

- ✅ Impact: Confirmed the width+height stretch is now only reachable via a direct API call with `design_scale_mode=both`; no UI path leads to it.
- 🧪 Tests: None — read-only audit (grep over .jsx / .py / .tsx).
- 📁 Files: No files changed.
- 🔁 Next prompts: Remove the stale neck sentence in `UploadForm.tsx:242-245`; decide whether to drop `"both"` from `main.py`'s whitelist and delete `alignAndScale`.
- 🧠 Reflection: Removing the neck exception turned an opt-in mode into fully unreachable code — worth deciding explicitly whether to keep it as an escape hatch or delete it, rather than leaving it to rot.

## Evaluation notes (flywheel)

- Failure modes observed: UI help text drifted out of sync with the code change made in the previous turn.
- Graders run and results (PASS/FAIL): N/A
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): Fix the stale `UploadForm.tsx` sentence in the same edit as any future scale-mode change, so copy and behaviour move together.
