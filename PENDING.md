# PENDING

Last updated: 2026-09-14

---

## -1. XS ke 6 panels ki jagah wahi ek Pocket JPG export hui (2026-09-14) — SABSE AHEM

Job: `C:\Production\Youth_w_adult_testing` (pehli mixed youth+adult job, do pattern files ke saath).

### Alamat

`XS` folder me 8 JPG bani, magar **XS3 se XS8 tak chhe files bilkul ek hain**:

| File | Hona chahiye tha | Asal me kya hai |
|---|---|---|
| XS1.jpg | Front | ✅ Front, 6717x7654 |
| XS2.jpg | Back | ✅ Back, 6717x7637 |
| XS3.jpg | Long Sleeve | ❌ Pocket, 5083x2850 |
| XS4.jpg | Rib & Cuff | ❌ wahi Pocket |
| XS5.jpg | Inside Hood | ❌ wahi Pocket |
| XS6.jpg | Outside Hood | ❌ wahi Pocket |
| XS7.jpg | Border | ❌ wahi Pocket |
| XS8.jpg | Pocket | ❌ wahi Pocket |

```
XS3..XS8  md5 = 26f1cf42caedec81ed20d7c91f1066e8   1,560,053 bytes   5083x2850
YL7.jpg   md5 = 26f1cf42caedec81ed20d7c91f1066e8   1,560,053 bytes   5083x2850
```

### Yahi sab se ajeeb baat hai

Woh chhe files **`YL/YL7.jpg` ke byte-by-byte barabar hain** — yaani **YL ki Pocket**, jo
**pichle chunk me, ek alag Illustrator process me** export hui thi. XS ka order document
YL ki pocket rakh hi nahi sakta. Isay samjhe bagair fix nahi karna.

### Jo cheezein CONFIRM ho chuki hain (dobara mat tehqeeq karna)

- **Build bilkul theek hua.** Log me `Found 'XS Rib & Cuff' in Pattern`, design paste,
  align, `Queued JPG for instance`, aur `EXPORT: 8 JPG(s) written of 8 queued`. Koi
  `EXPORT FAILED`, koi PARM nahi.
- **Pattern lookup theek hai** — dono pattern files wala change qasoorwar nahi lagta.
  Youth pattern ka index 4ms aur 2ms me bana, aur XS adult file se hi resolve hua.
- **YM aur YL (chunk 1) bilkul theek hain** — saaton JPG alag alag dimensions ke.
- **XS chunk 2 ki pehli size hai**, Illustrator restart ke baad. Yehi asal farq hai.
- **Placements canvas ke andar hain**: `X:-7500 Y:7749 (1612x1837)`, `X:-5874 Y:7749`,
  `X:-4247 Y:7749 (1407x1379)`, `X:-3906 Y:6356 (724x400)`. Log me koi artboard warning
  nahi.
- **XS3.jpg khol kar dekhi** — us me pocket ka shape aur wahi marble/gold design hai.

### Shak ki teen jagahen (tarteeb-war dekhna)

1. **`stampJpegDpi` (`illustrator_automation.py`)** — Python export ke BAAD har JPG ka
   JFIF header dobara likhta hai. Yeh **wahi ek code hai jo dono chunks ki files ko
   chhoota hai**, aur byte-identity isi se sab se asaani se samjh aati hai. Sab se pehle
   yahi dekhna.
2. **`exportResult` (`automate_production.jsx:11250`)** — `doc.artboards.setActiveArtboardIndex(idx)`
   phir `doc.exportFile(...)`. Agar Illustrator `exportFile` ko receiver ke bajaye
   `app.activeDocument` par chalata hai, to XS1/XS2 theek hone ki wajah bhi dhoondni hogi.
3. **Artboard index ka takraao** — hoodie ke teen call sites (`:12373`, `:12464`, `:13068`)
   `orderDoc.artboards.length - 1` bhejte hain. Agar `artboards.add()` khamoshi se nakaam
   ho jaye to kai pieces ek hi index share kar lenge. Magar XS3 (Long Sleeve) main loop ka
   piece hai aur uska apna `abIdx` hai (`:1398`, `:2113`) — sirf yeh theory XS3 ko nahi
   samjhati.

### Kal kaise shuru karna

`C:\Production\Youth_w_adult_testing\Youth_w_adult_testing\debug_log.txt` mehfooz rakhna —
poora saboot usi me hai. Saved `production_ready_order_XS.ai` khol kar uske artboards ginna
aur unke naam/rect dekhna sab se seedha jawab dega: agar us document ke artboard 3 par
Long Sleeve maujood hai, to masla sirf export me hai; agar nahi, to masla layout me hai.

