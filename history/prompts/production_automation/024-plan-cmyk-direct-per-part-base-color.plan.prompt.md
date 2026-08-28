---
id: 024
title: Plan CMYK-direct per-part base color
stage: plan
date: 2026-07-08
surface: agent
model: claude-fable-5
feature: production_automation
branch: main
user: zija9452
command: none
labels: ["illustrator", "color", "performance", "planning", "base-color"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - Backend/scripts/automate_production.jsx (planned changes, not yet applied)
  - Backend/services/illustrator_automation.py (planned watchdog, not yet applied)
tests:
  - none (planning session)
---

## Prompt

pehle me mockup rgb to cmyk k rhi thi to color conversion k liye base color or rgb color btane hoty the , ab aesa base-color nhi he , qk ab me test-print jis me already cmyk color hi he , or wo hi same order me jane he , tu unusable kam q hi krna , to btao kis trha hm ise better kr skte hen , just plan share kro or edge cases bhi puch lena

(Follow-ups: "gradient he to gradient chlao , jesa he us me" + "again wesa hi sawal kro" — edge cases answered via AskUserQuestion.)

## Edge-case decisions (user-confirmed)

1. base-path na mile → design ke LARGEST filled path ka fill use karo.
2. Per-part color: haan, front/back/sleeve/neck alag ho sakte hain → per-part detection.
3. Excel color_mapping block: HATA DO — ab use nahi hota (RGB-flow legacy).
4. Gradient fill → gradient as-is panel par lagao, koi conversion nahi.

## Plan

A. Color flow rework (automate_production.jsx):
   - Delete pre-flight Strategy A/B detection (~121-163), Excel color_mapping
     block (~165-177), finalBaseColor capture (~179-187); updateSwatchToCMYK
     bhi hata do agar koi aur caller nahi.
   - Per item: baseShape ka fill design paste + deepReLink ke BAAD lagao:
     base-path/base_path/basepath named item ka fill → warna largest filled
     path ka fill → jaisa hai waisa copy (solid/spot/gradient as-is).
   - base-path lifecycle (user-confirmed): color read → alignAndScale ka
     reference → PHIR delete (existing removeBasePaths, alignment ke baad;
     pehle delete kiya to scale reference kho jata hai).
   - Design hi na mile to panel pattern ke apne fill par chhor do + warning log.
   - Accessories ki apni detection unchanged; finalBaseColor fallback ki jagah
     as-is + warning.
   - smartContrast: gradient base par first gradient stop se brightness lo.

B. Neck 20-min resize fix: releaseInternalClippingMasks ko alignAndScale se
   PEHLE chalao (nested clips + live effects resize ko grind karate hain);
   scale reference designBasePath bounds se hi rahega. Test job se verify.

C. Observability: log() per-write append+close (live log); backend watchdog —
   status.json X min stale ho to job fail with clear error (abhi infinite wait).

## Acceptance checks

- [ ] "Creating new Order file..." phase < 1 min (pehle ~7 min)
- [ ] Har panel apna per-part color dikhaye (gradient included)
- [ ] Neck part minutes mein complete, koi RPC_E_SERVERFAULT nahi
- [ ] debug_log.txt run ke dauran live readable

## Risks

- Clip release pehle karne se visible bounds badal sakte hain → ek test job par verify.
- Gradient panel par neck text contrast ka faisla approximate hoga (first stop).
- updateSwatchToCMYK removal se pehle callers confirm karna.
