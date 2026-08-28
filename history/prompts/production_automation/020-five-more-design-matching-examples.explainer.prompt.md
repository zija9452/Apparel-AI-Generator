---
id: 020
title: Five more design matching examples
stage: explainer
date: 2026-07-16
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["sleeve-matching","examples","generalization","artifact"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - scratchpad/sleeve-match-plan.html (EXAMPLES section with 5 SVG diagrams added, republished same URL)
tests:
 - none
---

## Prompt

koi dusri design example bhi do , k or kia kia handle kr skta he kis trha matching , koi 5 or .

## Response snapshot

Added an EXAMPLES section to the artifact (same URL fbdae0c5) with 5 additional design types and mini before/after SVG diagrams showing how the same geometric rule (edge-crossing elements -> farthest visible boundary -> arc-distance D from corner) handles each: (1) DIAGONAL STRIPES - all lines shift as one rigid group, boundary = topmost visible line, gaps preserved automatically; (2) WAVE/SWOOSH PANEL - only the point where the curve cuts the edge matters, interior shape irrelevant; (3) FULL-SIDE COVERAGE - design covers the entire armhole edge so D = full edge length, script verifies the sleeve cap is fully covered too; (4) STACKED COLOR BLOCKS (2+ colors) - rigid group shift means once the farthest boundary lands at D the inner color boundaries align automatically; (5) THIN PIPING/ACCENT LINE - single crossing point transferred to the sleeve so the line runs straight across the seam. All follow from the color/shape-agnostic rule established earlier; no per-design code needed.

## Outcome

- ✅ Impact: User can see the mechanism generalizes across 6 design archetypes (original solid panel + these 5).
- 🧪 Tests: none
- 📁 Files: artifact HTML updated in scratchpad; no project code changed
- 🔁 Next prompts: Pending answers: front/back half identification (or symmetric-D confirmation) and +-1mm tolerance; then implement.
- 🧠 Reflection: Enumerating archetypes early builds user confidence and doubles as an acceptance-test checklist for the eventual JSX routine.

## Evaluation notes (flywheel)

- Failure modes observed: n/a
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Turn the 5 examples into JSX test fixtures once implementation starts.
