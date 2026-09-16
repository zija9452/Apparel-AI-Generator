# Release — ek change, teen jagah

Last updated: 2026-09-10

Ye poora release ka rasta hai: **Cloud Run + Vercel + designer ka agent**. Har baar
scripts dobara parhne ki zaroorat nahi — yahan sab tasdeeq shuda hai.

- Sirf agent ki bareek tafseel chahiye (version bump kyun, installer ke traps) → [`AGENT_RELEASE.md`](AGENT_RELEASE.md)
- Ye architecture kyun aisa hai (135MB pattern cloud par kyun nahi jata) → [`DEPLOYMENT_PLAN.md`](DEPLOYMENT_PLAN.md)

---

## 1. Teen jagah, teen zimmedari

| Jagah | Kya chalta hai | Kaise jata hai |
|---|---|---|
| **Cloud Run** (`apparel-cloud-api`) | `Backend/main.py` — Excel parse + Gemini plan. **Aur `/automation/manifest` jo JSX serve karta hai** | `Backend/deploy-cloudrun.ps1` |
| **Vercel** | `Frontend/my-app` — website + agent ki download zip | git push / Vercel deploy |
| **Designer ka PC** | `Agent/main.py` + `services/*.py` + `scripts/*.jsx` → Illustrator | zip download → `install-agent.ps1` |

`.ai` files kabhi cloud par nahi jatin — sirf plan JSON jata hai. Render designer ke apne
PC par hota hai.

---

## 2. Sab se pehle: aap ne kya badla?

Ye table ghalat parhi to job chalti rahegi, error nahi aayega, bas **purana code** chalega.

| Kya badla | Cloud deploy | Agent package | Vercel |
|---|:---:|:---:|:---:|
| `Backend/scripts/*.jsx` | ✅ **bas yahi kaafi** | — | — |
| `Backend/services/illustrator_automation.py` | — | ✅ + version bump | ✅ (zip ke liye) |
| `Backend/services/job_runtime.py` | — | ✅ + version bump | ✅ (zip ke liye) |
| `Agent/main.py` / `install-agent.ps1` | — | ✅ + version bump | ✅ (zip ke liye) |
| `Backend/main.py` | ✅ | — | — |
| `Frontend/**` | — | — | ✅ |

### JSX khud kyun pohanch jati hai

Agent har job se **pehle** `GET {CLOUD_API}/automation/manifest` maarta hai, har file ka
SHA-256 milata hai, aur nayi `.jsx` utha leta hai (`Agent/main.py` → `_sync_automation`).
Isi liye JSX ke liye cloud deploy hi kaafi hai.

**Magar sirf `.jsx`.** Code me literally:

```python
if not name.endswith(".jsx") or os.path.basename(name) != name:
    continue
```

`.py` is raaste se **kabhi** nahi aati.

---

## 3. Tarteeb — isi order me

> **Cloud pehle.** Manifest wahin se serve hoti hai; agar agent pehle update ho gaya to
> wo purani JSX hi sync karta rahega.

### Qadam 1 — Cloud Run

```powershell
gcloud auth login        # browser kholta hai, script khud nahi kar sakti
cd "D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Backend"
powershell -ExecutionPolicy Bypass -File deploy-cloudrun.ps1 -ProjectId <your-project-id>
```

Script khud ye karti hai:
- `Backend\.env` se `GEMINI_API_KEY*` parh kar Cloud Run env me daalti hai
- `CLOUD_API_KEY` pehli baar generate kar ke `Backend\.cloud-api-key` me rakhti hai, aur
  aage hamesha **wohi dobara** use karti hai (warna Vercel ka key chup-chaap invalid ho jata)
- Region default `asia-south1`, service `apparel-cloud-api`
- Aakhir me deployed URL print karti hai

**Check:**
```bash
curl <url>/health
```

**Pehli baar / URL badla ho to** Vercel → Settings → Environment Variables:

```
CLOUD_API     = <deployed url>
CLOUD_API_KEY = (Backend\.cloud-api-key ki value)
```

`NEXT_PUBLIC_` prefix **kabhi nahi** — wo key har visitor ke JavaScript me compile kar deta hai.

### Qadam 2 — sirf `.jsx` badli thi?

**Yahin ruk jayen.** Agli job par khud chali jayegi. Neeche kuch nahi karna.

### Qadam 3 — version bump (koi bhi `.py` badli ho to)

`Agent/main.py`:
```python
AGENT_VERSION = "0.6.2"   # <- barhao
```

Zaroori kyun: installer aakhir me poochta hai "8765 par kaun hai?". Version na badla ho to
**purana agent apna wahi version bata dega, check pass ho jayega**, aur screen "ready"
likh degi jabke PC purana code chala raha hoga.

### Qadam 4 — apni machine ka install update

```powershell
cd "D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Agent"
powershell -ExecutionPolicy Bypass -File build-agent-package.ps1 -Destination "D:\AIApparelAgent"
```

`-Destination` zaroori hai — bina iske `%LOCALAPPDATA%\AIApparelAgent` me jata hai, jo chal
nahi raha. Chalta hua install dekhne ke liye:
```powershell
Get-CimInstance Win32_Process -Filter "Name like '%pythonw%'" | Select ProcessId, CommandLine
```

### Qadam 5 — apna agent restart

Python module import par memory me chala jata hai — sirf file badalne se kuch nahi hota.

```powershell
$pids = (Get-NetTCPConnection -LocalPort 8765 -State Listen).OwningProcess | Select -Unique
Get-Process -Id $pids | Stop-Process -Force
Start-ScheduledTask -TaskName "AI Apparel Agent"
```