---

## -0.5. 2026-09-14 ke changes — Illustrator par test baqi

| Change | Kahan | Test kaise |
|---|---|---|
| `pdfCompatible = false` on the order .ai save | `automate_production.jsx:4078` | Naya log line: `AI file saved successfully: X (Ns, no PDF-compatible stream)`. **340s se compare karna** (YM 5m40s, YL 5m44s the). File size 799MB se kitni giri, woh bhi dekhna. |
| Toddler order fix + months 1M–12M | `main.py` `_size_rank`, `illustrator_automation.py` size maps, JSX `sizeCodes`/`getFriendlySize`/`sizeAliases` | Ladder: `1M → … → 12M → 1T → … → 10T → YXS → … → adult → Universal` |
| Toddler + months ko youth wala 2.5in LOCAL TAG aur apna tag letter | JSX `:4638`, `sizeToAbbrev` | 4T/6M panel par tag box 2.5in ho aur letter "4T"/"6M" likhe |
| Do pattern files (adult + youth) | 7 files, dekho PHR 189 | Ek mixed order — dono size sets apni file se |

Agent **0.7.0** build aur install ho chuka (`E:\AIApparelAgent`, `-CloudApi http://localhost:8000`),
frontend zip bhi bani (`Frontend/my-app/public/AIApparelAgent.zip`, 282 KB).
**Baqi hai:** zip commit + frontend redeploy, aur cloud redeploy (size order `Backend/main.py`
me hai, woh cloud half hai).

### Ek tajweez jo JAAN BUJH KAR nahi banayi

"Ek waqt me ek hi pattern file khuli rahe" (youth block → restart → adult block). Mumkin hai
aur `startNextOrderDoc` (`:4096`) me sirf rukne ki doosri wajah add karni hai. **Magar isay
speed ka ilaaj samajh kar mat banana** — naapa gaya: youth pattern 801 KB ka hai aur 4ms me
index hota hai, jab ke masla 799 MB ka save tha. Uske edge cases PHR 190 me likhe hain, khaas
kar woh teen spellings (`YXXL`, `Y2XL`, bara `YOUTH`) jo sort aur routing me ikhtilaf karti
hain aur usi guarantee ko torti hain jis par yeh design khara hai.

---

## 0. Illustrator test ka intezaar — is session ke changes

Sab `Backend/scripts/automate_production.jsx` me hain. **`node --check` pass hai, magar Illustrator pe ek bhi test nahi hua.**

| # | Change | Kahan |
|---|---|---|
| 1 | Neck ab height-only uniform scale use karta hai (width+height stretch hataya) | `:979`, `:1021` |
| 2 | Hood centre gap ab `visibleBounds` se naapta hai (pehle `geometricBounds`) | `hcmNormaliseHalfGap` |
| 3 | Hood gap ab **dono** variants pe chalta hai aur `HOOD_CENTER_MATCH` gate se azaad hai | `hoodieBuildVariant` |
| 4 | Hood overlap ab measured hai (`HCM_OVERLAP_PT` constant delete) → **19.0000mm** | `hcmProcessOutsideHood` |
| 5 | Rib & Cuff ordering fix — SLEEVE-MATCH wala bug | SM_ON reorder ke baad |
| 6 | Rib & Cuff ab long sleeve ko tarjeeh deta hai | `ribCuffSleeveBySize` cache |
| 7 | HOOD-PAIR stack — Inside upar, Outside 5mm neeche, centred | `hoodieBuildVariant` |

### Test karte waqt log me ye lines aani chahiyen

```
RIB & CUFF: moved N Rib & Cuff item(s) to the end of the '<Size>' group ...
RIB & CUFF: anchored 5mm below its size's Sleeve, centred on it ...
HOOD GAP [<Size> Inside Hood]: cut edges were ...mm apart; Right half moved ...
HOOD GAP [<Size> Outside Hood]: ...
HOOD-PAIR: stacking <Size> Outside Hood 5mm below its counterpart ...
```

### Hood ke numbers (verify karne ke liye)

