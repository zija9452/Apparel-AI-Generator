---
id: 175
title: IP gate master switch, default off
stage: green
date: 2026-09-02
surface: agent
model: claude-opus-5
feature: deployment
branch: main
user: zija9452
command: (direct request)
labels: ["access-control", "feature-flag", "proxy", "vercel", "fail-open-vs-fail-shut"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Frontend/my-app/proxy.ts
 - Frontend/my-app/.env
tests:
 - next build (gate off) - clean, `ƒ Proxy (Middleware)` still registered
 - next build (IP_GATE=on) - clean
 - tsc --noEmit - clean
 - 9 HTTP cases against real `next start` with gate OFF - all pass through
 - 7 HTTP cases against real `next start` with IP_GATE=on - gate blocks as before
---

## Prompt

mere code me implement he ip addresses ki auth , filhal frontend me aesa kch na aye, what should i do ?? koi ip auth na dikhe  , lekin in future update krni he , yhi se ,

(follow-ups during the same turn)

kia implement kia he ?? kia flow he ??

kia flow he ?? kia kiya he ??

plan share kro

## Response snapshot

The IP gate could not be switched off by emptying `ALLOWED_IPS`, because
`proxy.ts` fails **shut** — an empty list blocks everything rather than
allowing everything. Turning it off therefore needed a separate switch.

Two decisions were put to the user rather than assumed:

1. **Default when the flag is absent.** Chose **default OFF**: `IP_GATE`
   unset/empty/anything-but-`"on"` means the gate does not run. No Vercel
   change needed today, only a redeploy. The stated cost: if the variable is
   ever lost in a future environment migration, the door opens silently
   instead of shutting loudly.
2. **The stale office addresses.** Chose to **keep them with a warning
   comment** rather than blank the line, so the format example survives.

Implementation, deliberately minimal — not one line of the gate was deleted:

```ts
const GATE_ENABLED = (process.env.IP_GATE ?? "off").trim().toLowerCase() === "on";

export function proxy(request: NextRequest) {
  if (!GATE_ENABLED) return NextResponse.next();   // the only new statement
  ...existing gate, untouched...
}
```

`.env` gained an explicit `IP_GATE=off` with the reasoning, and a
`STALE SINCE 2026-09-01` block above `ALLOWED_IPS` recording that J&S moved to
`182.189.64.215` and Jazznet1 to `119.160.2.141` — with an instruction to
re-measure rather than copy those forward.

### Flow

- **Off (now):** `request → proxy() → GATE_ENABLED false → next()`. No 403
  page, no JSON refusal, no header. The browser sees nothing of any of this.
- **On (later):** the original path returns — read IP → parse to bytes →
  loopback? → in `ALLOWED_IPS`? → allow or 403.

### Turning it back on

1. Measure each office wifi (`Invoke-RestMethod ifconfig.me/ip`).
2. Vercel → Environment Variables: `IP_GATE=on`, `ALLOWED_IPS=<current>`
   (**replace** stale entries, never merely add — `NETWORK_ACCESS.md` §5).
3. **Redeploy.** Both values are inlined at build time.

## Outcome

- ✅ Impact: The site stops refusing its own designers on the next deploy,
  while the whole gate survives intact behind one env var. Reversible in a
  settings change plus a redeploy.
- 🧪 Tests: Verified in **both** directions against a real `next start`, not by
  reading the code. Gate OFF: stranger IPv4, stranger IPv6, unparseable
  address, listed IP, no header at all, `/docs`, a real `_next/static` chunk
  and `AIApparelAgent.zip` — all 200, and `Access restricted` appears nowhere
  in the HTML. Gate ON (`IP_GATE=on` build): stranger IPv4/IPv6 403, listed IP
  200, `::ffff:` mapped form 200, neighbouring `.46` 403, installer zip 403,
  `/api/plan` 403 with JSON (`{"detail":...}`) and `no-store`. The build was
  then returned to its default gate-off state.
- 📁 Files: `Frontend/my-app/proxy.ts` (+24 lines of comment, +1 statement),
  `Frontend/my-app/.env` (switch block, stale-IP warning).
- 🔁 Next prompts: mark `NETWORK_ACCESS.md` as describing a switched-off gate;
  build the Google Sign-In flow in `AUTH_PLAN.md` §6; call PTCL about a static
  IP (§2).
- 🧠 Reflection: The interesting part was not the flag but noticing that
  fail-shut makes "just remove the IPs" the wrong instinct — it would have
  locked everyone out while looking like the obvious move. Worth stating that
  default-OFF here contradicts the fail-shut rule one line below it in the
  same file, and that this is intentional: an empty `ALLOWED_IPS` is somebody
  forgetting, an absent `IP_GATE` is the state the file was left in.

## Evaluation notes (flywheel)

- Failure modes observed: none in the change. The pre-existing failure being
  worked around is the 2026-09-01 lease rotation recorded in PHR 172.
- Graders run and results (PASS/FAIL): PASS — build both ways, tsc, 16 HTTP
  cases across the two builds.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when the gate is re-enabled,
  consider logging the refused address to Vercel's request log so a lease
  change announces itself instead of waiting for a designer to report it.
