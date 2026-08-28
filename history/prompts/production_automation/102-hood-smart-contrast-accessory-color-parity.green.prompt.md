---
id: 102
title: Hood smart contrast and accessory color parity
stage: green
date: 2026-08-13
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (direct request)
labels: ["hoodie", "smart-contrast", "accessories", "cmyk", "spot-color", "size-tag", "illustrator-jsx"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx
tests:
 - node --check on automate_production.jsx (syntax) - PASS
 - Call-site audit: smartContrast has exactly 2 call sites (Neck unchanged at 2 args, Hood at 3); ensureBlackStrokes has exactly 1
 - test_hood.jsx on the REAL 2XL Hood of job f6b1c036 - 6 background colors x (tag recolored + artwork preserved) + 1 control - 13/13 PASS
 - test_acc.jsx on the REAL Twill Tape (0617007f) and Placket (3cfa54af) mockups + 5 synthetic parity cases + 3 stroke cases - 12/12 PASS
 - Functions under test were extracted VERBATIM from automate_production.jsx by extract_fns.py, so the harnesses exercise shipped code
 - NOT yet run through a full end-to-end pipeline job
---

## Prompt

smart contrast logic agr hood ho to us me inside and outside hood me bhi dal do , and accessories me kese color ?? ye bhi to read kren , exact ayen mockup se , abhi detail me btao kia logic he ye , kia hoty hen

## Response snapshot

Explained both mechanisms first, then asked four edge-case questions before
touching code (user's standing rule). Answers drove the scope:
Hood -> pattern's own tag only; Neck -> leave as-is; accessories -> full
getDesignBaseFill parity; accessory stroke -> must come from the mockup.

**smartContrast** (:5670) judges panel brightness with
`b = 1 - (C*0.30 + M*0.59 + Y*0.11 + K)` and writes pure K0 or K100 onto every
TextFrame plus any path named label/size/logo. Two findings worth recording:
the weights are RGB luma coefficients applied to CMY (cyan scores 0.70 -> black
text, magenta 0.41 -> white text), and the whole function sits in ONE try/catch
so a single failing frame silently abandons the rest.

**The trap for Hood:** at :1122 smartContrast runs on `pastedPattern`, which by
then CONTAINS `design_clip_group` (:925-929), and applyToText recurses into
every group. Fine for Neck (its design is brand text) but it would flatten the
Hood's card/dice artwork. Hence the new opt-in `skipDesignGroup` third
parameter, default OFF so Neck's two-arg call is byte-identical.

**Accessory color** has two paths. Path A (mockup design group found by
getSourceView's accTargets) already goes through getDesignBaseFill - correct
already. Path B (:1055) was the gap: it read the largest path's fill directly
and understood only plain CMYK and spot-with-CMYK-ink, so a gray ink, a
gradient, or an unfilled largest path all fell through to "no color detected"
and the panel kept the PATTERN file's stock fill - the same failure that made
Rib & Cuff export red on a black garment.

## Changes

1. `smartContrast(group, bgColor, skipDesignGroup)` - new opt-in third arg skips
   recursion into `design_clip_group`. Neck untouched.
2. `hoodieBuildVariant` - per-side smartContrast for BOTH Outside and Inside
   Hood, each side judged against its own placement path's fill, with
   `skipDesignGroup=true`.
3. `resolveInkForOrderDoc(c)` (new, :5508) - turns a mockup-side color into an
   order-doc-safe equivalent by the same rules as processSubColor.
4. `getDesignStrokeColor(design)` (new, :5547) - mirrors getDesignBaseFill's
   selection but for strokes, always routed through resolveInkForOrderDoc.
5. Accessory Path B now duplicates the mockup group into orderDoc, runs
   mergeAndCleanupSwatches, then getDesignBaseFill - true parity including
   gradients and spots, with no cross-document color reference.
6. `ensureBlackStrokes(container, strokeColor)` - the hardcoded C56 M56 Y53 K92
   is now only the fallback; accessories pass the mockup's own stroke ink.

## Edge cases handled explicitly

- `findAnywhere` indexes LAYERS by name and a Layer has no item-level
  `duplicate()` - Path B branches on `typename === "Layer"` and groups its
  children instead (same shape getSourceView's caller uses).
- smartContrast's brightness math knows CMYK and RGB only. A GrayColor - which
  is also what an UNFILLED path reports for fillColor - scores 0 and would put
  WHITE text on a white panel. The Hood call site resolves the ink first;
  Neck's call is deliberately left alone.
- `hoodieFindSides` matches on name alone and can return a bare PathItem, which
  carries no tag. That now raises a hoodieWarnings entry instead of silently
  no-op'ing inside smartContrast.
- The gradient fill in Path B is assigned to baseShape BEFORE the probe group is
  removed, so the gradient keeps a live reference in the document.

## Regression found and fixed BY the harness

The mockup's Twill Tape is a **bare PathItem, not a group** (confirmed on two
real jobs; Placket is a group, so both shapes occur). Both new helpers walked
`container.pageItems` and returned null for a bare path, which would have made
the accessory stroke silently fall back to the hardcoded ink - i.e. the very
thing this change was asked to fix. `getDesignBaseFill` had the same hole and
would have broken Path B. Both now handle a root that IS a path, matching what
findPlacementPath has always done. The old code never hit this because it used
findPlacementPath directly.

## Outcome

- ✅ Impact: Hood tags become readable on any panel color without touching the artwork; accessories can no longer silently fall back to the pattern's stock color or a hardcoded stroke.
- 🧪 Tests: 25/25 PASS across two Illustrator harnesses on real job files, plus syntax and call-site audits. Not yet run end-to-end through a full pipeline job - that is the remaining gap.
- 📁 Files: Backend/scripts/automate_production.jsx
- 🔁 Next prompts: run a hoodie job and an accessory job end to end, confirm Outside/Inside Hood tag contrast and Twill Tape fill/stroke in the actual renders.
- 🧠 Reflection: asking the four scope questions up front prevented a change that would have flattened the Hood artwork's text. And extracting the shipped functions verbatim into the harness (rather than re-implementing them) is what surfaced the bare-PathItem regression - a re-implementation would have been written against the group assumption too and passed.

## Evidence

- hood_black_panel_K100.jpg - white "2XL" tag on a black panel, ARTWORK still magenta
- hood_white_panel_K0.jpg - black "2XL" tag on a white panel (the pattern's tag is white, so this case was previously invisible)
- Control case: without skipDesignGroup the ARTWORK text flattens to white, proving the flag is what protects the design

## Evaluation notes (flywheel)

- Failure modes observed: none in this change; two latent ones documented (RGB-luma weights on CMY, single try/catch swallowing the rest of a smartContrast pass).
- Graders run and results (PASS/FAIL): node --check PASS; call-site audit PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a harness on the real pattern that exports Outside/Inside Hood before and after, graded by tag light-pixel count - same method that verified Pocket and Border.