```
HCM_GAP_PT = 5*SM_MM - PATTERN_OUTLINE_PT

VISIBLE gap  (cut edge se cut edge) : 11.173pt = 3.9417mm
 + left half stroke  (3pt / 2)      :  1.500pt = 0.5292mm
 + right half stroke (3pt / 2)      :  1.500pt = 0.5292mm
= GEOMETRIC gap (path se path)      : 14.173pt = 5.0000mm
 + sewing allowance 14mm            : 39.685pt = 14.0000mm
= OVERLAP                           : 53.858pt = 19.0000mm
```

⚠️ **Test se pehle:** job shuru hote hi `run_illustrator_automation` har khuli document ko `Close(2)` (bina save) kar deta hai. Pehle confirm karo ke koi apni `.ai` file khuli nahi hai.

---

## 1. Sleeve / Neck ke Name + Number columns plan tak nahi pohanchte

**Halat:** columns parse ho jaate hain, magar print par kabhi nahi aate. Koi error bhi nahi milta — sheet me number likha hoga aur print khali aayega.

Mutasira columns: `Sleeve Name/Number`, `Left Sleeve Name/Number`, `Right Sleeve Name/Number`, `Neck Name/Number`.
(In parts par filhal sirf **Logo** kaam karta hai.)

**Kahan rukta hai:**

| Qadam | File:line | Natija |
|---|---|---|
| Column pehchana jaata hai, value `personalization` me baithti hai | `excel_service.py:40-52` | ✅ |
| LLM ko bhejte waqt poora `personalization` dict strip ho jaata hai | `excel_service.py:287` | agent itemize hi nahi kar sakta |
| `_enforce_personalization` ka loop sirf `("front","back")` hai | `main.py:152` | ❌ |
| `_apply_part_logos` sirf `logo` key padhta hai | `main.py:409-441` | ❌ |

**Fix:** `_apply_part_logos` keساتھ ek step jo `name`/`number` bhi push kare `neck` / `sleeve-left` / `sleeve-right` / `sleeve-both` ke liye.

**BLOCKED — user se poochna hai:** mockup me in ke text layer ke asli naam kya hain? Logo ke liye `LOGO` / `LEFT SLEEVE LOGO` / `RIGHT SLEEVE LOGO` convention hai — number ke liye `SLEEVE NUMBER` / `LEFT SLEEVE NUMBER` / `RIGHT SLEEVE NUMBER` rakhna hai ya kuch aur?

**Saath me ye bhi theek karna:** `excel_service.py:184-187` — `personalization` group key me shaamil hai, is liye alag-alag sleeve numbers rows ko be-wajah alag groups me tod dete hain aur LLM ko "Total Unique Combinations" zyada nazar aata hai, us field ke liye jo wo istemal bhi nahi kar sakta.

**Baad me copy update karni hai:** `Frontend/my-app/app/order-guide/page.tsx:46` abhi bhi kehta hai "Sleeve Number and Neck Name columns will start working after the parser upgrade."

---

## 2. ~~Full-button aur side-seam match me stroke-aware overlap~~ — HO GAYA (2026-08-22)

**Teeno seam ab apna gap khud naapte hain.** Dekho PHR 156 + 157.

- Placket — `pmSeamGap` + `pmCloseDistance`. **Illustrator pe verify ho chuka:** 2XL aur Small dono me gap 3.000pt naapa gaya, `combinedCenterX` theek 1.5pt khisak gaya (`-6494.8398778918` → `-6496.3398778918`).
- Side seam — naya `SS_SEW_PT` (14mm) + `ssSeamGap` + `ssCloseDistance`. Right/generic pair ab 19mm ki jagah ~20.06mm. `SS_OVERLAP_PT` (19mm) sirf Left pairing ka fallback hai (wahan Back layout me ulti taraf baithta hai, naap be-matlab hai). **Test print par verify karna baaki** — 19mm user ki apni empirical testing se aaya tha.
- Hood — `overlapPt = HCM_SEW_PT + gapPt` (`gapPt` pehle se naapa ja raha tha, use nahi ho raha tha). Galat geometry pe purana constant + warning. **Kisi hoodie job par chalana baaki.**

Neeche ka purana analysis reference ke liye rakha hai.

### Purana note (2026-08-19)

**Jad:** panels **visible** edges par rakhe jaate hain (`pWidth` `visibleBounds` se — `automate_production.jsx:792-793` — aur `.left`/`.top` bhi visible hain), jabke centre formula **`geometricBounds`** padhta hai. Har 3pt outline ka 1.5pt gap ke andar chala jaata hai, jise constant ne kabhi ginna hi nahi.

Combined-centre theek **`G / 2`** khisakta hai, jahan `G` wo geometric gap hai jo constant me shaamil nahi.

