# Auth Plan — Google Sign-In

Replacing the IP allowlist with an identity check, why the allowlist failed
within a day of shipping, and what was rejected on the way here.

Written 2026-09-01. Supersedes the access model in `NETWORK_ACCESS.md`; the code
it replaces is `Frontend/my-app/proxy.ts`.

**Status: planned, not built.** Nothing in this document has been implemented.

---

## 0. Why this exists

`NETWORK_ACCESS.md` closed the site to everything except three office networks,
by comparing the visitor's public IP against `ALLOWED_IPS`. It shipped
2026-08-31. It broke on **2026-09-01** — the first working day.

Measured that morning, on each wifi in turn:

| SSID | 2026-08-31 | 2026-09-01 | ASN (routing) |
|---|---|---|---|
| J&S Marketing | `39.34.163.45` | `182.189.64.215` | AS132165 Connect Communications (both) |
| Jazznet1 | `154.198.107.184` | `119.160.2.141` | AS45669 PMCL / Jazz |
| PTCL FF | `39.53.236.91` | `39.53.236.91` — held | AS17557 PTCL |

Two of three moved overnight, almost certainly one power-cut reconnect. The
third held, but that is luck rather than a property worth relying on: no PTR
record on any of the three, and nothing contracted.

§8 of `NETWORK_ACCESS.md` set the condition for reopening this question — "only
if lease changes become frequent enough to be a nuisance". That threshold was
met on day one.

---

## 1. The thing the allowlist got wrong

Not a bug. A category error, and worth stating precisely because it is what
rules out every variation on the same idea.

**Everything stable about a connection is invisible to a web server. The one
thing a web server can see is the one thing that moves.**

| Property | Stable? | Reaches Vercel? | Unique to this office? |
|---|---|---|---|
| PPPoE username / password | ✅ | ❌ | ✅ |
| Modem MAC, ONT serial, line ID | ✅ | ❌ | ✅ |
| Private IP (`192.168.x.x`) | ✅ | ❌ | ✅ |
| Public IP | ❌ | ✅ | ✅ |
| ASN / ISP | ✅ | via lookup | ❌ thousands |
| Geolocation | ✅ | ✅ | ❌ millions |
| **Static IP** | ✅ | ✅ | ✅ |
| **A signed-in identity** | ✅ | ✅ | ✅ |

Only the last two rows satisfy all three columns. There is no third answer, and
that is a property of how the internet addresses things — not a limit of this
codebase.

> The same reasoning already appears in this repo, applied elsewhere:
> `NETWORK_ACCESS.md` §10 refuses an IP allowlist on Cloud Run because "Vercel's
> egress addresses are not fixed on this plan". The website has the same
> problem; it was simply not carried across.

---

## 2. What was rejected, and why

Recorded so none of this gets proposed again without new information.

| Rejected | Why |
|---|---|
| **Keep updating `ALLOWED_IPS` by hand** | Works, but only after staff are already blocked and someone reports it. Two lines moved in one day |
| **A CIDR range covering the office** | The addresses jump between unrelated blocks — `39.34.x` to `182.189.x`. No range holds without admitting thousands |
| **Allow by ASN** | Stable and survives the address change (both J&S addresses are AS132165) — but AS132165 is every Connect Communications customer in Karachi. Not "only us", and adds an IP→ASN lookup dependency |
| **DDNS — router or modem** | Technically viable: traceroute confirmed **no CGNAT** on the J&S line. Killed by **double NAT** — the Linksys E1200 (`192.168.2.1`) sits behind the Huawei ONT (`192.168.100.1`), and the public IP is on the modem. DDNS on the router would publish `192.168.100.x`, which Vercel never sees. Modem DDNS needs PTCL's superadmin login |
| **DDNS — updater on staff PCs** | **The one to never revisit.** It puts the update token on machines that leave the building. A laptop taken home runs its scheduled task, publishes the *home* address, and simultaneously admits that house and locks out the office — with no error anywhere. The failure is silent and it is an accident, not an attack |
| **DDNS update sent from Vercel** | Structurally impossible. DuckDNS derives the address from the request source, so Vercel would publish Vercel's address. The explicit `ip=` parameter exists but Vercel does not know today's office address — which is the original question |
| **One shared Google account on every PC** | Reintroduces the shared secret under a new name. Worse: Google flags one account signing in from many devices and can lock it, which locks out everyone at once — the exact failure being fixed |
| **Shared access code in a signed cookie** | Considered and declined earlier (`NETWORK_ACCESS.md` §8). Superseded: per-person identity costs the same to build and is individually revocable |

### Still open in parallel: a static IP

PTCL sells one. Helpline **1236** from a PTCL landline, or **0800-80-800** from a
mobile. Roughly **Rs 500** activation plus **Rs 350–700/month** depending on
package, delivered in **48 hours**, available on domestic and commercial lines.

This needs **no code change at all** — `proxy.ts` already works, it just stops
being wrong. It is worth buying regardless of this plan, and the two combine:
identity says *who*, the static IP can stay as a second layer saying *where*.

Two questions to ask on that call:

1. Does our line already have a static IP?
2. If not, what does adding one cost on our current package?

---

## 3. What is actually being protected

Worth restating, because it decides how much of this is proportionate.

There is no customer or company data behind this site. The loss from an open
site is **cost and disruption**: `/api/plan` attaches `CLOUD_API_KEY`
server-side, so a stranger who found the URL could spend the Gemini quota and
leave designers on 503s. See `Frontend/my-app/app/api/plan/route.ts`.

Nothing renders without a local agent on the visitor's own PC, so a stranger
who got in could still not produce an order.

---

## 4. The design

### Google Sign-In, restricted to an email allowlist

