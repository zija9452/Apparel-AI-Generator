---
id: 175
title: AI only output option
stage: green
date: 2026-09-03
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat) add an "Export AI / Export with JPEG" option at job time
labels: ["export", "form", "performance", "output", "logging"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/components/UploadForm.tsx (new Section 06 "Output" with an export_mode RadioCard pair)
 - Backend/main.py (job_options export_mode form field, normalised plan_dict["export_mode"])
 - Backend/scripts/automate_production.jsx (EXPORT_JPG flag, flushExports gate + queued-vs-written check, exportResult returns success and logs failures)
 - Frontend/my-app/app/docs/page.tsx (ZIP contents: new JPG naming, per-size .ai split, and the AI-only option)
tests:
 - node --check on a .js copy of automate_production.jsx - PASS
 - py_compile on main.py and illustrator_automation.py - PASS
 - tsc --noEmit on the Next.js app - PASS (exit 0)
 - no Illustrator run
---

## Prompt

ek option rkho job krte wakt orchestrator me , k Export AI or Export with Jpeg, ye option rkhna he kahn rkhun ?? ai orchestratin me ?

(follow-up) ok , last me option rkh do , checks lga do , kia best rhe ga ??

## Response snapshot

**Answer to "where".** Not in the AI orchestrator. The Gemini agent's job is turning the Excel into a
plan; this is a deterministic operator preference, and `main.py` already states the principle for
exactly this case - "checkbox-driven: enforced in code, never trusted to the LLM". It belongs on the
upload form, which is what the "Start AI Orchestration" button sits under.

**Placement:** a new final `Section 06 - Output`, after Personalization and immediately before the
submit bar. The other five sections are about the garment; this one is about what the job writes, and
it is the last thing decided before starting.

**Radio, not a checkbox** (the "kia best rhe ga" question). A checkbox reads as an add-on - "also make
JPEGs" - while a radio shows both routes as equals and makes "AI file only" a deliberate choice rather
than an omission. It also matches the form's existing radio pattern (`design_scale_mode`,
`sleeve_match_mode`). Default `ai_jpg`, so nothing changes unless it is chosen.

**Wiring** - the same path every other option takes:
`UploadForm.tsx` (RadioCard `export_mode`) -> `main.py` `job_options()` -> normalised
`plan_dict["export_mode"]` -> `automate_production.jsx` `EXPORT_JPG`.

Normalisation mirrors `sleeve_match_mode`: anything outside `("ai_jpg", "ai_only")` falls back to the
default rather than being passed through, so the stored plan is honest about what ran. The JSX reads
`plan.export_mode !== "ai_only"`, so a plan.json written before this option existed - no key at all -
still renders.

**One gate, one place.** `flushExports` is the only choke point: all six `queueExport` call sites are
untouched, the queue still fills and is still cleared (it would grow for the whole job otherwise), and
only the rendering loop is skipped. That leaves PLACKET-MATCH's and SHOULDER-MATCH's re-queue logic
completely alone.

**The "checks".** Taken as the export verification offered earlier and not yet acted on:
- `exportResult` now returns true/false and logs `EXPORT FAILED: <path> - <message>`. It used to
  return nothing and catch every error into an empty block, so a failed render was indistinguishable
  from a successful one.
- `flushExports` reports `N JPG(s) written of M queued`, naming the failure count when they differ.
  A permission problem, a full disk, or two panels resolving to the same file name used to surface
  only as "kuch files kam hain" days later.

## Outcome

- ✅ Impact: A job can now skip the render phase entirely. On a heavy mockup that is most of the
  runtime - the Knuckle_Headz_Mint reference job spent roughly 80% of two hours exporting, and its ZIP
  was 273MB. The .ai deliverable is byte-for-byte the same either way.
- 🧪 Tests: `node --check` PASS, `py_compile` PASS, `tsc --noEmit` PASS. No Illustrator run.
- 📁 Files: 4 source files + this PHR.
- 🔁 Next prompts: run one job with "AI file only" and confirm the size folders are empty, the .ai
  files are unchanged, and `debug_log.txt` shows the "skipped N JPG(s)" line per file.
- 🧠 Reflection: The question was "where does this go", and the answer came straight out of a comment
  the codebase had already written for itself. Worth reading the existing rationale before inventing a
  placement rule.
- 📋 ADR: not suggested - a new form option following the established pattern.

## Evaluation notes (flywheel)

- Failure modes observed: none at build time. The silent-catch in `exportResult` was a live latent
  fault, not hypothetical - it is what would have hidden the naming collision from PHR 174 had the
  literal instruction been implemented.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): if "AI file only" becomes the common choice, the size
  folders will be created and left empty by `exportFolderFor`. One line to skip creating them, but
  worth confirming the behaviour is actually unwanted before changing it.
