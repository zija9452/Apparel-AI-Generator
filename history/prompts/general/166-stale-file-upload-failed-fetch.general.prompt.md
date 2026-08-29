---
id: 166
title: Stale file misreported as dead backend
stage: green
date: 2026-08-29
surface: agent
model: claude-opus-5
feature: none
branch: main
user: zija9452
command: (chat bug report + fix)
labels: ["frontend", "upload", "error-messages", "file-api", "dx"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/components/UploadForm.tsx
tests:
 - npx tsc --noEmit (pass)
 - npx eslint components/UploadForm.tsx (pass)
 - npx next build (pass)
---

## Prompt

Upload failedFailed to fetchCheck that the backend is running on localhost:8765 and that the plan service is reachable, then try again. ye ata he , jb me mockup and pattern file an dexcel file me change krti hun or saved kr deti hun , lekin web browser me old thi , to kehna chahiye k changes hui hen new pload kro ya again upload kro , ye backend ko keh deta he ,? backend to local abhi healthy hi he'

## Response snapshot

ROOT CAUSE - not the backend at all. The request never left the browser.

`<input type=file>` hands JavaScript a *reference* (path + size + mtime snapshot),
not a copy. Saving over the file in Illustrator/Excel invalidates that snapshot.
The browser only finds out when it reads, and inside `fetch()` a failed file read
surfaces as a bare `TypeError: Failed to fetch` - identical to a dead server.

Two lines made it accuse the backend:
- `UploadForm.tsx:293` showed `err.message` only ("Failed to fetch").
- `UploadForm.tsx:776-780` hardcoded "check that the backend is running on
  localhost:8765" under EVERY error, regardless of cause.

FIX (all in `Frontend/my-app/components/UploadForm.tsx`):

1. `picked` state now holds the actual `File[]` per field, not just a name string
   (`type Picked = { label; files; stale? }`), because only a File can be re-read.
2. `isUnreadable(file)` - reads one byte via `file.slice(0,1).arrayBuffer()`;
   a reject means the reference is dead. `findStale()` maps that over every pick.
3. Detection runs at BOTH points (user's choice): on `window.focus` /
   `visibilitychange` - the Illustrator round trip is exactly when files go stale -
   and again as the first thing in `handleSubmit`, before any upload.
4. Stale fields go amber in place: warn border, `Icon.Warn`, and "Saved again
   since you picked it - click here and select it once more." Selection is KEPT,
   not auto-cleared (user's choice), so nothing has to be re-hunted.
5. Submit shows a `warn` Alert naming the files: "Master Pattern (pattern.ai) was
   saved again after being selected... Nothing was uploaded - this is your
   browser, not the backend."
6. Error phrasing generalised: `fail(title, message, hint, tone)` attaches a
   heading/advice/tone to the Error; the Alert renders `error.hint` only when one
   exists. The two `fetch` calls now have their own honest hints - network for
   `/api/plan`, agent-on-8765 for `/jobs` - and an unknown error now shows its
   message with NO cause guessed.

Also confirmed this session: Cloud Run `/health` = 200 ok, `authenticated: true`,
5 Gemini keys; `/plan` returns 401 without the key, 422 with it. Cold start ~12.8s,
warm ~1.2s.

## Outcome

- ✅ Impact: A re-saved pattern/mockup/Excel now names itself before upload
  instead of producing a false "backend is down" report.
- 🧪 Tests: tsc, eslint and next build all pass. Browser behaviour needs one
  manual run: pick files, re-save one in Illustrator, switch back to the tab.
- 📁 Files: Frontend/my-app/components/UploadForm.tsx
- 🔁 Next prompts: confirm the amber warning appears on tab focus in Chrome
- 🧠 Reflection: a hardcoded "probably the backend" hint under a generic error
  is worse than no hint - it sent the designer chasing a healthy service.

## Evaluation notes (flywheel)

- Failure modes observed: `TypeError: Failed to fetch` is ambiguous between a
  dead server and an invalidated File reference; UI must disambiguate before
  the request, not after.
- Graders run and results (PASS/FAIL): build PASS, lint PASS, typecheck PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): if false positives appear, compare
  `file.lastModified` instead of doing a 1-byte read.
