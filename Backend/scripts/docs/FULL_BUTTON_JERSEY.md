# Full Button Jersey — Reference Guide

Covers everything in `Backend/scripts/automate_production.jsx` that only runs when the
**Full Button Jersey** checkbox is on: the Front-Left/Front-Right split, the Patti part,
Center design matching, Front/Back shoulder matching, and where to look when a job comes
out wrong. Written from the current code — not a spec, a description of what it actually does.

---

## 1. What "Full Button Jersey" mode is

Normal jerseys have one "Front" panel. A full-button jersey's front is cut and printed as
**two separate pieces — Front Left and Front Right** — sewn together at a center button
placket. Turning on the checkbox tells the script to treat every "front" item that way.

- **Requirement:** the mockup `.ai` file must contain groups named exactly one of these pairs
  (checked by `mockupHasBothFrontSides()`):
  - `Front Left` / `Front Right`
  - `Left Front` / `Right Front`
  - `Front_Left` / `Front_Right`
- If the checkbox is on but neither pair is found, the script does **not** fail — it logs a
  warning ("full_button_jersey is ON but the mockup has no 'Front Left'/'Front Right' groups")
  and renders front as a single panel instead. Check `debug_log.txt` for this line if a job's
  front doesn't split the way you expected.
- When the split does happen, every generic `"front"` item in every size group is expanded
  into a `front-left` + `front-right` pair, **both getting the item's full quantity** (not
  halved) — unlike sleeves, which do split a shared quantity, both front halves are needed on
  every single unit.
- **Layout only:** Front-Left and Front-Right for the same size are snapped together at
  **zero gap** (`pmLastFullButtonPanel` tracking, right edge of Left = left edge of Right) so
  they visually sit as one continuous front in the order file — this is placement only, not a
  merge of the artwork.

## 2. The three checkboxes

| Checkbox (form field) | Requires | What it does | Naming it depends on |
|---|---|---|---|
| **Full Button Jersey** (`full_button_jersey`) | — | Enables the Front-Left/Front-Right split and everything below | `Front Left`/`Front Right` (or the other two accepted pairs) |
| **Center design match** (`full_button_center_match`) | Full Button Jersey must be on | Joins a design that crosses the center seam so it lines up across both front halves | A group/shape named exactly `Center` (case/spacing-insensitive), present on **both** sides |
| **Front/Back design match** (`full_button_front_back_match`) | Full Button Jersey must be on | Resizes Back's design so its shoulder-to-design distance matches Front-Left's | A shape/group whose name **starts with** `match` (e.g. `Match_black`, `MATCH_Front`), on both Front-Left and Back |

In the UI (`UploadForm.tsx`), the two sub-checkboxes only appear once Full Button Jersey is
checked, and are visually indented under it — that's a UI nicety, but the code enforces the
dependency too: `CENTER_MATCH`/`FRONT_BACK_MATCH` logic is gated behind `FULL_BUTTON &&` in
every call site, so checking a sub-option without the parent has no effect either way.

## 3. The Patti (button strip) piece

**Patti and Placket are two different things, despite similar names — don't confuse them:**

- **Placket** (`include_placket` checkbox) — a normal accessory, one shared "Universal" piece
  across all sizes, looked up by the design named `Placket` in the mockup. Handled by the
  general accessory pipeline (`isAccessory()` includes `"placket"`).
- **Patti** — the actual button strip for a full-button jersey. This is **not** optional and
  **not** a checkbox of its own: `_enforce_full_button_patti()` in `main.py` auto-adds one
  `patti` item **per size** (never "Universal") whenever `full_button_jersey` is on, because
  its length has to scale with the garment size — it can't be one shared piece like Placket,
  Twill Tape, or Tukdi can.
- In the `.jsx`, Patti is looked up by design name `Patti` / `patti` / `PATTI`
  (`getSourceView`'s `nPart.indexOf("patti")` branch) and is treated as a **normal named
  part**, not run through the accessory pipeline (`isAccessory()` does **not** include
  `"patti"`) — it gets its own full panel/artboard treatment like Front or Back, just smaller.
- If a size group already has a `patti` item (e.g. manually added), `_enforce_full_button_patti`
  skips adding a duplicate for that size.

## 4. Center design match (`CENTER_MATCH`) — how it actually works

Problem it solves: a design/logo that visually crosses the center button seam needs to line up
correctly once the placket is sewn/buttoned closed — which is a real **overlap** (buttons
close one side over the other), not a simple edge-to-edge butt seam.

Current algorithm (v2 — replaced an older artist-drawn reference-line model entirely):

1. **Panel A vs Panel B:** whichever of Front-Left/Front-Right has the bigger total filled
   design area in the *mockup* is "Panel A" (the source side) — decided once per job
   (`pmDecideBiggerSide`, `PM_LEFT_IS_BIGGER`), not per size.
2. **Seam edge** of a panel = its own pattern shape's touching edge (right edge if Left, left
   edge if Right) — panels sit at zero gap, so this is exactly where the other panel begins.
   No separate reference object is needed for this part.
3. **Seam-crossing shared design** = only shapes/groups **named exactly `Center`**
   (case/spacing-insensitive) that touch that seam edge. This used to grab *any* filled/stroked
   art touching the edge geometrically, which wrongly caught incidental decorative lines and
   once left a panel blank in production (job `5bad86bd`) — now it requires the explicit name.
