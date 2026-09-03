# Sleeve quantity inflation

Why an un-personalized sleeve can reach the renderer with `quantity: 7` when
the plan is supposed to hold `quantity: 1`, and what to change when this is
picked up.

Found 2026-09-02. The code is `Backend/main.py`.

**Status: diagnosed and reproduced, NOT fixed. No code has been changed.**

---

## 0. The rule this breaks

`_dedupe_unpersonalized` (`Backend/main.py:544`) states it in its own
docstring:

> An identical print needs exactly one artboard per size group: collapse
> duplicates and force quantity 1.

That is the invariant. A part with no `text_replacements` prints the same for
every jersey, so it needs one artboard — not one per jersey.

Quantity is not a label. `Backend/scripts/automate_production.jsx:833` loops on
it:

```js
for (var q = 0; q < quantity; q++) {
```

So `quantity: 7` places seven identical pieces on the canvas. It costs canvas
area, file size and render minutes, and it is wrong on the print sheet.

---

## 1. What actually happens

`_enforce_sleeve_length` runs immediately after the dedupe
(`Backend/main.py:938` then `:940`) and, on one branch, writes the jersey
counts back over the quantity the dedupe just forced to 1:

```python
# Backend/main.py:631-643
short_qty = sum(int(r.get("quantity", 1) or 1) for r in rows if ... == "half")
long_qty  = sum(int(r.get("quantity", 1) or 1) for r in rows if ... == "full")
...
rebuilt.append({**template, "part_name": "sleeve-short", "quantity": short_qty, ...})
rebuilt.append({**template, "part_name": "sleeve-long",  "quantity": long_qty,  ...})
```

```
_dedupe_unpersonalized   sleeve                  quantity 1     ✅ correct
_enforce_sleeve_length   sleeve-short + -long    quantity 7, 3  ❌ undone
```

The function's own docstring (`:587`) says it must run *after* the dedupe — and
that is exactly what puts it in a position to overwrite it.

---

## 2. It only fires on one branch

`_enforce_sleeve_length` picks a mode from the Special Instructions text. Only
**mixed** is affected. The other three return at `:612` after merely renaming
the part, leaving the quantity alone.

Measured by running the real functions, not by reading them:

| Special Instructions | Result | Pieces on canvas |
|---|---|---|
| mentions short/half only | `sleeve-short: 1` | 2 ✅ |
| mentions long/full only | `sleeve-long: 1` | 2 ✅ |
| mentions neither | `sleeve-short: 1` | 2 ✅ |
| **mentions BOTH** | `sleeve-short: 7`, `sleeve-long: 3` | **12** ❌ (should be 4) |

The "pieces on canvas" column includes the Left/Right split at
`automate_production.jsx:707`, which halves and rounds up:
`2 × max(1, round(qty/2))` per item. So 7 and 3 become 8 + 4 = 12, where 1 and
1 would become 2 + 2 = 4.

### Reproducing it

```powershell
cd Backend
..\Backend\.venv\Scripts\python.exe -c "
import sys, warnings; warnings.filterwarnings('ignore'); sys.path.insert(0,'.')
import main
plan = {'production_groups': [{'size':'L','items':[
    {'part_name':'sleeve','size':'L','quantity':1,'text_replacements':[]}]}]}
rows = [{'size':'L','sleeve':'Half','quantity':7,'personalization':{}},
        {'size':'L','sleeve':'Full','quantity':3,'personalization':{}}]
main._dedupe_unpersonalized(plan)
print('after dedupe      ', [(i['part_name'], i['quantity']) for i in plan['production_groups'][0]['items']])
main._enforce_sleeve_length(plan, rows, 'half and full sleeves', is_hoodie=False)
print('after sleeve split', [(i['part_name'], i['quantity']) for i in plan['production_groups'][0]['items']])
"
```

Observed:

```
after dedupe       [('sleeve', 1)]
after sleeve split [('sleeve-short', 7), ('sleeve-long', 3)]
```

---

## 3. The change to make

`short_qty` and `long_qty` are needed to decide **which** halves to emit — a
size group with no Half rows should not get a `sleeve-short` item at all. That
use is correct and stays. They just must not become the quantity.

In `_enforce_sleeve_length`, `Backend/main.py:636-643`:

```python
template = sleeve_items[0]
qty = int(template.get("quantity", 1) or 1)   # whatever survived the dedupe

rebuilt = []
if short_qty:
    rebuilt.append({**template, "part_name": "sleeve-short", "quantity": qty, ...})
if long_qty:
    rebuilt.append({**template, "part_name": "sleeve-long",  "quantity": qty, ...})
```

Carrying the template's own quantity forward — rather than hardcoding 1 —
keeps the personalized case working, since a personalized sleeve reaches this
point with a quantity `_enforce_personalization` already reconciled against
Excel.

### Verify with

The table in §2: all four instruction modes, expecting `quantity: 1` and 2
pieces on the first three, and `1` / `1` and 4 pieces on the mixed one. Then a
real mixed order end to end, checking `production_plan.json` before the render
starts.

---

## 4. Open question, to settle before changing anything

**Should a *personalized* sleeve in mixed mode carry a count?**

The un-personalized case is not in doubt — it contradicts a rule this codebase
states outright, and it is what makes 12 pieces out of 4.

The personalized case is a production decision, not a bug: if seven jerseys
carry the same sleeve name and number, seven physical prints are genuinely
needed, and `quantity: 7` may be what the print sheet should say. The fix above
preserves whatever `_enforce_personalization` decided, which is the
conservative reading — but if the intent is "one item per physical piece,
always `quantity: 1`", then this function is not the only place to change, and
`_enforce_personalization` (`Backend/main.py:504` and `:534`) has to be looked
at in the same pass.

The prompt sent to the model already leans that way
(`Backend/main.py:259-261`):

> Example: For 10 Large jerseys with different front numbers but identical
> sleeves: Output 10 'front' parts, 1 'back' part, 1 'neck' part, and 1
> 'sleeve' part (quantity: 1).

Ten items, each quantity 1 — not one item with quantity 10.

---

## 5. Ruled out while looking, so nobody re-checks these

| Suspected | Verdict |
|---|---|
| `excel_service.py:184` grouping key omits name/number, collapsing distinct jerseys into one high-quantity bucket | **Not a bug.** A bare `Name` column lands in `pers_cols` as `(None, "name")` and therefore inside `personalization` (`:169-173`), which *is* part of the group key. Distinct names group separately |
| `_enforce_personalization` writing Excel counts over the plan (`:504`, `:534`) | Correct as written. It runs *before* the dedupe (`:937` vs `:938`), so an un-personalized part it inflates is forced back to 1 immediately after |
| Accessory parts (`cuff`, `patti`, universal parts) | Hardcode `quantity: 1` at `:727`, `:759`, `:780` |
| Full-button front split | Copies quantity to both halves deliberately, and documents why: both pieces are needed on every unit, unlike sleeves. `automate_production.jsx:718-721` |
| Non-mixed sleeve modes | Return at `:612` after renaming only. Quantity untouched — confirmed in the table above |

---

## 6. Why this went unnoticed

Nothing reports it. The plan is valid JSON, the render succeeds, and the extra
pieces look like legitimate output unless someone counts them against the order.
It needs Special Instructions naming **both** sleeve lengths, which is the least
common of the four cases — an order that is all-short or all-long never touches
this branch.