| Seam | Farz kiya gap | Asli geometric gap | Overlap abhi | Hona chahiye | Centre khisak |
|---|---|---|---|---|---|
| Full-button Front L↔R (`PM_OVERLAP_PT`, `:464`) | **0mm** | **1.0583mm** (3pt) | 2.25in = 57.15mm | 58.21mm | 0.529mm |
| Side seam Front↔Back (`SS_OVERLAP_PT`, `:391`) | 5mm | **6.058mm** (5mm + 3pt) | 19mm | 20.058mm | 0.529mm |
| Hood centre (`HCM`) | — | measured | **19mm** ✅ theek ho chuka | — | 0 |

**Full-button** — `pmCombinedCenterX` (~`:6364`). Comment `:378-381` kehta hai zero-gap assumption "actually TRUE" hai — wo **visible** ke liye sach hai, us geometry ke liye nahi jo formula padhta hai.
→ **Kam risk:** 2.25in ek asli garment placket spec hai, tuned figure nahi.

**Side seam** — `ssCombinedCenterX` (~`:6611`). 5mm `refContext.spacing` hai jo `currentX += pWidth(visible) + spacing` se lagta hai.
→ **Zyada risk:** comment `:386-389` batata hai ke 19mm **user ki apni empirical testing** se confirm hua ("14mm alone was misaligned, but ... 19mm ... lined up correctly"). Ye tay nahi ho saka ke wo test `PATTERN_OUTLINE_PT` (1pt → 3pt) se pehle tha ya baad me — git history sirf 33 commits ki hai aur is file par `git log -S` timeout kar jaata hai.
→ **Badalne se pehle user se poochna, aur test print par verify karna.**

**Faisla 2026-08-19:** filhal kuch nahi karna, sirf note. Pehle hood wala change Illustrator pe verify ho, phir in par aana.

---

## 2b. Number kerning collision guard — LIKHA GAYA, JOB PAR TEST BAAQI (2026-08-22)

`applyTextSpacing` me naya measured collision guard. Dekho PHR 159 + 160.

Mockup ki hand-kerning **waisi hi** rehti hai; guard sirf wahan loosen karta hai jahan
paint merge ho rahi ho. Sab kuch runtime par naapa jata hai:

| naapi hui cheez | tareeqa | is job me |
|---|---|---|
| outline overhang | `W(A)+W(B)-W(AB)` | 42.9pt |
| ink gap per pair | `createOutline()` layer 0 par | per-pair |
| pt per kerning unit | pehle round ke natije se | **0.885** (formula 1.011 kehta tha) |
| floor | `max(0.25 x overhang, 0.005 x size)` | 10.7pt |

Sirf `0.25` judgement number hai — baaqi naapa jata hai ya safety limit hai.

**Scratchpad test PASS (12 values, 1/2/3 digit):** `77` 0.7→11.4pt, `12` 3.8→10.8,
`78` −6.2→11.5, `11` 3.8→10.8; `25` `87` `88` `47` bilkul untouched.

**Baaqi:** asli job par chalana aur log ki `spacing guard:` lines parhna; dekhna ke
har number par 1 extra outline operation ~28 min run ko kitna barhata hai; purana
width-based `MAX_GAP_TIGHTEN` guard ab bemani hai — hatana hai ya nahi, tay karna.

---

## 2c. Size tag ab piece ke andar hi rehta hai — LIKHA GAYA, JOB PAR TEST BAAQI (2026-08-22)

`bringPatternLabelsToFront` clip group ko **ek baar per piece**, sirf direct children me
dhoondta tha. Ye maan leta tha ke "ek piece = ek clipping group". Patti aisa nahi hai —
pattern uske do strips ko do alag clipping group me daalta hai ek plain wrapper ke andar,
to `design_clip_group` ek level neeche chala jata hai. Lookup fail hota tha aur tag
**document root** par phenk diya jata tha (piece se bilkul bahar). Neck usi dead end par
doosre raste se pohanchta tha: `remove` + `base-path` hatane ke baad design khali reh jata
hai, to clip group banta hi nahi.

Live `.ai` (job 8fcab6ee) me confirm hua: `XL Patti` ke dono `X-LARGE` tag aur `XL Neck`
ka tag — teeno Layer 1 ke top level par, unclipped. Front/Back/Sleeve ke tag apne
`design_clip_group` ke andar theek baithe the.

