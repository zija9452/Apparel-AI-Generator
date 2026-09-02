---
id: 174
title: Auth plan Google Sign-In
stage: plan
date: 2026-09-01
surface: agent
model: claude-opus-5
feature: deployment
branch: main
user: zija9452
command: (chat) "backup plan se ye bna do .md ki file jis me google sign in ka ho option"
labels: ["auth", "google-oauth", "proxy.ts", "allowed-emails", "static-ip", "ptcl", "asn"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - AUTH_PLAN.md (created)
tests:
 - none (planning document; nothing implemented)
---

## Prompt

Preceding exchanges in this thread, condensed:

1. "again checked kro , koi to aesi ip hogi jo static ho , wrna wo lloog kese pehchanty hen k hmy hi dena he ye net , again check kro ip me , kch to aesa hoga na , net dekho , web search kro"
2. "wo ptcl ff hi tha" / "lekin jns marketing ka change ho gya tha"
3. "but the issue is k jns to change ho gya he na , means k change ho jaye ga bd me ye bhi , kia cheez network he ip ka jo change nhi hota , hm usse fix kr skte hen na"
4. "again check kro , kch to hoga jo pehchana ja sjke jisse ,"
5. "okmjhe btao k jb me sign in google krun us me db chahiye hoga phr mjhe ?? yes or no ?? or me chahun gi k ek alg google acc bna lun jo sb pc me login ?"
6. "professional approch btao k me krun kia , i just want k designers ko kch auth na dekhni pry , sb auto handle ho , to ?"
7. "ok , backup plan se ye bna do .md ki file jis me google sign in ka ho option ,"

## Response snapshot

Wrote `AUTH_PLAN.md` in the voice of `NETWORK_ACCESS.md` / `DEPLOYMENT_PLAN.md`.
Marked **planned, not built** — nothing implemented.

### Two corrections this thread produced

1. **"All three lines changed" was wrong.** `PTCL FF` held `39.53.236.91`
   unchanged from 2026-08-31 to 2026-09-01. The user remembered this correctly
   before I re-measured. Only J&S Marketing and Jazznet1 moved.
2. **The ISP labels in `NETWORK_ACCESS.md` §7 were right; my "correction" of
   them was wrong.** RDAP reports *allocation* (PTCL owns `39.32.0.0/11`);
   ipinfo reports *routing*, which is AS132165 Connect Communications leasing
   that space. Use ipinfo for ISP identity here, not RDAP. PHR 172's claim on
   this point is superseded.

### The finding the user was pushing for

They kept insisting something stable must be observable. It is: **the ASN
survived the address change** — both J&S addresses are AS132165. But AS132165 is
every Connect Communications customer in Karachi, so it is stable and visible
yet not unique. The full matrix in `AUTH_PLAN.md` §1 shows only two properties
satisfy stable + visible + unique: **a static IP, and a signed-in identity**.
That is a property of internet addressing, not of this codebase — which is why
the document states it as the reason no further variation is worth proposing.

Also found: no PTR record on any of the three addresses, a weak hint that none
is provisioned static.

### Answers given

- **Database needed? No.** Email allowlist in an env var, session in a signed
  JWT cookie. A DB is for history, not for "is this person allowed".
- **One shared Google account on all PCs? Advised against.** It is the shared
  secret again, and Google locks accounts that sign in from many devices —
  recreating the exact all-out-at-once failure being fixed.
- **"Designers shouldn't see auth"** — achieved by session length, not by
  removing the login: one click on first visit, then invisible for six months.
  True zero-touch needs a secret on each machine, which was already rejected.

### Also captured in the document

PTCL static IP as a parallel track with real figures (1236 / 0800-80-800,
~Rs 500 setup, ~Rs 350–700/month, 48 hours, zero code change), and step 6 keeps
`ALLOWED_IPS` as an optional bypass so a static IP becomes additive rather than
an alternative.

§7 flags the edge case most likely to go wrong silently: if the email list is
checked only at sign-in, a departed designer's six-month cookie keeps working.
It must be consulted on every request.

§6 step 1 records that Auth.js's integration with Next 16.2.4 is **unverified** —
`AGENTS.md` requires reading `node_modules/next/dist/docs/` before writing code,
and the `middleware`→`proxy` rename means older App Router patterns may not hold.

## Outcome

- ✅ Impact: decision, rejected alternatives and their reasons captured before any code; two factual errors from earlier in the session corrected in the record
- 🧪 Tests: none — planning only
- 📁 Files: `AUTH_PLAN.md` created; `NETWORK_ACCESS.md` not yet marked historical
- 🔁 Next prompts: verify Auth.js against bundled Next 16 docs; implement §6; refresh `ALLOWED_IPS` + redeploy as the stopgap; call PTCL on 1236
- 🧠 Reflection: the user's refusal to accept "there is nothing stable" was right twice over — it surfaced the held PTCL FF address and the stable ASN, and forced the impossibility to be *demonstrated* rather than asserted. Pushback on a conclusion is worth re-measuring, not restating

## Evaluation notes (flywheel)

- Failure modes observed: using RDAP allocation data to contradict a correct routing-based label; asserting "all three changed" from a partial sample without re-checking the third
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when contradicting an existing document's stated fact, check whether the disagreement is a difference of data source before calling the document wrong
