# Slow Exporting — JPG export bohot slow

Last updated: 2026-09-03

**Job:** `C:\Production\Knuckle_Headz_Mint` — 74 panel, har panel ~66 sec, poora run **~2 ghante**.

Muqabla: `C:\Production\Local_test_Agent` — **wahi 300 dpi**, panel **barre** (60–88 MP vs 55–70 MP),
phir bhi **9.1 sec per panel**, poora run 14 minute.

| | Knuckle (slow) | Local_test (fast) |
|---|---|---|
| rate | 0.87 MP/sec | **4.8 MP/sec** |
| per panel | ~66 sec (barhta hua: 60 → 99) | 9.1 sec |
| poora run | ~2 ghante | 14 minute |

---

## Wajah — code ya mockup NAHI

| Cheez | Halat | Faisla |
|---|---|---|
| Illustrator | **CC 2015, 19.0.0** (11 saal purana) | ❌ asli wajah |
| Free RAM | **0.3 GB** bachi (total 7.9 GB) | ❌ asli wajah |
| CPU | 4 core, sirf **0.85** use (single-threaded) | ❌ asli wajah |
| `EXPORT_DPI` 300 (`automate_production.jsx:393`) | theek hai | ✅ chhedna nahi |
| Mockup file 10.9 MB | sirf **alamat** hai, wajah nahi | ✅ chhedna nahi |
| Code / JSX | koi bug nahi | ✅ chhedna nahi |

Adobe ne khud maana: script se JPEG export **300 ppi + transparency** ke saath GUI se **~10 guna slow**
hai (unka test: 8 artboard script se 157 sec, manually 2 sec). **27.8.1 me fix** hua —
[UserVoice](https://illustrator.uservoice.com/forums/601447-illustrator-desktop-bugs/suggestions/44692675-export-for-screens-via-extendscript-is-slow-and-ap).
Hum 19.0.0 par hain, us fix se bohot peeche.

### Mockup ke andar kya hai

Dono `mockup.ai` ka byte-level muqabla:

| | Knuckle (slow) | Local_test (fast) |
|---|---|---|
| embedded images | 5 (4059x3542 CMYK + 1317x1305, dono `/SMask` ke saath) | 0 |
| `/SMask` (opacity mask) | 21 | 0 |
| `/Group` (transparency group) | 111 | 1 |
| `/ca` + `/CA` (opacity <100%) | 19 + 19 | 0 |

Yani har export par Illustrator transparency flattener chalata hai + 14.4 MP masked bitmap
resample karta hai, aur ye design **74 panel** me duplicate hai.

---

## KYA KARNA HAI

1. **RAM barhao** — sabse sasta aur pehla qadam. 0.3 GB free par machine paging kar rahi hai,
   isi liye per-panel time **barhta jata hai** (60 sec → 99 sec). 32 GB standard hai.
2. **Illustrator upgrade** — sabse bara faida. Naya flattener + multi-thread + wo Adobe bug fix.
3. Upgrade ke **baad**: Preferences → File Handling → **"Export in Background" OFF**
   (Adobe ka apna bataya hua workaround). **CC 2015 me ye option hai hi nahi** — prefs file
   check kar li, `Export in Background` key maujood nahi.

---

## KYA NAHI KARNA (user ne mana kiya — 2026-09-03)

| Option | Kyun nahi |
|---|---|
| `EXPORT_DPI` 300 se kam karna | **300 dpi hi chahiye** |
| Design ko rasterize/bake karna | **.ai editable chahiye** |
| Mockup me haath se flatten karna | user mockup nahi chhedna chahta |
| Mockup se order .ai ka structure alag karna | user ko .ai aur mockup ek jaise chahiyen |

---

## KIYA JA CHUKA — per-size split (2026-09-03)

Mockup **5MB se bara** ho to ab **har size apni alag `.ai` file** me banti hai:
`production_ready_order_Small.ai`, `_Medium.ai`, `_Large.ai`, ... (Universal accessories aakhri
size ki file me). Khud-ba-khud, koi checkbox nahi — halke mockup wali jobs par koi farq nahi.

- Kahan: `illustrator_automation.py` (size check → `plan_data["split_per_size"]`) aur
  `automate_production.jsx` (`SPLIT_PER_SIZE`, size boundary par `startNextOrderDoc`).
- Kyun: ek document me 40+ panel ke bajaye ~10. Per-panel time ka 60s → 99s barhna aur run ke
  aakhir wale PARM/"Temp Expand failed" — dono memory pressure ki alamat thin.
- Muft faida: exports har size ke baad nikalti hain, poore run ke aakhir me nahi.
- **Abhi napa nahi** — agli run par `debug_log.txt` me har file ka
  `EXPORT: rendering N JPG(s)` → `EXPORT: N JPG(s) written` span dekhna hai. Agar time phir bhi
  barhta hai to wajah document ka size nahi, mockup ki transparency hai, aur neeche wali
  RAM/Illustrator wali baaten hi bachti hain.

---

## Code-side options — SOCHE GAYE, KIYE NAHI (pehle napna hai)

- `opt.antiAliasing = false` (`:9801`) — muft, resolution ka nuqsan nahi. Faida kitna? **napa nahi**.
- Har panel ko apni chhoti temp doc se export karna — `.ai` deliverable bilkul mehfooz. Risk:
  cross-doc coordinate trap (792pt wala purana masla).
- Save-pehle / flatten-baad-me: `saveOrderDoc()` pehle chalao (vector `.ai` disk par likh do),
  phir sirf **memory** me flatten kar ke export karo, phir `close(DONOTSAVECHANGES)` — jo code
  **already** karta hai (`:3332`). Disk par kuch bhi alag nahi hoga. Lekin flatten khud 74 dafa
  hoga, to faida hai ya nahi — **napa nahi**.
  ⚠️ `saveOrderDoc()` artboard 0 hata deta hai → har queued index 1 se khisak jata hai (`:3276`).
  Hal: artboard ko **naam se** dhoondo, index se nahi — code pehle se `ab.name = instanceName`
  set karta hai (`:1033`, `:10641`, `:10731`, `:11285`).
- Ek jaise panel dubara render na karna (same part+size+NAME+NUMBER) — sirf **~19%**, is job me
  74 → ~60. Mehnat ke hisab se kam faida.

---

## Napne ka tareeqa (agli dafa ke liye)

- `debug_log.txt` sirf flush ka **start/end** stamp karta hai, har file ka nahi:
  `EXPORT: rendering N JPG(s) ...` → `EXPORT: N JPG(s) written ...`. Local_test se asli rate
  isi se nikla (27 files / 272 sec + 17 / 129 sec).
- JPG ka **mtime sirf tab tak sahi hai jab tak job chal raha ho**. Khatam hone par Python ka
  dpi-stamping pass har file dobara likhta hai — Local_test ki 44 files ka mtime 0.13 sec ke
  andar ek jaisa tha, wo render ka waqt nahi tha.
- **TODO:** `flushExports` (`:9778`) me har export ka elapsed ms log karo, taake aainda mtime par
  bharosa na karna pare.

---

## Alag baat (speed se ta'alluq nahi)

`opt.imageColorSpace = ImageColorSpace.CMYK` (`:9801`) set hai, magar likhi hui JPG **3-channel
YCbCr** hai (SOF0 comps=3, APP14 Adobe transform=1) — yani RGB, CMYK nahi. Agar ye files seedhi
print RIP par jati hain to check karna chahiye.