**Fix:** destination ab **per label** nikalta hai (`labelClipHost`) — label ke apne parent
chain me sab se nazdeek `clipped=true` ancestor, aur us ke andar uska `design_clip_group`
agar ho. Koi clipped ancestor na mile to label **jahan hai wahin rehta hai**, sirf apne
siblings ke upar aa jata hai — document root wala raasta khatam.

**Scratchpad verify (`verify_label_clip.jsx`, job ki apni `pattern.ai`, sirf duplicates par):**
6 size (YS/Small/Medium/Large/XL/2XL) x 6 part x 2 variant (design maujood / design khali):

| natija | count |
|---|---|
| SAME (koi behaviour change nahi) | 30 |
| FIXED (root se clip ke andar) | 56 |
| **REGRESSION** | **0** |
| NEW me document root par bacha hua tag | **0** |

Front/Back/Sleeve/Neck har size me **bilkul wahi** group resolve karte hain jo pehle karte
the — is liye un ke export byte-identical aane chahiyen (verification ka seedha tareeqa).
Sab spill ≤ **0.36pt** hain, wahi jo Front/Back aaj bhi bardasht karte hain — koi nudge
nahi chahiye.

**Medium Patti alag hai:** us ke dono tag kisi bhi strip ke bahar, piece ke seedhe bachche
hain (`clipped=false kids=4`). Wahan koi clip hai hi nahi, to naya fallback lagta hai —
tag apni jagah, apne siblings ke upar.

**Baaqi:** asli job chala kar (a) Front/Back/Sleeve ka export purane se compare karna,
(b) Patti ke dono tag apni apni strip ke andar clipped dikhna, (c) Neck ka tag piece ke
andar aana. Dekho PHR 162 (analysis) + 163 (fix).

---

## 3. Slow_exporting — JPG export bohot slow (2026-09-03)

Poori tafseel alag file me: **[SLOW_EXPORTING.md](SLOW_EXPORTING.md)**

Khulasa: wajah code ya mockup nahi — **Illustrator CC 2015 (19.0.0)** + **0.3 GB free RAM**.
Karna hai: RAM barhao, Illustrator upgrade karo. Nahi karna: dpi kam karna, design rasterize karna.

---

## 4. Chhoti cheezen

- `automate_production.jsx:880` — braceless `if` jiski indentation se lagta hai ke assignment `if` se bahar hai. Behaviour theek hai aur `node --check` pass hai; braces offer kiye the, edit decline hui thi.
- SLEEVE-MATCH `covers the full edge` ka ghalat natija — `samplesInside=35/35` un rotated bands par jahan rotation ≥ ~2° hai (Large/XL/2XL). Diagnostic (`SM-COV` block) lagi hui hai, fix nahi. User ka ishara: rotation se ta'alluq hai, general polygon/walk bug nahi.
  **Wajah mil gayi (2026-08-22, PHR 158):** `_smMeasureUnitD` `:5678` — teen anchors me se **koi ek** `full` de de to poora target `full` ban jata hai, chahe `armholetop` ka valid finite D maujood ho. Bade sizes par underarm corner band ke andar aa jata hai (`startedInside=true`) to `bottom` full deta hai aur ~32mm wali armholetop reading phenk di jati hai; Small/Medium bach jate hain kyunke un ka bottom full nahi hota. **Fix (3 lines, abhi nahi kiya):** pehle `best` (finite candidates) nikalo, mile to use karo, warna `full`. User se poochna hai: genuinely full-covering band ke liye guard chahiye (armholetop D panel height ke 5% se zyada ho) ya seedha finite-wins.
- Temporary diagnostics jo hal hone ke baad hatani hain: `BL-DIAG`, `SM-COV`.
- ~~Neck size-tag ka khali box (Medium/XL/2XL) aur ghayab box (Small) — badle hue `pattern.ai`/`mockup.ai` ki wajah se, code ki nahi.~~ **Wajah mil gayi (2026-08-22) — do alag cheezen thin, dono code me:**
  1. **Box piece se bahar** — label routing ka bug, ab theek (dekho §2c).
  2. **Box khali (text ghayab)** — `smartContrast` neck ke kaale panel ko dekh kar tag ka text `CMYK 0/0/0/0` (pura safed) kar deta tha, safed box par. Live `.ai` me naapa: `XL Neck` ka tag `fill=CMYK(0,0,0,0)`, jab ke `XL Front Left` ka wahi tag `K100`. Ye neck-contrast checkbox default OFF hone se band ho gaya (PHR 161) — checkbox ON karne par symptom wapas aayega.
