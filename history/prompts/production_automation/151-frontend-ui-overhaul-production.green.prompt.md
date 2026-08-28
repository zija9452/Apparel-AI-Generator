---
id: 151
title: Frontend UI Overhaul For Production
stage: green
date: 2026-08-21
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["frontend", "nextjs", "tailwind-v4", "design-system", "dark-mode", "landing-page", "ui"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/app/globals.css
 - Frontend/my-app/app/layout.tsx
 - Frontend/my-app/app/page.tsx (job page, was the old home)
 - Frontend/my-app/app/home/page.tsx (new landing page)
 - Frontend/my-app/app/order-guide/page.tsx
 - Frontend/my-app/components/ui.tsx (new)
 - Frontend/my-app/components/AppHeader.tsx (new)
 - Frontend/my-app/components/ThemeToggle.tsx (new)
 - Frontend/my-app/components/UploadForm.tsx
 - Frontend/my-app/components/ProductionPlan.tsx
 - Frontend/my-app/public/Standard_Order_Template.xlsx (copied from repo root)
tests:
 - npx tsc --noEmit - PASS
 - npm run build (Next 16.2.4 / Turbopack) - PASS, 4 static routes
 - rendered / and asserted all 15 backend form field names still present, design_scale_mode default intact, nested radios still gated behind their parent checkbox
 - curl 200 on /, /home, /order-guide
---

## Prompt

frontend ki ui complete enhance and advance kr do , production pr jane k liye , eye catching bht achi bna do , k samjh bhi clear aye , or ui bhi achi lge , but functionality ko nhi kharab krna wo perfect hen , just ui update krni he complete

(follow-ups, mid-turn)
- in content do not use hyphens like this "—"
- or kia ye sb just black and white me he ?? kopi colors ? koi theme nhi he ??
- "<hero copy>" home ka page bna kr ye us me dal do , complete landing page bna dena , lekin is page pr bs is section k ilawa abhi jo content he whi rhe bs
- home ka page bna kr ye landing page udhr krna tha , or job wala page default page rkhna he , page change kro pehle
- default page jo k job ka he , us me multiple colors dale hue hen , gola ganda lg rha he
- jese logo bnaya he na colors ka , wo rkho bs
- or home page me bhi

## Response snapshot

**Design system** (`globals.css`): semantic tokens (canvas/surface/line/ink/muted/brand/ok/warn/danger) exposed to Tailwind v4 through `@theme inline`, a `data-theme` dark variant plus a pre-paint init script in `layout.tsx` (no flash, no hydration mismatch), aurora + blueprint hero backgrounds, `custom-scrollbar` (was referenced but never defined), and real `fade-up` / `sheen` / `pulse-ring` keyframes (the old `animate-in fade-in` was a no-op with no plugin installed). Also removed the `font-family: Arial` body rule that was overriding the loaded Geist font.

**New shared components**: `ui.tsx` (icon set, native-input CheckBox/RadioDot with styled indicators, `Name` chips for exact layer names, `Requires` strip, Panel, SectionHead, Alert, button classes), `AppHeader` (sticky, blurred, 3-route nav), `ThemeToggle`.

**Routing**: job page stays the default `/`, the new marketing landing page lives at `/home` (built from the hero copy the user pasted, plus feature grid, 4-step flow, capability lists, CTA band, footer).

**UploadForm**: same form, new presentation. Four numbered sections (files / garment type / placement and matching / personalization), file inputs became click-and-drop cards that show the chosen filename, options became cards that highlight via `has-[:checked]`, and every exact layer name is now a mono chip inside a "Requires" strip instead of buried in a paragraph.

**ProductionPlan**: status pill (Processing/Paused/Ready/Cancelled), percentage, gradient progress bar, a derived 4-phase rail, the eight pause banners collapsed onto one `Alert` component with identical text and buttons, and the JSON payload in a collapsible console card with copy buttons.

**Colour direction** (after feedback): the multi-hue accent system was pulled back out. Both working pages and the landing page now use only the logo's blue-to-violet gradient; green/amber/red remain solely for job state.

## Outcome

- ✅ Functionality untouched: every `name`/`value`, `required`, `defaultChecked`, the 2s status poll, resume/cancel/download handlers and all eight pause flags are byte-for-byte the same behaviour; verified against the rendered HTML.
- ✅ Fixed a broken production link on the way: `/Standard_Order_Template.xlsx` was a 404 because the file only existed at the repo root, not in `public/`.
- ⚠️ Em dashes are banned in user-facing copy per explicit instruction; a sweep removed all of them from the four content files.
- 🧪 tsc + next build pass; all four routes prerender static.
- 🔁 Next prompts: look at the pages in the browser (light and dark) and tune spacing/colour intensity; decide whether the order guide's green/red keep-delete chips should also fold into the single brand gradient.
