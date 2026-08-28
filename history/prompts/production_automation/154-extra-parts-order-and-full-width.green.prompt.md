---
id: 154
title: Extra Parts Order And Full Width Layout
stage: green
date: 2026-08-21
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["frontend", "layout", "form-order", "responsive"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/components/UploadForm.tsx
 - Frontend/my-app/components/AppHeader.tsx
 - Frontend/my-app/app/page.tsx
 - Frontend/my-app/app/home/page.tsx
 - Frontend/my-app/app/docs/page.tsx
 - Frontend/my-app/app/order-guide/page.tsx
tests:
 - npm run build - PASS
 - rendered / and asserted include_placket now appears before full_button_jersey and hoodie, with all five names still present
 - curl 200 on /, /home, /docs, /order-guide
---

## Prompt

Extra parts / Check only the parts this order includes ... Placket Twill Tape Tukdi , is ko full button k uper rkhna he orchestrator page me

(follow-up) or is ki width kia rkhi he default ?? bari screen pr center me hi a rha he , pc ki jitni to rkho widdth ?

## Response snapshot

**Order.** The Extra parts block moved to the top of section 02, so the section now reads Extra parts, then Full Button Jersey, then Hoodie. Only the position changed: `include_placket`, `include_twill_tape` and `include_tukdi` keep their names and values, so the request body is unchanged. Verified against the rendered HTML by comparing the offsets of the five field names.

**Width.** The default was `max-w-6xl`, 72rem, which is 1152px at the 16px root and about 1296px on a 1920 screen once the root scaling from PHR 153 applies. That cap is what centred everything with wide empty margins.

All 12 containers (header, footer and the four pages) are now full width, with side padding that grows instead: `px-5 sm:px-8 xl:px-12 2xl:px-16`.

Deliberately kept: paragraph blocks still carry their own `max-w-2xl` / `max-w-3xl` / `max-w-4xl` measure, so hero copy and chapter intros do not stretch into unreadable 2000px lines. Tables, cards, the upload form and the job status panel all use the full width now.

## Outcome

- ✅ Form field order changed with zero effect on the payload.
- ✅ Layout uses the whole monitor; prose keeps a readable measure.
- 🔁 Next prompts: if prose should also run full width, remove the inner max-w classes, it is a one line change per block.
