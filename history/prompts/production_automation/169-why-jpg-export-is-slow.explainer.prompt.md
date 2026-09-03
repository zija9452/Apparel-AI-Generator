---
id: 169
title: Why JPG export is slow
stage: explainer
date: 2026-09-03
surface: agent
model: claude-opus-5
feature: production_automation
branch: main
user: zija9452
command: (chat) diagnose slow export on Knuckle_Headz_Mint run
labels: ["performance", "export", "illustrator", "jpeg", "dpi"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - Backend/scripts/automate_production.jsx (inspected only, lines 393-394, 9778-9816)
 - C:/Production/Knuckle_Headz_Mint/Knuckle_Headz_Mint/debug_log.txt (read)
 - C:/Production/Knuckle_Headz_Mint/production_plan.json (read)
tests:
 - none (diagnosis only; live job was left untouched)
---

## Prompt

C:\Production\Knuckle_Headz_Mint\Knuckle_Headz_Mint , why this exporting taking too much time?/

(follow-up, mid-turn) maybe the mockup is heavy ?? coz its 10972KB

## Response snapshot

Measured the live run rather than guessing. Findings:

**Phase timings (from debug_log.txt):**
- 10:44:31 automation started
- 10:44:38 mockup opened
- 10:48:57 name index built over mockup — 259,063 ms for only 30 named items (4m19s)
- 10:49:14 order doc created (CMYK)
- 10:52:22 layout of all 47 panels finished; export phase begins
- 11:04 → 11 of 47 JPGs written = ~63 s per file

> **CORRECTION (later in the same session).** The "pixel-bound" conclusion below is WRONG.
> The user pointed at a faster job, `C:/Production/Local_test_Agent`, exported at the same
> 300 dpi. Its own debug_log.txt gives the true rate: 27 JPGs in 272s + 17 JPGs in 129s =
> **~9.1 s per JPG**, on panels that are BIGGER (60-88 MP vs 55-70 MP). That is 4.8 MP/s
> versus this job's 0.87 MP/s — ~5.5x slower per pixel, so pixel count is not the driver.
> (Note: that job's JPG mtimes are all identical to ~0.1 s because the dpi-stamping pass
> rewrote them — mtime is only a valid render clock while a job is still running.)
>
> **Real root cause: live transparency + embedded bitmaps in the mockup design.**
> Comparing the two mockup.ai files byte-wise:
>
> | | Knuckle (slow) | Local_test (fast) |
> |---|---|---|
> | embedded image XObjects | 5 (4059x3542 CMYK + 1317x1305, both with /SMask alpha) | 0 |
> | /SMask (opacity masks) | 21 | 0 |
> | /Group (transparency groups) | 111 | 1 |
> | /ca + /CA (opacity < 100%) | 19 + 19 | 0 |
>
> Illustrator therefore runs the transparency flattener and resamples a 14.4 MP masked
> bitmap on EVERY export, and the design is duplicated into all 74 panels. On top of that
> the order doc holds ~47 copies of that bitmap at once, which is why the per-panel time
> DEGRADES as the flush proceeds (60s -> 80-99s), rather than staying flat.
>
> The 10.9 MB mockup file size the user flagged is a symptom of the embedded bitmaps,
> not the cause in itself.

**Original (superseded) reasoning — the export is pixel-bound, not file-size-bound:**
- `EXPORT_DPI = 300` → `EXPORT_SCALE_PCT = 416.667%` (automate_production.jsx:393-394)
- verified from the written JPEG SOF0 headers: 6062 x 9033 px = 54.8 MP per S/M panel
- L panels 1599x2240 pt, XL/2XL panels 1743x2313 pt → ~70 MP each
- 47 renders in order file 1 + ~27 in production_ready_order_2.ai = 74 renders total
- ≈ 2.7 gigapixels for file 1 alone, at Illustrator's single-threaded ~0.9 MP/s
- projected: ~78 min of pure export; whole run ≈ 1h35m, finishing ~12:10

**The mockup is not the export bottleneck.** It is heavy (259 s to walk it for 30 named
items means a very large total pageItem count), but that cost lands entirely in the
setup phase — 4m19s at the start, ~5% of the run. It does not recur per export.

**Levers, ranked:**
1. `EXPORT_DPI` (line 393) — the only large one. 200 dpi → ~35 min; 150 dpi → ~20 min.
   Blocked on knowing whether these JPGs are the RIP print files or proofs.
2. `opt.antiAliasing = false` (line 9801) — invisible at 300 dpi on a 20x30 in panel,
   costs no resolution. Needs measurement to size the win.
3. Dedupe identical panels by (part, size, NAME, NUMBER) — confirmed real: Item2/Item3
   and Item5/Item6 are byte-identical (md5 match, both qty-2 groups). But most items
   carry distinct names/numbers, so 74 renders → ~60. Only ~19%, not worth the risk.

**Separate observation (not a speed issue):** despite `opt.imageColorSpace =
ImageColorSpace.CMYK`, the written JPEGs are 3-component YCbCr (SOF0 comps=3,
APP14 Adobe transform=1), i.e. RGB — not 4-channel CMYK. Flagged for the user.

## Outcome

- ✅ Impact: Located the real cost centre (megapixels per panel x 74 panels), ruled out the
  user's mockup-size hypothesis with log evidence, and ranked three concrete levers.
- 🧪 Tests: None. The live Illustrator job was deliberately not touched — no COM calls, no
  document opens, per the standing "never disturb a running job / never close open docs" rule.
- 📁 Files: No source edits. Diagnosis only.
- 🔁 Next prompts: Decide the JPG consumer (RIP vs proof) → then change EXPORT_DPI and/or
  measure antiAliasing=false with the pattern.ai repro harness once the run is finished.
- 🧠 Reflection: File size on disk was a misleading proxy in both directions — a 10.9 MB
  mockup cost 4 min of indexing, while the 60 s/panel cost came from output geometry that
  appears nowhere in any file listing. Reading the JPEG SOF0 headers was what made the
  pixel-count argument concrete instead of hand-wavy.

## Evaluation notes (flywheel)

- Failure modes observed: none in the run itself; the job is progressing normally, just slowly.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after the run completes, export one panel twice
  from the finished order .ai — once with antiAliasing true, once false — and time both.
  That isolates the AA share before touching EXPORT_DPI.
