---
id: 045
title: Order Guide Page Nextjs
stage: green
date: 2026-07-15
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["nextjs", "order-guide", "documentation-page", "excel-template-download", "checkbox-demo"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/app/order-guide/page.tsx (created - easy-English guide page with template download, scenario switcher, checkbox demo)
 - Frontend/my-app/public/Standard_Order_Template.xlsx (created - copied template for /Standard_Order_Template.xlsx download)
 - Frontend/my-app/app/page.tsx (modified - "Documentation" nav now links to /order-guide)
tests:
 - npx tsc --noEmit passed
 - npm run build passed; route list shows static /order-guide page
---

## Prompt

is page ko mere next.js frontend me bnaty na , document ka link de do udhr , or ye easy english me bna do same udhr , abhi ye claude pr kese he ??

## Response snapshot

Rebuilt the artifact guide as a native Next.js page in the user's frontend:

- app/order-guide/page.tsx — client component in easy English matching the app's existing
  design system (zinc palette, blue-600 accent, uppercase tracking-widest labels, dark mode
  via Tailwind dark: classes). Sections: Excel sheet preview table, 3 rules, interactive
  scenario switcher (keep/delete column chips), live checkbox-form demo (pre-ticked matrix
  with warning when a part without a mockup placeholder is ticked, labelled "Preview —
  coming soon"), works-today-vs-later status.
- Standard_Order_Template.xlsx copied to public/ so the page's "Download Template (.xlsx)"
  button serves it at /Standard_Order_Template.xlsx.
- Home page's dead "Documentation" nav text converted to a Link to /order-guide.
- Followed AGENTS.md: read bundled Next.js 16 docs (page.js and public-folder conventions)
  before writing code. Verified with tsc --noEmit and next build (static /order-guide).

Also answered "abhi ye claude pr kese he??": the artifact is hosted privately on claude.ai
(visible only to the user unless shared from the page's share menu), independent of the
project; the Next.js page is now the canonical copy.

## Outcome

- ✅ Impact: Guide lives inside the user's own app with a working template download; team members can read it without Claude access.
- 🧪 Tests: tsc clean; next build succeeded with /order-guide prerendered static
- 📁 Files: 2 created, 1 modified
- 🔁 Next prompts: confirm PHR 043 edge cases; Phase 1 generic parser; later replace the demo matrix with the real mockup-scan-backed form
- 🧠 Reflection: Reusing the app's existing zinc/blue design system made the page feel native rather than pasted-in from the artifact's separate identity.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): build PASS, typecheck PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): wire the matrix to a real /scan-mockup endpoint when Phase 2 lands
