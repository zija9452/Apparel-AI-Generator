---
id: 167
title: Agent ready shown before check finishes
stage: green
date: 2026-09-05
surface: agent
model: claude-opus-5
feature: none
branch: main
user: zija9452
command: (chat bug report + fix)
labels: ["frontend", "agent-status", "loading-state", "react", "ux"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/components/AgentStatus.tsx
tests:
 - npx tsc --noEmit (pass)
 - npx eslint components/AgentStatus.tsx (1 error + 1 warning, both pre-existing on HEAD)
---

## Prompt

explore my whole project , and jb agent redy he ya nhi , ye check ho rha ho to ye likha ata he , Agent ready v , to lading q nhi huaa ?? ye to fallback sec ka ghlt chl rha he nma

## Response snapshot

ROOT CAUSE - the green "all good" block was a fallthrough, not a decision.

`AgentStatus` mounts with `health = null, checking = true`. Every guard before
the final return tests a field of `health`:

- `!checking && !health`  → false, because checking is true
- `health && !health.paired` → false, health is null
- `health?.paired && ...`  → false, health is null

So the first render fell straight through to the success strip and printed
"Agent ready" for an agent it had not yet spoken to. The tell was the version:
`v{health?.version}` on a null health renders a bare **"v"** - exactly what the
user saw. `Agent/main.py:399-403` always returns `version`, so a blank version
could only mean health was null, i.e. the check was still in flight.

FIX (`Frontend/my-app/components/AgentStatus.tsx`):

Added a `checking` branch as the FIRST guard, ahead of every health test:

```tsx
if (checking) {
  return (
    <div className="... border-line bg-surface-2 ... text-muted">
      <span className="h-2 w-2 animate-pulse rounded-full bg-faint" />
      Checking the agent on this PC…
    </div>
  );
}
```

`if (!checking && !health)` then simplifies to `if (!health)`, since checking is
already handled. The strip also shows on every re-check, so "Check again" and
"Pair" visibly do something instead of leaving the previous verdict on screen.

Note: `ready` (line 53) was always correct - it required `paired &&
illustrator_found && disk_ok !== false`, so the parent form was never wrongly
enabled. Only the visible strip lied.

## Outcome

- ✅ Impact: the panel now says "Checking…" while it is checking, instead of a
  green "Agent ready v" for an agent that has not answered.
- 🧪 Tests: tsc passes. eslint reports 1 error + 1 warning that also reproduce
  on the HEAD version of the file (unused `getAgentToken` import;
  react-hooks/set-state-in-effect at the mount effect) - not introduced here.
- 📁 Files: Frontend/my-app/components/AgentStatus.tsx
- 🔁 Next prompts: clean up the two pre-existing lint problems in this file.
- 🧠 Reflection: a success state that is reached by falling past every failure
  guard will eventually claim success for "unknown". Assert the good state,
  don't default to it.

## Evaluation notes (flywheel)

- Failure modes observed: null-state rendering as success in a guard chain
  ordered by failure type but never by "no answer yet".
- Graders run and results (PASS/FAIL): typecheck PASS, lint UNCHANGED-FROM-HEAD
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): if a stale verdict during re-check
  is preferred over a loading strip, gate on `checking && !health` instead.
