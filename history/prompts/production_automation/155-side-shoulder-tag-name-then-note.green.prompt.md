---
id: 155
title: Side And Shoulder Tag Read Name Then Note
stage: green
date: 2026-08-21
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["extendscript", "illustrator", "side-anchor", "shoulder-anchor", "sleeve-match", "naming"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
 - Frontend/my-app/components/UploadForm.tsx
 - Frontend/my-app/app/docs/page.tsx
tests:
 - node --check on a .js copy of automate_production.jsx - SYNTAX OK
 - npx tsc --noEmit - exit 0
 - npm run build - PASS, 5 static routes
---

## Prompt

jese armhole match unit 1 side sleeve match k hen , lekin inehn side m,e bhi krnma tha to mene nam dia tha shoulder ka notes me , isi trha ab again ek yhi ccase side wala name bhi aya he , use kis trha handle klrun ?? k wo side pr bhi hona he , or armhole match ka unit bhi he ? to koi aesa btao , jo shoulder bhi or kese handle hon ? k ek hi cheez dono handle kr le ? is ka name bhi me side rkh dun notes me ?

(follow-up, the decision) shoulder nam note me rkha tha , agr sleeve matching na ho to normal layer ko nam dene se chl jaye ga ? isi trha abhi side sirf layern name or he , agr user ne Height scales proportionally, sides kept perfect ... ye select kia he , to pehle layer name me name dekhe k shoulder and side he , agr nhi he to notes me dekh le

## Response snapshot

**The collision.** Three features read three different places, which is why the same problem keeps coming back:

| Feature | Read from | Where |
|---|---|---|
| Armhole match (sleeve to side) | layer NAME (`unit 1`), load bearing, body and sleeve pair by it | `automate_production.jsx:4093` |
| SHOULDER-ANCHOR | object NOTE only | `automate_production.jsx:4318` (pre-change) |
| SIDE-ANCHOR | layer NAME only | `automate_production.jsx:4054` (pre-change) |

So writing `side` in the Note did nothing: `anchorSideGraphicsToSeam`'s `hunt()` never looked at `note`. And a plain shoulder band could not simply be named `shoulder` either, because `anchorShoulderBandsToPanel` never looked at `name`.

**Change.** One shared resolver, `_tagOf(item, re)`, added just above `anchorSideGraphicsToSeam`. It normalizes (lowercase, strip non-alphanumerics) and tests the NAME first, then the NOTE, returning whichever matched or null. Both `hunt()` loops now call it: `SIDE_TAG` (renamed from `SIDE_NAME`) and `SHOULDER_TAG` (renamed from `SHOULDER_NOTE`). A function declaration is fully hoisted in ExtendScript, so file scope is safe here where a `var` would not be, same reason `anchorSideGraphicsToSeam` itself sits below its caller.

The regexes are unchanged and still anchored, which is what keeps `Front side match` and `Back side match` (SIDE-SEAM MATCH groups) from ever being caught by SIDE-ANCHOR.

**What now works**
- Plain shoulder band: just name the layer `shoulder`. Previously impossible.
- Plain side artwork: name it `side`. Unchanged.
- A piece that is also an armhole-match unit: keep the name `unit 1`, put `side` or `shoulder` in the Note.
- Both markings on one piece: name `side`, note `shoulder`. The two channels are read independently and the features work on different axes, so both apply.
- Existing mockups are untouched: old `side` names and old `shoulder` notes both still resolve.

**Order and why it is already correct.** SIDE-ANCHOR then SHOULDER-ANCHOR then SLEEVE-MATCH (`automate_production.jsx:1095-1101`). Sleeve-match only MEASURES the body unit and moves the sleeve, so moving or rotating a body unit first is safe and the sleeve follows it automatically.

**Gates kept as they are.** SIDE-ANCHOR still only runs when `design_scale_mode = "height_sides"`, Front and Back only. SHOULDER-ANCHOR still has no plan flag and is a no-op without a marked piece.

**Copy updated** in the scale-mode radio on the upload form and in the handbook: the matching-layers table gained a shoulder row, and chapter 04 gained a "When one piece has to serve two features" section spelling out the name-first, note-second rule.

## Outcome

- ✅ Both features now read name then note, so a taken name is never a dead end.
- ✅ Backward compatible, no plan flag added, no preflight change.
- 🔁 Next prompts: SIDE-ANCHOR is Front and Back only. If a sleeve panel ever needs the same seam anchoring, that is separate work, the sleeve's own seam edge would have to be detected.
