# Agent Release — code designers tak kaise pohanchta hai

Last updated: 2026-09-03

Do alag alag raaste hain. Ghalat raasta maan lena is project ki sab se mehngi ghalti hai:
job chalti rahegi, koi error nahi aayega, bas **purana code** chalta rahega.

---

## 1. Sab se pehle: aap ne kya badla?

| Kya badla | Designer tak kaise pohanchta hai | Aap ko kya karna hai |
|---|---|---|
| `Backend/scripts/*.jsx` | **Khud-ba-khud**, har job se pehle | **Kuch nahi** |
| `Backend/services/illustrator_automation.py` | Sirf package se | Package + version bump |
| `Backend/services/job_runtime.py` | Sirf package se | Package + version bump |
| `Agent/main.py` | Sirf package se | Package + version bump |
| `Agent/install-agent.ps1` | Sirf package se | Package |
| `Backend/main.py` | Ye cloud par chalti hai, agent par nahi | Backend redeploy |
| `Frontend/**` | Website se | Frontend redeploy |

**JSX kyun khud pohanch jati hai:** agent har job se pehle `GET {CLOUD_API}/automation/manifest`
karta hai, har file ka SHA-256 milata hai, aur nayi `.jsx` download kar leta hai
(`Agent/main.py` → `_sync_automation`).

**Magar wo sirf `.jsx` ke liye hai.** Code me literally likha hai:

```python
if not name.endswith(".jsx") or os.path.basename(name) != name:
    continue
```

`.py` is raaste se **kabhi** nahi aati. Ye 2026-09-03 ko pakra gaya: per-size split ka
code Python me tha, agent ki copy 7 din purani thi, feature chup-chaap chala hi nahi
(job `White_testing`).

---

## 2. AGENT_VERSION kab barhana hai

`Agent/main.py` me `AGENT_VERSION`. **Jab bhi `.py` me se koi cheez badle** — yani jab
installed agent ko waqai badalna zaroori ho, sirf chalte rehne dena kaafi na ho.

Sirf `.jsx` badli ho to **mat barhao** — agent ko badalne ki zaroorat hi nahi.

**Ye kyun ahem hai.** Installer purane process ko port 8765 se pakad kar maar deta hai.
Wo aam tor par kaam karta hai. Lekin agar na ho, to installer aakhir me poochta hai
"8765 par kaun jawab de raha hai?" — aur agar version na badla ho, to **purana agent
apna wahi version bata dega, check pass ho jayega**, aur screen "ready" likh degi jabke
PC purana code chala raha hoga.

Isi tarah `jns-apparel.vercel.app` wali migration har PC par nakaam hui thi.

---

## 3. Release ka tareeqa — step by step

### Qadam 1 — sirf `.jsx` badli hai?
Kuch mat karo. Bas Backend chalti honi chahiye. Agli job par khud chali jayegi.
**Neeche wale qadam chhor do.**

### Qadam 2 — version barhao
`Agent/main.py`:
```python
AGENT_VERSION = "0.3.0"   # <- barhao
```

### Qadam 3 — apni machine ka install update karo
```powershell
cd "D:\Zija_Yaseen\Web development\AI-Apparel-Order-Generator\Agent"
powershell -ExecutionPolicy Bypass -File build-agent-package.ps1 -Destination "D:\AIApparelAgent"
```
> `-Destination` zaroori hai. Bina iske script `%LOCALAPPDATA%\AIApparelAgent` me daalti
> hai — jo chal nahi raha. Chalne wala install kahan hai, ye dekh lo:
> ```powershell
> Get-CimInstance Win32_Process -Filter "Name like '%pythonw%'" | Select ProcessId, CommandLine
> ```

### Qadam 4 — apna agent restart karo
Python module import ke waqt memory me chala jata hai — sirf file badalne se kuch nahi hota.
```powershell
$pids = (Get-NetTCPConnection -LocalPort 8765 -State Listen).OwningProcess | Select -Unique
Get-Process -Id $pids | Stop-Process -Force
Start-ScheduledTask -TaskName "AI Apparel Agent"
```
**Pehle dekh lo koi render to nahi chal raha** (`C:\Production\<job>\status.json` me
`is_ready` aur `progress`). Beech me maara gaya render dobara shuru nahi ho sakta.

### Qadam 5 — website ki zip banao
```powershell
powershell -ExecutionPolicy Bypass -File build-agent-package.ps1 -ForWebsite
```
`Frontend/my-app/public/AIApparelAgent.zip` me likhti hai.

### Qadam 6 — homepage par size theek karo
`Frontend/my-app/app/home/page.tsx` me download button ke andar KB likha hota hai.
Script khud size bata deti hai. Zyada na badla ho to chhor do.

### Qadam 7 — commit + redeploy
Zip repo me commit karo, phir frontend redeploy. **Is ke baghair designers ko kuch nahi milega.**

---

## 4. Check karo ke waqai laga

```powershell
# apni machine ka agent naya version bata raha hai?
Invoke-RestMethod http://127.0.0.1:8765/agent/health | Select version
```

```bash
# agent ki copy repo se milti hai?
diff -q "D:/AIApparelAgent/services/illustrator_automation.py" Backend/services/illustrator_automation.py
diff -q "D:/AIApparelAgent/scripts/automate_production.jsx"    Backend/scripts/automate_production.jsx

# zip ke andar kya hai (tareekhen dekho)
python -c "import zipfile;[print(i.date_time, i.filename) for i in zipfile.ZipFile('Frontend/my-app/public/AIApparelAgent.zip').infolist()]"
```

Zip me ye **kabhi nahi** hone chahiyen (script khud warning deti hai):
`.env`, `services/excel_service.py`, `uploads/`, `Frontend/`

---

## 5. Designers ko kya karna hai

| Kis ne kya badla | Designer ko kya karna hai |
|---|---|
| Sirf `.jsx` | **Kuch nahi.** Agli job par apne aap. |
| Koi bhi `.py` | Nayi zip download karo → `install-agent.ps1` chalao |

Installer khud purana process port se pakad kar maarta hai, aur agar koi render chal raha
ho to pehle poochta hai. Agar wo "WRONG AGENT IS RUNNING" likhe, to sign out kar ke
dobara sign in karo aur phir se chalao.

**Ye khud-ba-khud nahi hota.** Jis designer ke paas agent pehle se laga hai, use `.py`
wali tabdeeli tab tak nahi milegi jab tak wo khud dobara install na kare. Isi liye
`.py` badalne par unhe batana zaroori hai.

---

## 6. Nazar rakhne wali baat

`_sync_automation()` ke sath ye khatra aata hai ke **JSX naya ho aur Python purani** —
donon ek doosre se mel na khayen. Abhi tak koi masla nahi hua kyunki JSX bas
`plan.<flag>` padhti hai aur na milne par purane behaviour par chali jati hai
(`plan.split_per_size === true`, `plan.export_mode !== "ai_only"`).

**Naye flag hamesha isi tarah likho** — key ghayab ho to purana behaviour, error nahi.
Warna nayi JSX purani Python wale PC par tootegi.
