# Chunked render with Illustrator restart + resume

**Goal:** zero PARM errors on split (multi-file) orders, by restarting Illustrator
every 2 saved `.ai` files and resuming from a checkpoint instead of re-rendering
what is already on disk.

**Status:** phases 1-6 implemented 2026-09-08, **not yet run against Illustrator**.
Phase 0 (verify a restart actually clears the session-level PARM) is still open and
is the next thing to do — everything else rests on it.
**Decided:** 2026-09-08.

**JPG naming changed** on the same day, at the user's instruction: a size's second
file now numbers its renders `YM_2_1.jpg, YM_2_2.jpg …` instead of continuing
`YM8, YM9 …`. This removes edge case 4 structurally rather than relying on a
counter surviving the restart — see `nextExportFileName`.

---

## 1. Why

Evidence from job `Strictly_Molokai_Brown_Jersey_Order` (2026-09-07, `E:\debug_log.txt`,
3133 lines, 7 output files):

| File | YM | YL | YXL | 2T | 4T | 5T | 6T |
|---|---|---|---|---|---|---|---|
| PARM recovered | – | 2 | 2 | 1 | 1 | 1 | 0 |
| **PARM failed** | 0 | 0 | 0 | 0 | **3** | **2** | **4** |

9 of 43 panels shipped incomplete. Two distinct failure modes:

- **Panel-level** (YL–2T): PARM at the colour/swatch stage, carries a stage label.
  The existing rollback + rebuild fixes it — 7/7 recovered.
- **Session-level** (4T–6T): PARM at `Duplicating pattern object to Order document...`,
  i.e. the first cross-document `.duplicate()`, with **no stage label**. Rebuilding
  the panel re-runs the identical failing call, so all 10 attempts fail identically.
  81 of the errors land on this one line. ~6 minutes burned on doomed retries.

Degradation tracks the split count, not elapsed time or memory. File 1 is always
clean. The trigger is `startNextOrderDoc()`'s `orderDoc.close()`
(`Backend/scripts/automate_production.jsx:3874`).

**A panel-level rollback cannot repair a session-level fault.** Only a fresh
Illustrator process resets it.

### Why this needs Python, not just JSX

The JSX runs inside a blocking `app.DoJavaScript(eval_command)` call
(`Backend/services/illustrator_automation.py:1641`). A script cannot restart the
application hosting it. All restart logic already lives in Python
(`illustrator_automation.py:1297-1308`) and today runs **only before the job**.
So the chunking loop must wrap line 1641.

---

## 2. Flow

### Python outer loop

```
chunk = 1
while True:
    write resume state (if any) → job_dir/render_state.json
    app.DoJavaScript($.evalFile(automation_bundle.jsx))   # :1641
    state = read job_dir/render_state.json
    if not state.restart_needed:
        break
    _quit_illustrator(prog_ids)        # already exists, :1124
    sleep(2)                           # let Windows release the COM registration
    reconnect + reopen pattern & mockup
    chunk += 1

finalize once: doc.Close(2), _stamp_jpeg_dpi(), make_archive()   # :1656-1666
```

No unsaved-work prompt on the mid-job restart — the pre-flight at
`illustrator_automation.py:1273-1288` already ran, so anything the designer had
open is saved or already forfeited. Same reasoning as the memory-threshold
restart at `:1302-1304`.

### JSX, per chunk — identical every time above the loop

```
1. app.open(pattern) → warmNameIndex(patternDoc, "pattern")     :109
2. app.open(mockup)  → warmNameIndex(mockupDoc,  "mockup")      :113
3. prebuildPatternSizes() + prebuildFullButtonScales()          :172-173
      ^ MUST run while the order doc does not yet exist
4. app.documents.add(CMYK)  → order doc                         :176
5. restore from checkpoint: orderDocIndex, orderDocFiles,
      orderLabelSeen, exportFileCounters, parmErrors, parmBudgetUsed
6. for (i = resume.next_group_index; i < production_groups.length; i++)   :883
      on size boundary → startNextOrderDoc()                    :902
          flushExports() ; saveOrderDoc() ; orderDoc.close()    :3872-3874
          write render_state.json                               ← NEW
          if filesWrittenThisRun == filesPerRun:
              set restart_needed, return cleanly                ← NEW
7. final chunk only: write reports, index files, status 100%
```