> **Pehle dekh lo koi render to nahi chal raha** — `C:\Production\<job>\status.json` me
> `is_ready` / `progress`. Beech me maara gaya render dobara shuru nahi ho sakta.

### Qadam 6 — website ki zip

```powershell
powershell -ExecutionPolicy Bypass -File build-agent-package.ps1 -ForWebsite
```

`Frontend/my-app/public/AIApparelAgent.zip` me likhti hai. Zip ek snapshot hai — designers
jo aakhri baar bana tha wohi download karte rahenge.

### Qadam 7 — homepage par size

`Frontend/my-app/app/home/page.tsx` me download button ke andar KB likha hai. Script khud
naya size batati hai. Zyada farq na ho to chhor dein.

### Qadam 8 — commit + Vercel deploy

Zip repo me commit karein, phir frontend deploy. **Iske baghair designers ko kuch nahi milega.**

---

## 4. Tasdeeq — waqai laga ya nahi

```powershell
# apni machine ka agent naya version bata raha hai?
Invoke-RestMethod http://127.0.0.1:8765/agent/health | Select version
```

```bash
# agent ki copy repo se milti hai?
diff -q "D:/AIApparelAgent/services/illustrator_automation.py" Backend/services/illustrator_automation.py
diff -q "D:/AIApparelAgent/scripts/automate_production.jsx"    Backend/scripts/automate_production.jsx

# zip ke andar kya hai
python -c "import zipfile;[print(i.date_time, i.filename) for i in zipfile.ZipFile('Frontend/my-app/public/AIApparelAgent.zip').infolist()]"
```

**JSX sync waqai hua?** Kisi bhi job ke baad `production_plan.json` me `automation_version`
dekh lein — hash badla to agent ne nayi JSX uthai.

Zip me ye **kabhi nahi** hone chahiyen (script khud warning deti hai):
`.env`, `services/excel_service.py`, `uploads/`, `Frontend/`

---

## 5. Designers ko kya karna hai

| Kis ne kya badla | Designer ko kya karna hai |
|---|---|
| Sirf `.jsx` | **Kuch nahi.** Agli job par apne aap. |
| Koi bhi `.py` | Nayi zip download → `install-agent.ps1` chalayen |

**Ye khud-ba-khud nahi hota.** `.py` wali tabdeeli tab tak nahi milegi jab tak wo khud
dobara install na karen — isi liye unhe batana zaroori hai.

---

## 6. Teen traps

### `AGENT_CLOUD_API` set na ho to JSX sync kabhi nahi chalti

`Agent/main.py` me default `http://localhost:8000` hai — repo me theek, designer ke PC par
ghalat (wahan 8000 par kuch nahi sunta). `install-agent.ps1` isay User env var me set karta
hai. Set na ho to `_sync_automation()` chup-chaap haar jata hai ("carrying on with the local
copy") aur PC **hamesha** apni download wali JSX chalata rahega.

Ye asal me hua: job `Strictly_Molokai_Brown_Jersey_Order_Youth-3` ek aisi bug par mara jo
din pehle fix aur deploy ho chuki thi.

### Nayi JSX + purani Python

`_sync_automation()` ki wajah se ye combination mumkin hai. Isi liye **naye flag hamesha
aise likhein ke key ghayab hone par purana behaviour chale, error nahi** — jaise
`plan.split_per_size === true`, `plan.export_mode !== "ai_only"`.

Ulta case bhi dekhein: agar nayi `.py` ke baghair koi feature adhoora reh jata hai, to wo
feature tab tak kaam nahi karega jab tak agent update na ho — chahe JSX pohanch chuki ho.

### Pre-flight renderer se sakht na ho

`illustrator_automation.py` ka `_expected_pattern_pieces` wohi naam maangta hai jo JSX
dhoondti hai. Ek taraf naam add kiya aur doosri taraf nahi, to pre-flight un jobs ko rok
dega jo warna theek chal jatin. Dono taraf ek saath badlein.

**Helper likh dena kaafi nahi — usay call bhi karna hai.** 2026-09-10 ko `_part_label_aliases()`
Python me add hui aur neeche tabel me "SS/LS pre-flight mirror" likh diya gaya, lekin
`_expected_pattern_pieces` usay kabhi call nahi karti thi. Function maujood tha, docstring
bhi kehti thi ke abbreviations chalti hain, aur paanch din baad ek order sirf is liye ruk
gaya ke pattern me sleeves `Small LS` likhi thin (fix: 0.7.1). Syntax check aur docstring
padhna dono "ho gaya" kehte hain — pakarne ka tareeqa sirf yeh hai ke function ko us
spelling ke saath chala kar dekho.

---

## 7. 2026-09-10 wale changes — kya chahiye

Is din ye badla:

| File | Kya |
|---|---|
| `Backend/scripts/automate_production.jsx` | Hoodie Jersey gating, hood scale reference (`base-path`), pocket ka panel colour, `XS SS`/`XS LS` panel lookup |
| `Backend/services/illustrator_automation.py` | SS/LS pre-flight mirror, `require_pocket`, Hoodie Jersey pre-flight |
| `Backend/main.py` | `hoodie_jersey` flags + enforcers |
| `Frontend/**` (5 files) | Hoodie Jersey toggle, docs, pause card |

**Teenon deploy chahiyen** — poora Qadam 1 se 8.

Sirf cloud deploy kaafi **nahi**: `XS LS` wale jobs JSX to dhoond legi, magar purana
pre-flight abhi bhi sirf `XS Long Sleeve` maangega aur `pattern_piece_missing` de kar job
pause kar dega. Hoodie Jersey iske baghair chal to jayega, bas uski pre-flight validation
nahi hogi.
