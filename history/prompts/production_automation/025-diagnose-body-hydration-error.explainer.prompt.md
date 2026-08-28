---
id: 025
title: Diagnose body hydration error
stage: explainer
date: 2026-07-17
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["nextjs","hydration","debugging","browser-extension"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (diagnosis only; scratchpad cdp_drive.js used to reproduce)
tests:
 - Headless Chrome (clean profile, CDP) against the user's own dev server on port 3000: page renders fully (title, upload form, new Side-sleeve matching checkbox visible in screenshot), ZERO React/hydration errors or exceptions in console
---

## Prompt

_compiled_0rpq4pf._.js (2647:64)body<anonymous>RootLayoutapp\layout.tsx (30:7)12

(follow-up mid-turn) app\layout.tsx (30:7) @ RootLayout ... code frame showing `<body className="min-h-full flex flex-col">{children}</body>` marked at line 30

## Response snapshot

Reproduced the app in a clean headless Chrome (no extensions) via a minimal CDP driver against the user's own running dev server (port 3000): the page renders perfectly - header, workflow, upload form INCLUDING the new Side-sleeve matching checkbox - with zero React errors, zero hydration warnings, zero exceptions. The error the user sees anchors at <body> in RootLayout, which none of today's changes touch. Conclusion: it is a dev-only hydration-mismatch overlay almost certainly caused by a browser extension injecting attributes into <body> (Grammarly / ColorZilla / dark-mode / translator etc.) - the classic Next 16 / React 19 signature for this is a code frame pointing exactly at the body element of the root layout. Advice: open the app in an Incognito window (extensions disabled) - if the error disappears, it is the extension, harmless to the app, and only visible in dev mode. Secondary observation: the long-running dev server's HMR websocket is erroring (ERR_INVALID_HTTP_RESPONSE) and port 3000 was reported "in use by an unknown process" - a dev server restart is recommended anyway.

## Outcome

- ✅ Impact: Confirmed the new frontend changes are healthy in a real browser (screenshot proof); error attributed to the user's browser environment, not the code.
- 🧪 Tests: clean-browser reproduction attempt - no error; visual verification of the new checkbox.
- 📁 Files: no project code changed.
- 🔁 Next prompts: User to confirm via Incognito; if the error persists there, paste the error's headline text (the message above the code frame).
- 🧠 Reflection: The code frame alone (without the headline message) is ambiguous - reproducing in a clean browser against the user's OWN server was the fastest way to separate code bugs from environment noise.

## Evaluation notes (flywheel)

- Failure modes observed: n/a (no code defect found)
- Graders run and results (PASS/FAIL): clean-browser console check PASS (0 errors)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): If user confirms extension attributes in the error text, no code change needed; do NOT add suppressHydrationWarning unless it keeps annoying them.