**Resume touches step 6 only.** Everything above line 182 re-runs unchanged, every
chunk. Cost measured from the log: `19:20:10 Automation started` →
`19:20:15 New Order document created` = **~5 seconds** (the name index itself is
17 ms + 13 ms; the time is opening two `.ai` files). Three restarts ≈ 15 s, against
~6 minutes of doomed retries removed.

### Checkpoint shape — `job_dir/render_state.json`

Written inside `startNextOrderDoc()` **after** `saveOrderDoc()` succeeds, so it
only ever names files that are already safely on disk.

```json
{
  "next_group_index": 12,
  "order_doc_index": 4,
  "order_doc_files": ["production_ready_order_YM.ai", "..."],
  "order_label_seen": {"YM": 1, "YL": 1},
  "export_file_counters": {"YM": 7, "YL": 7},
  "parm_errors": [],
  "parm_budget_used": 0,
  "files_written_this_run": 2,
  "restart_needed": true
}
```

---

## 3. Edge cases

Each one is a real behaviour in the current code that chunking breaks.

### Must fix — silent data loss

1. **`debug_log.txt` is truncated at every run start.**
   `automate_production.jsx:25` — `logInit.open("w")`. Four chunks would leave only
   the last chunk's log, destroying exactly the evidence this whole change is
   diagnosed from. → On resume, skip the truncate and append, with a chunk separator.

2. **Every report file is `open("w")` at end of run.**
   `parm_errors.txt` (`:2086`), `sleeve_match_warnings.txt` (`:1983`), and the
   json/txt pairs at `:2001-2060`. Per-chunk writes mean the last chunk wins and
   earlier chunks' warnings vanish. → Accumulate the arrays through the checkpoint;
   write these files **only on the final chunk**.

3. **`order_files.txt` would list one chunk's files only.**
   `orderDocFiles` (`:213`) is a per-run local; `writeOrderFileIndex()` (`:3897`)
   bails under 2 entries. → Restore from checkpoint before use.

4. **JPG names could collide and overwrite.**
   `exportFileCounters[sizeLabel]` (`:10539`) numbers `YM1, YM2, …`, resetting per
   size. Normally safe, because a restart boundary is a size boundary. **But** a
   size too tall for one canvas overflows into `_Large_2.ai` (`:3881-3883`) and the
   counter continues across those two files. A restart landing between them would
   restart at `Large1` and overwrite `Large1.jpg`. → Checkpoint the counters **and**
   only break a chunk at a true size boundary, never mid-size.

### Must decide

5. **Universal / accessory items have no size.**
   `sizeLabel === "Universal"` items are deliberately skipped by the split
   (`:899-902`) and ride in whichever file happens to be open; they render to the
   output root, not a size folder (`:10501`), and keep their instance name rather
   than a number (`:10538`). A restart boundary near them changes which file they
   land in. → Decide: pin them to the first chunk, or the last.

6. **`PARM_BUDGET = 200` is a whole-job cap** (`:620`). Reset per chunk it becomes
   effectively 800. → Carry `parm_budget_used` in the checkpoint so the cap stays
   honest.

7. **Restart itself fails** (Illustrator will not relaunch). → Decide: how many
   attempts, then hard-fail the job with the already-saved files intact?

### Must not break

8. **792 pt cross-document shift.** `prebuildPatternSizes()` must run while the
   order doc does not exist (`:170-172`, `docs/792PT_COORDINATE_SHIFT.md`). Any
   resume "optimisation" that caches pattern sizes across chunks, or creates the
   order doc earlier, moves every piece 792 pt with nothing in the log.

9. **Name index must be built while its document is active** (`:104-109`). A
   non-active DOM read costs ~125 ms against ~0.02 ms — the historical 257-second
   index build. Re-running the normal startup preserves this; do not "reuse" an index.

10. **Cross-file layout state** — `pmLastFullButtonPanel`, `pmLastSleevePanel`,
    `ribCuffSleeveBySize` are already reset by `startNextOrderDoc()` (`:3889-3891`),
    so they break at file boundaries **today**. A restart at the same boundary adds
    no new loss. Verify, do not assume.

### Housekeeping

11. **Watchdog** (`illustrator_automation.py:1622`) restarts per chunk; the restart
    gap must not read as a stall.
12. **Progress %** must be computed over total production groups, not per chunk,
    or every restart drops the bar back to 50%.
