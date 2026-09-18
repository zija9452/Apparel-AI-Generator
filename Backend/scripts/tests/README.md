# Size / naming test suite

Ye suite sirf ek sawal ka jawab deti hai: **Excel ka size cell aur Illustrator ka
layer name — dono taraf ek hi matlab nikalta hai ya nahi?**

Size string **chaar jagah** parse hota hai, aur chaaron ka jawab same hona
zaroori hai. Match na ho to error nahi aata — **chup-chaap galat output** aata
hai:

| # | File | Kya decide karta hai |
|---|---|---|
| 1 | `../automate_production.jsx` | render — kaunsa panel uthega |
| 2 | `../../services/illustrator_automation.py` | pre-flight — job shuru hone degi ya nahi |
| 3 | `../../main.py` | plan ka order, aur Excel rows ki pairing |
| 4 | `../../../Frontend/my-app/components/UploadForm.tsx` | kaunsi pattern .ai upload maangni hai |

Size ka koi bhi kaam karne ke baad **poori suite chalayein**, sirf wo file nahi
jo aapne chhui.

---

## Chalane ka tareeqa

```sh
cd Backend/scripts/tests
PY=../../.venv/Scripts/python.exe

$PY test_py.py          # 266  checks — python side
node test_jsx.js        # 435  checks — shipped .jsx, node mein
$PY test_hard.py        # 520  checks — adversarial + 4-way parity fuzz
$PY verify_xlsx.py      # 499  checks — workbook jo promise karti hai wo code karta hai
```

Illustrator wale (CC 2015 + `pywin32` chahiye — Illustrator khud launch ho jata
hai, aur **aapki pehle se khuli koi document kabhi nahi chhuti**):

```sh
$PY make_real_order.py    # asli .xlsx banata hai, asli parser+sorter se guzarta hai
$PY build_pattern_ai.py   # do chhoti pattern .ai banata hai, jaan-boojh kar mili-juli naming
$PY probe_pattern_ai.py   # 42 lookups — asli chain, asli .ai par
$PY probe_size_tags.py    # 24 size tags — read-only, kuch likhta nahi
$PY full_matrix.py        # 2817 lookups — 31 sizes x 201 spellings x 14 parts + 3 accessories
```

---

## Kaunsi file kya karti hai

| File | Kaam |
|---|---|
| `cases.json` | ek hi expectation table, `test_py.py` **aur** `test_jsx.js` dono parhte hain |
| `test_py.py` | `_friendly_size`, `is_youth_pattern_size`, `_size_aliases`, `_size_rank` |
| `test_jsx.js` | **shipped `.jsx` se** functions brace-matching se nikaal kar node mein chalata hai — copy nahi, wahi file jo Illustrator chalata hai. ES3 guards bhi (`var short/char/int/class`, `Array.indexOf`, arrow functions, template literals) |
| `test_hard.py` | messy cells (NBSP, en-dash, tab), har spelling x har separator, invariants, 4223-cell fuzz par chaaron implementations ki parity, asli `.xlsx` parser se |
| `jsx_bridge.js` | `test_hard.py` ke liye pul — JSX **aur** `UploadForm.tsx` dono ke jawab wapas deta hai |
| `tag_groups.js` | `SIZE_ALIAS_GROUPS` ko JSON mein nikalta hai |
| `verify_xlsx.py` | `Pattern_Naming_Reference.xlsx` jo spelling promise karti hai, wo sach mein resolve hoti hai ya nahi |
| `make_real_order.py` | asli order sheet + pura pipeline report |
| `build_pattern_ai.py` | asli `.ai` banata hai, kuch panels canonical kuch "designer" naming |
| `probe_pattern_ai.py` | asli alias chain asli `.ai` par |
| `probe_size_tags.py` | `renameSizeTags` ke chaaron test, bina likhe |
| `full_matrix.py` | sab kuch x sab kuch |

---

## Do cheezein jo aasani se toot jati hain

**1. `probe_size_tags.py` apni copy rakhta hai.** `renameSizeTags` ke andar ki
matching logic ek closure mein hai, nikaali nahi ja sakti — to probe usay mirror
karta hai. `renameSizeTags` badlein to `verdict()` bhi badlein, warna ye purana
behaviour "pass" dikhata rahega.

**2. Sabse zyada bug pakadne wala check `test_hard.py` ka round-trip hai:** jo
bhi naam `sizeAliases` pattern file mein dhoondega, wo naam khud bhi usi size par
wapas resolve hona chahiye. Ye ek invariant do halfon ko sach-much barabar sabit
karta hai — 4000 random strings se zyada isi ne pakda.

Hand-written case table se zyada bharosa **parity** par karein: ek hi cell
chaaron parsers ko do aur jawab diff karo.
