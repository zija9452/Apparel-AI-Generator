---
id: 086
title: Fix size-tag background box z-order
stage: green
date: 2026-07-28
surface: agent
model: claude-sonnet-5
feature: production_automation
branch: main
user: zija-yaseen
command: none
labels: [size-tag, z-order, bring-to-front, root-cause-confirmed, live-illustrator-test]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (bringPatternLabelsToFront: after finding a matched label item, climb its ancestor chain - as high as possible while each ancestor's area stays <=10% of the panel - and move that highest safe ancestor instead of just the matched item)
tests:
 - node --check on the edited .jsx - syntax pass (multiple iterations)
 - live Illustrator COM diagnostics (custom read-only .jsx scripts run via win32com against real saved order files) dumped the actual parent-chain and sibling structure around several "3XL"/size TextFrames in a real customer's pattern.ai, both before and after each fix attempt
 - live re-run of the real automation pipeline (run_illustrator_automation) against a real job's own source pattern.ai/mockup.ai (front part only, for speed), twice - once confirming the bug reproduced, once confirming the final fix works
 - visual confirmation on the resulting exported JPGs (both Front Left and Front Right) - background box now renders behind the size-tag text
---

## Prompt

D:\...\renders\3XL_Front_Left_Item1.jpg is me jo niche bottom pr size tag a rha he 3xl, is ka bg kahn gya?? jb k pattern me to he na, to yhn q show nhi ho rha he?
[... long multi-turn investigation across several real jobs and two false starts ...]
grouped hi he, usi render me back pr ja rahe us ka box, q?
yr jahn text uper ata he usi ka main group pura cut kro, or end me usi pattern pr clip kr do, to wo tag bhi clip ho kr front pr a jaye ga na
[user rejected the clip-into-design-group refactor after testing showed no benefit; asked to revert]
ye hallucination na kro, pehle test kr lo
live illustrator me box he lekin back pr he, mene manual us box ko pakra or cut kr k clip kr wa dia, to agya box
us puray group ko le ao front pr.
[fix v1 - climb 1 parent level - tested live, box still missing]
nhi aya he tag, revert hi kr do tm
ab dekho isi ki ai ki file open kr k, k kia hua he?? q nhi aya he box?
[diagnosed real saved .ai via a custom read-only jsx run through win32com: text's immediate parent had only 1 child (itself); the filled background box lived 2 levels under the panel group instead, as a sibling of a DIFFERENT ancestor]
sirf 3xl hi nhi, overall sb, kia ek jese hen? pattern me?
[confirmed via the same diagnostic against ALL sizes/parts in the source pattern.ai - identical L0/L1/L2 nesting everywhere: L0=text alone, L1=text-group+box (2 children), L2=wrapper]
[fix v2 applied - climb-while-small logic, but scoped only to the bare-TextFrame branch - tested live, box STILL missing]
mera mtlb tha k sirf 3xl na dekho, blke Large, Medium Or Small bhi dekho
[re-diagnosed: the text was actually being matched by the EXISTING GroupItem/textFrames check on its immediate wrapper L0 (since text is L0's direct child), never reaching the bare-TextFrame branch where the v2 climb logic lived - so the climb never ran]
[fix v3 - moved the climb-while-small logic to apply unconditionally to whatever item isLabel matched, text or group - re-tested live against the real job's own source files: box now renders correctly on both Front Left and Front Right]
Prompt history record bnaya he is ka?

## Response snapshot

Root cause: `bringPatternLabelsToFront()` promotes a matched pattern-native label (the small size-tag) to the front of its panel before export, so it renders above the mockup design instead of underneath it. The matcher recognized either a bare TextFrame or a GroupItem whose OWN `.textFrames` collection was non-empty - but `GroupItem.textFrames` in Illustrator's DOM only reports DIRECT children, not nested descendants. This customer's pattern.ai wraps every size-tag's text in its own small group (text alone), and that wrapper plus the background box are the two children of the group ONE level further up - a structure confirmed identical, via live COM inspection, across every size (XS-3XL) and every part (Front Left/Right, Back, Neck, Sleeve, Patti) in the file. Because the box was never a direct sibling of anything the matcher itself recognized, only the text's own 1-child wrapper ever matched, and it alone got promoted - leaving the (correctly-filled) box behind at its original z-order, underneath the mockup design.

Two earlier fix attempts failed for traceable reasons: v1 only climbed one parent level (landed on the text's own empty wrapper, not the box's shared ancestor); v2 added a climb-while-under-10%-panel-area loop but scoped it to the bare-TextFrame code path only, while in practice the item that actually matched was the GroupItem wrapper (via the existing `.textFrames.length > 0` check), never a bare TextFrame - so the v2 loop never executed. The final fix (v3) moved the climb logic out of either specific branch so it runs for whatever item satisfies `isLabel`, walking up through ancestor GroupItems and keeping the highest one that still stays at or under 10% of the panel's area - which lands on the shared grandparent containing both the text-wrapper and the box, and moves that whole thing to the front together.

Each iteration was verified against real data rather than assumption: custom read-only `.jsx` diagnostics were run through `win32com` against the customer's actual saved order files to dump real parent-chains, sibling lists, and per-ancestor areas (both before touching code, and after each fix attempt), and the final fix was confirmed with a live re-run of the actual `run_illustrator_automation()` pipeline against the real job's own source files - the exported JPGs now show the tag's white background box correctly rendered behind the "3XL" text on both Front Left and Front Right.

## Outcome

- ✅ Impact: Every part/size in this pattern (and any other pattern using the same "text wrapped one level, box as sibling one level up" tag construction) now keeps its size-tag's background box attached when the tag is promoted to the front of the panel, instead of leaving it stranded underneath the mockup design.
- 🧪 Tests: node --check syntax pass; live win32com diagnostics against real saved .ai files (structure dump, before/after); live full pipeline re-run on the real job's own source pattern.ai/mockup.ai; visual confirmation on exported JPGs (Front Left + Front Right).
- 📁 Files: Backend/scripts/automate_production.jsx (bringPatternLabelsToFront only).
- 🔁 Next prompts: verify the same fix on Back/Neck/Sleeve/Patti and on other sizes for this job; watch for any OTHER pattern file whose tag box lives even further up the ancestor chain than this one (the climb logic is general, but worth confirming on a second distinct customer file).
- 🧠 Reflection: strongly reinforced by the user's repeated "test it, don't hallucinate" pushback - two plausible-looking fixes were shipped and reverted before the actual mechanism (Illustrator's `.textFrames` collection being shallow, not recursive) was found by directly inspecting live document structure via COM instead of reasoning about it from code alone.

## Evaluation notes (flywheel)

- Failure modes observed: v1 and v2 both "sounded right" from reading the code and were syntax-valid, but neither was checked against the real document's actual object graph before being presented as fixed; only after the user demanded a live test each time did the real structure (and the reason each fix missed it) become visible.
- Graders run and results (PASS/FAIL): syntax PASS (all 3 iterations); live visual PASS (v3 only, on the real job).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): if a future pattern file's tag box still goes missing after this fix, dump its ancestor-chain areas the same way (custom read-only jsx + win32com) before writing any new correction - don't assume the same nesting depth applies.