| Decision | Choice | Why |
|---|---|---|
| Provider | Google | Every designer already has a Gmail. No new account, no password to distribute |
| OAuth client | Existing GCP project `gen-lang-client-0222340998` | Already owns the Gemini keys. No new project, no new billing |
| Who is allowed | `ALLOWED_EMAILS` env var, comma separated | Same shape as `ALLOWED_IPS`. Adding a designer is a setting, not a deploy of new code |
| Session storage | **Signed cookie (JWT), no database** | Nothing to host, nothing to back up, nothing to bill |
| Session length | 6 months (to confirm) | The point is that designers stop seeing it. See §5 |
| Where it runs | `proxy.ts`, replacing the IP check | Same position, same no-`matcher` coverage |

### No database — stated plainly, because it is the question that gets asked

A database is needed for *history* — who ran which order, when. It is not needed
to answer "is this person allowed", which is a list of five strings compared
against one.

If an audit trail is wanted later, Vercel's own request logs cover it without a
database. Do not add one for auth.

---

## 5. What a designer actually experiences

This is the requirement — designers should not have to think about auth.

**First visit, once:**

```
open the site → "Sign in with Google" → pick the account → in
```

No password typed: Chrome is already signed into their Gmail, so it is one
click on an account chooser. Roughly three seconds.

**Every visit after that, for six months:** nothing. The site opens.

**After six months:** the same single click, once.

This is the same shape as the agent pairing that already exists — a token lands
in the browser once and works for months afterwards, and no designer has ever
had to think about it.

---

## 6. What to build

Ordered. Nothing here is written yet.

1. **Read the bundled docs first.** `Frontend/my-app/AGENTS.md` requires it, and
   this is Next **16.2.4**, where the `middleware` convention was renamed to
   `proxy`. Auth.js/NextAuth's current integration with Next 16 has **not been
   verified** — check `node_modules/next/dist/docs/` and the library's own docs
   before choosing between Auth.js and a hand-rolled OAuth flow. Do not assume
   the App Router patterns from older versions still apply.
2. **OAuth client** in `gen-lang-client-0222340998` — authorised redirect URIs
   for the Vercel domain and `localhost:3000`.
3. **Env vars**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`,
   `ALLOWED_EMAILS`. All server-only — none may take a `NEXT_PUBLIC_` prefix,
   for the reason spelled out in `app/api/plan/route.ts`.
4. **`proxy.ts`** — replace the IP comparison with a session check. Keep the
   loopback exemption, keep the absence of a `matcher`, keep `no-store`.
5. **Sign-in page**, styled to match the site. A visitor who is not on the list
   gets a refusal that names the signed-in email, so the fix is obvious.
6. **Keep `ALLOWED_IPS` as an optional bypass** — an office on the list skips
   the sign-in entirely. Empty means "everyone signs in". This is what makes a
   static IP additive rather than an alternative.
7. **Rate limit `/api/plan`** — per-identity and global daily. Sign-in stops
   strangers; the limit stops an accident.
8. **Tests**, against a real `next start`, in the shape `NETWORK_ACCESS.md` §6
   used: allowed email in, unlisted email out, expired session, tampered cookie,
   `/api/*` returns JSON not HTML, static assets and the installer zip covered.
9. **Docs** — fold `NETWORK_ACCESS.md` into this and mark the IP-only model
   historical.

---

## 7. Edge cases to handle, not discover

| Case | Required behaviour |
|---|---|
| `ALLOWED_EMAILS` unset | Block everything. A forgotten gate must fail shut — same rule as `ALLOWED_IPS` |
| Signed in, not on the list | 403 naming the email that was refused. Do not send them back to a chooser loop |
| `/api/*` while signed out | JSON, not the HTML sign-in page — a `fetch()` must get the shape it expects |
| Session expires mid-job | The `.ai` upload goes browser → localhost agent and never touches Vercel, so a running render is unaffected. Only `/api/plan` can fail, and only before a job starts |
| Localhost / `npm run dev` | Exempt, as loopback is today, or dev needs real OAuth credentials to boot |
| Cookie on the agent's origin | None of this touches `http://localhost:8765`. The agent keeps its own pairing token |
| Designer leaves | Remove the email, redeploy. Their existing cookie must also stop working — check the allowlist on **every request**, not only at sign-in |

> That last row is the one that quietly goes wrong. If the email list is checked
> only during sign-in, a departed designer's six-month cookie keeps working for
> six months. The list must be consulted on every request.

---

## 8. What this costs, stated plainly

- **One click per designer, once every six months.** Not zero. Zero is only
  reachable by putting a secret on each machine, which was rejected above.
- **Google is now a dependency.** If Google's OAuth is down, nobody signs in.
  Existing sessions keep working, so the blast radius is limited to new sign-ins
  during the outage.
- **Sessions outlive removal unless the list is checked per request.** See §7.
- **`AUTH_SECRET` is a real secret.** It signs the cookies. It lives in Vercel's
  environment variables and nowhere else — not in the repo, not in the zip.
- **This does not protect the agent.** `Agent/main.py` keeps its own pairing
  token, loopback bind and `Host` check. Unchanged, and still the right design.
- **It gates people, not places.** A designer signed in at home would get in.
  That is a feature or a fault depending on policy — decide it deliberately, and
  if "office only" is required, keep `ALLOWED_IPS` populated as well (step 6).

---

## 9. Open questions

1. **Session length** — 6 months or 1 year?
2. **The email list** — which addresses?
3. **Should signed-in access work from outside the office**, or must both the
   identity and the network match?
4. **Static IP** — is PTCL being called? If it arrives, step 6 makes it a second
   layer rather than a replacement.