13. **Finalisation must move outside the loop** — `doc.Close(2)`, `_stamp_jpeg_dpi()`,
    `make_archive()` (`:1656-1666`), or each chunk produces a partial zip.
14. **Job cancellation** mid-chunk: the current cancel path knows nothing about a
    chunk loop.
15. **Fonts** need no work — `install_job_fonts` ran pre-job and registered them with
    Windows; each fresh launch reads the list at startup, which is the very reason
    the font case restarts today (`:1262-1266`).

---

## 4. Phases

Each phase is independently verifiable; none of 1–3 changes rendering behaviour.

| # | Phase | Scope | Done when |
|---|---|---|---|
| 0 | **Verify the premise** | none — one test job | ⬜ **OPEN.** A forced restart mid-order demonstrably clears the session-level PARM. If it does not, stop: the rest of this plan is built on it. |
| 1 | Checkpoint write | JSX | ✅ `writeRenderState()` / `markRenderStateDone()`, called only from `startNextOrderDoc` after a successful save+close. |
| 2 | Chunk exit | JSX | ✅ `startNextOrderDoc(reason, resumeGroupIndex, mayStop)` declines to open a new doc at the limit; `if (chunkStop) break;` at both size-boundary call sites; early return before the end-of-order block. |
| 3 | Resume read | JSX | ✅ `resumeState` loaded before the log is opened; counters restored just above the size loop; loop starts at `resumeStart`. |
| 4 | Python outer loop | Python | ✅ `while True:` around `DoJavaScript`, with `_connect_illustrator()` and `_read_render_state()` helpers; `ILLUSTRATOR_FILES_PER_RUN = 2`, `MAX_RENDER_CHUNKS = 40`. |
| 5 | Log + report accumulation | JSX | ✅ log truncates on chunk 1 only; the end-of-order writers are unreachable on a chunk that stops, so they run once with restored arrays. |
| 6 | Finalisation + progress | Python | ✅ finalisation already sat after the call being wrapped; watchdog restarts per chunk; progress carried across via `items_processed`/`total_items`. |

Two bugs found and fixed during implementation, both of which would have shipped
silently:

- **`restart_needed` had to stop being the resume trigger.** If chunk N+1 died
  early it would write no checkpoint, the flag from chunk N would still be set,
  and the loop would re-run the same chunk until `MAX_RENDER_CHUNKS`. Python now
  clears the flag the moment it acts on it, and the JSX decides to resume on
  `next_group_index` instead.
- **The mid-size split must never end a chunk.** `mayStop=false` on the
  canvas-overflow call site: half that size is already placed, so there is no
  clean resume point.

---

## 5. Acceptance criteria

- [ ] A 7-file order runs as 4 chunks with 3 Illustrator restarts, unattended.
- [ ] `debug_log.txt` contains **zero** `PANEL FAILED` lines.
- [ ] `debug_log.txt` contains all 4 chunks, in order, with separators.
- [ ] `order_files.txt` lists all 7 files.
- [ ] JPG file names are unique, gapless per size, and none was overwritten.
- [ ] The zip contains exactly what a hypothetical single-run job would.
- [ ] Total wall-clock is not worse than the 10m22s baseline.
- [ ] No panel is silently shipped incomplete: if a size fails after a fresh
      Illustrator, the job stops and says so.

---

## 6. Open questions

1. **Universal items** — first chunk or last? (edge case 5)
2. **Restart failure policy** — how many relaunch attempts before hard-failing? (edge case 7)
3. **`filesPerRun`** — fixed at 2, or exposed in the production plan so it can be
   tuned per job without a redeploy?

---

## 7. Notes for whoever implements this

- The agent now pulls its JSX from whatever `AGENT_CLOUD_API` points at. In local
  dev that is `http://localhost:8000`, which serves `Backend/scripts/` — so edits go
  live on the next job with no deploy. Pointed at Cloud Run, **every JSX change
  needs a Cloud Run deploy before the agent sees it.**
- `_quit_illustrator()` (`illustrator_automation.py:1124`) already exists and is
  already used by two restart paths. Reuse it; do not write a second one.
- Blanket retry is unsafe and settled: the file's `.duplicate()`, `.translate()`,
  `.resize()` and `.rotate()` calls are all **relative**, so a retry double-applies
  them and silently ships a wrong-sized panel. That is why rollback must succeed
  before any rebuild.
