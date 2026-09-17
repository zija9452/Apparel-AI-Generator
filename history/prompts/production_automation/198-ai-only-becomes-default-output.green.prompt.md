---
id: 198
title: AI Only Becomes Default Output
stage: green
date: 2026-09-17
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["frontend", "output", "export-mode", "defaults", "docs"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/components/UploadForm.tsx
 - Frontend/my-app/app/docs/page.tsx
 - Frontend/my-app/components/OptionDiagrams.tsx
tests:
 - npx tsc --noEmit (clean)
 - npx eslint app components (clean)
 - orchestrator HTML fetched - ai_only renders first and carries checked=""
 - the Preview renders diagram screenshotted and reviewed
---

## Prompt

ok , ab orchestrator page me , ai files onl;y ko uper default kro or jpeg ko second pr rkho

## Response snapshot

Swapped step 06 on the orchestrator. `AI file only` is now the first card and
the `defaultChecked` one; `AI file + JPEG previews` is second. The section's
own blurb flipped with it - it used to end "Skip it when you only need the
Illustrator file", which reads wrong once skipping is the default, and now says
the render is off by default and to turn it on when previews are wanted.

Verified from the served HTML rather than the source: the `ai_only` input is
emitted first and is the one carrying `checked=""`.

Three places that described the old default were updated to match:

- docs chapter 06 "Preview renders" - which mode is the default
- docs chapter 08, the `{Size}/{Size}{N}.jpg` row - "Absent when the job was
  started with AI file only" became "Present only when ... AI file + JPEG
  previews"
- the `PreviewRenders` diagram - the default now sits on the LEFT as the
  baseline (three files, no JPEGs) and the right side shows the JPEG row added
  in green, rather than the old framing where the default was on the left and
  the JPEGs were struck out in red on the right

## Outcome

- ✅ Impact: a job started from the UI now skips the render phase unless someone
  asks for previews, which on a heavy mockup is most of the runtime
- 🧪 Tests: tsc and eslint clean; served HTML confirms order and default;
  diagram rendered and reviewed
- 📁 Files: `UploadForm.tsx`, `app/docs/page.tsx`, `OptionDiagrams.tsx`
- 🔁 Next prompts: `main.py:965` still declares `export_mode: str = Form("ai_jpg")`.
  That default only applies to a request that OMITS the field, which the form
  never does - but an API client that omits it still gets JPEGs. Say the word
  and it flips too
- 🧠 Reflection: the UI default and the server-side fallback are two different
  defaults; changing the visible one without saying so would have left a
  disagreement nobody could see

## Evaluation notes (flywheel)

- Failure modes observed: helper copy ("Skip it when...") that silently becomes
  wrong when the option it describes becomes the default
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when a default flips, grep the repo
  for the word "default" near that field name - all three stale mentions here
  were found that way
