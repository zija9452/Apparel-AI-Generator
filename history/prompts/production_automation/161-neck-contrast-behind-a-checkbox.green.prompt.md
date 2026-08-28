---
id: 161
title: Neck contrast behind a checkbox
stage: green
date: 2026-08-22
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat)
labels: ["neck", "smart-contrast", "feature-flag", "checkbox", "extendscript", "frontend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
 - Backend/main.py
 - Frontend/my-app/components/UploadForm.tsx
 - Frontend/my-app/app/docs/page.tsx
tests:
 - node --check on a .js copy of automate_production.jsx - PASS
 - ast.parse on main.py - PASS
 - npx tsc --noEmit in Frontend/my-app - PASS (no output)
---

## Prompt

neck ki logic analyzed kro contrast wali , or checkbox rkho , agr checkbox on ho neck contrast ka , to wo run kro , otherwise nornmal jane do, code structure theme same rhe , warning jis trha dety hen sab same rhe

## Response snapshot

### What the neck contrast logic actually was

One unconditional call in the per-item loop:

```
if (isNeck && baseShape) smartContrast(pastedPattern, baseShape.fillColor);
```

- `isNeck` is an EXACT match on `neck`, `collar` or `rib` (`:980`) - `Rib & Cuff`
  does not match it (that one is `indexOf`, a separate variable).
- `smartContrast` (`:8409`) unwraps GradientColor to its first stop and SpotColor
  to its ink, scores brightness (CMYK `1 - (C*0.3 + M*0.59 + Y*0.11 + K)`, RGB
  `0.299R + 0.587G + 0.114B`), and at `< 0.5` writes CMYK 0/0/0/0 (white),
  otherwise K=100 (black).
- It recurses the WHOLE pasted piece and rewrites every `textFrame`'s fill, plus
  the fill AND stroke of any `pathItem` whose name contains label / size / logo.

Three things worth knowing, all pre-existing:

1. **It walks into the design.** The optional `skipDesignGroup` argument exists
   precisely to keep the recursion out of `design_clip_group`, and the Neck call
   does not pass it (the hood call at `:9964` does). So the designer's own neck
   artwork is flattened to one flat ink too, not just the brand text.
2. **Gray scores as black.** The brightness math handles CMYK and RGB only. A
   `GrayColor` - which is also what an UNFILLED path reports - falls through both
   branches with `b = 0`, i.e. "dark panel", i.e. WHITE text. The hood call works
   around this by resolving the ink first (`resolveInkForOrderDoc`, `:9963`); the
   neck call was left untouched on purpose and still has the hole.
3. **It never reports anything.** The whole body is wrapped in `catch (e) {}`.

### The change

Gated, nothing else touched - same shape as `LOCAL_TAG_ON` / `HOODIE_ON`:

| layer | added |
| --- | --- |
| `automate_production.jsx` | `var NECK_CONTRAST_ON = (plan.neck_contrast === true);` beside the other flags, and the call wrapped in it |
| `main.py` | `neck_contrast: bool = Form(False)` + `plan_dict["neck_contrast"] = bool(neck_contrast)` |
| `UploadForm.tsx` | a `<Toggle name="neck_contrast">` in section 04, next to LOCAL TAG |
| `docs/page.tsx` | one entry in the OPTIONS list |

Default OFF, so the neck now takes the same "normal" path as every other part
unless the box is ticked. The skip writes one line into `debug_log.txt` in the
existing style (`log("NECK CONTRAST skipped (checkbox off): ...")`, same as
`log("SIDE-ANCHOR skipped: ...")` at `:1143`); no warning channel was added or
changed, and `smartContrast` itself is byte-identical.

No pre-flight check in `illustrator_automation.py`: unlike LOCAL TAG / side-seam
match, this needs no named object, so there is nothing to validate before the run.

## Outcome

- ✅ Impact: neck/collar/rib pieces stop being recolored on every job; ticking the box restores the old behaviour exactly
- 🧪 Tests: node --check PASS, ast.parse PASS, tsc --noEmit PASS. NOT yet run as a full Illustrator job
- 📁 Files: automate_production.jsx (flag + gate), main.py (form field + plan key), UploadForm.tsx (Toggle), docs/page.tsx (OPTIONS entry)
- 🔁 Next prompts: decide whether the ON path should also get the hood's two fixes - `resolveInkForOrderDoc` for the gray/unfilled case, and `skipDesignGroup=true` so the designer's neck artwork survives
- 🧠 Reflection: the hood call already carried both fixes with a comment saying the neck was left alone deliberately - putting the neck behind a checkbox makes that divergence a choice the user can see rather than a silent one

## Evaluation notes (flywheel)

- Failure modes observed: none in this change; two latent ones documented above (GrayColor scores 0, and the design group is recolored with the text)
- Graders run and results (PASS/FAIL): syntax/type checks only - PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run one neck job with the box OFF and confirm the log line appears once per neck piece and the exported strip keeps the mockup colors