4. Those "Center"-named shapes are cut out of Panel A as one rigid unit (relative arrangement
   preserved), and repositioned horizontally using a closed-form formula equivalent to:
   "slide Panel B 2.25in onto Panel A (`PM_OVERLAP_PT` = 2.25in in points, simulating the
   buttoned-closed overlap), then center the shared graphic on the combined span."
   **Vertical position is untouched** — only X is recomputed; Y stays exactly where Panel A's
   own design placed it.
5. A **guard** rejects the correction if it would move the shared graphic more than 50% of the
   panel width — in that case it's left at its natural position and a warning is logged instead
   of shipping something wildly wrong.
6. The corrected shared unit is duplicated into **both** panels' own clip groups (each panel's
   own imprecise original copy of that seam art is removed first, to avoid a visible
   double/ghosted logo), and Front-Left's JPG is re-exported since its content changed after
   the earlier one was already saved.

**Flow order:** Front-Left always renders first and gets queued (`pmPanelAQueue`, per size);
Front-Right always triggers the join, regardless of which side turned out to be "Panel A".
If Front-Right for a size arrives with no Front-Left queued, you get a warning
("no Front-Left counterpart found queued for this size") and that Right renders unmatched.

## 5. Front/Back shoulder match (`FRONT_BACK_MATCH`)

Different feature from Center match — this one aligns Back's design to Front-Left's, not
Front-Left to Front-Right.

- **What's measured:** the horizontal distance along the shoulder/top edge, from Front-Left's
  own shoulder-tip corner (its outer, non-seam side) to where its `match`-prefixed shape
  crosses that same top edge (`pmMeasureShoulderTarget`). This is captured right after
  Front-Left's own clip is built, before Center-match's join/mirror can touch it, so it reflects
  the design as originally drawn.
- **What's applied:** Back is expected to carry **one** `match`-prefixed shape wide enough to
  reach both shoulders. `pmApplyBackShoulderMatch` uniformly resizes it (never one-sided, never
  tilted — resize is centered on the shape's own combined bounds) until Back's own
  shoulder-tip-to-crossing distance equals Front-Left's target, within 0.01pt. This uses secant
  iteration (same curve-matching approach as the project's existing sleeve-matching code) since
  the crossing point moves non-linearly with scale.
- A **3x grow/shrink guard** stops the iteration and warns if the required scale is absurd —
  a sign the input geometry itself is wrong, not just mismatched.
- Back's JPG is re-exported after a successful resize so the saved preview reflects the change.
- If Front-Left has no `match`-prefixed shape, or Back doesn't, or the shape never crosses the
  top edge on either side, you get a specific warning and Back is left unresized.

## 6. Requirements checklist (things that must be true in the mockup)

- Front-Left/Front-Right groups named exactly as one of the three accepted pairs (section 1).
- For Center match: a shape/group named exactly `Center` on **both** front halves.
- For Front/Back shoulder match: a shape/group whose name **starts with** `match` on
  **both** Front-Left and Back.
- Exactly one Patti item per size (auto-added — don't add your own unless you want to
  override it manually per size).
- Sub-checkboxes (Center match, Front/Back match) only take effect with Full Button Jersey
  also checked.

## 7. If something looks wrong

All full-button-specific warnings collect into one list (`placketMatchWarnings`) and get
written out after the job finishes:

- `placket_match_warnings.json` — machine-readable, in the job's working directory.
- `placket_match_warnings.txt` — human-readable, in the output directory, one line per warning
  — **only written if there's at least one warning.**
- The same lines are also written to `debug_log.txt` as they happen, prefixed
  `PLACKET-MATCH WARNING:` or `SHOULDER-MATCH:`.

Common warning meanings:
- *"no Front-Left counterpart found queued for this size"* — a Front-Right rendered with no
  matching Front-Left for that size; check the plan/size groups.
- *"no Match shape found on Front-Left/Back"* — the `match`-prefixed shape is missing or
  misnamed on one side; shoulder-match silently skips instead of guessing.
- *"centering correction exceeds 50% of the panel width"* — Center match's geometry guard
  tripped; the two front panels likely aren't real mirror-sized pieces, or the `Center` shape
  is mis-touching the seam. Check that size manually.
- *"could not converge the shoulder-match resize"* — the secant search didn't reach the target
  within 8 steps; Back is left at the closest value reached, check manually.

If the `debug_log.txt` mentions `PM-DIAG` lines, those are raw diagnostic coordinates
(panel bounds, seam X, computed center) dumped for every Center-match join — useful if you
need to hand a specific size's numbers to a developer to debug further.

## 8. White Label logo (Back panel, oversize jerseys) — planned, not yet implemented

Separate feature discussed alongside this doc, not implemented yet as of this writing:

- Only applies when a job is flagged as an **oversize jersey** (new flag, not yet added to
  the plan schema).
- The white label logo shape sits on the Back panel, positioned a fixed distance down from
  top-center: **2.5in when `full_button_jersey` is on**, 1.5in otherwise.
- Collision rule: in full-button jerseys with `full_button_front_back_match` on, the Back
  panel also carries the `match`-prefixed shape from section 5. If the label's target
  position would overlap that shape, push the label's group down **3mm** past the shape's
  bottom edge instead.
- See conversation/PHR history for the naming convention chosen for the label group once
  it's implemented, and update this section then.
