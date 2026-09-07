# Chunked-BalanceSim under CDP CPU throttling — ≤1-frame claim validation (2026-09-04)

Question: does `BalanceSim.computeChunked` really "never block the main thread for
more than one frame even on low-end devices" (AGENTS.md / `SLICE_MS` comment)?
Measured on a real headless Edge surface with **CDP `Emulation.setCPUThrottlingRate`
4× and 6×** (the same mechanism the DevTools performance panel uses), the 10k
Voll-Simulation, with a per-rAF gap tracker and a sync-10k contrast at each rate.

Probe: `tools/_throttle-sim-probe.mjs` (kept as regression; run twice, both green).

## Measured table (run 2 of 2, served copy on 127.0.0.1:8080)

| rate | cal x vs 1× | slices | worst slice ms | chunked max rAF gap | sync max rAF gap | chunked gaps >100 ms |
|---|---|---|---|---|---|---|
| 1×  | —           | 6      | 10.2           | 28.2               | 44.9              | 0 of 41 |
| 4×  | ×4.2        | 18     | 16.5           | 25.2               | 190.9             | 0 of 42 |
| 6×  | ×6.7        | 26     | 20.7           | 29.7               | 281.0             | 0 of 58 |

Run 1 was consistent: worst slice 10.7 / 15.4 / 17.5 ms; chunked max gap 47.4 /
28.6 / 41.3 ms; sync max gap 43.3 / 174.9 / 306.3 ms. Exact parity of the dps
rows with the sync compute at every rate and every run.

## Verdict

**Validated — the design contract holds under throttling:**
- Per-yield contiguous work = `SLICE_MS` budget + one work unit at *every* rate
  (10.2 → 16.5 → 20.7 ms worst slice). The 6× tail is one unit whose wall cost
  scales with CPU slowness (~3.5 ms cpu × ~6.7 ≈ 20 ms) — the code comment
  "endet spaetestens budget + eine Arbeitseinheit" is the accurate contract.
- Yielding engages *harder* when the CPU is slow: slices 6 → 18 → 26 for the
  same 10k (the budget trips sooner in work terms).
- End-to-end worst rAF gap stays ~25–48 ms at every rate (≈ 1.5–3 headless
  cadence ticks); **zero gaps >100 ms** during chunked runs at 4×/6×.
- The sync contrast is the number that matters for a real low-end device: the
  monolithic 10k stall scales linearly with CPU slowness (45 → 191 → 281 ms —
  a one-third-of-a-second frozen main thread at 6×), while the chunked worst
  stall stays essentially flat (~28/25/30 ms) because it hands control back
  between slices no matter how slow the CPU is.

**Not literally validated — the "one frame" phrasing:**
- Headless rAF cadence here is ~20 ms (not 16.7), so a "frame" is a ~20 ms tick
  and a strict <16.7 ms rAF-gap reading is impossible in this environment. The
  rate-1 chunked worst gap (28–47 ms) is ~2 ticks and roughly matches the sync
  10k gap at 1× (~43–45 ms) — at 1× the whole sim is sub-frame relative to the
  tick, so no contrast is measurable there. The comparison only opens at 4×+.
- At 6× the worst *slice* (~17–21 ms) can slightly exceed one real 60 Hz frame
  because of the budget-tail unit; the worst *end-to-end* stall (~30–41 ms) is
  2–2.5 real frames. So the honest claim is: **bounded per-yield work of about
  one frame plus a tail unit, end-to-end stalls of a few frames, never a
  multi-hundred-ms freeze — versus a sync block that scales with CPU slowness.**

## Probe-methodology finding (why a naive run lies)

The first version of the probe measured a ~71–330 ms single gap per chunked run
and a *parity* between chunked and sync stalls under throttle. Root cause was a
probe bug: the chunked promise's `.then()` ran a full **sync** `BalanceSim.compute(10000)`
for the parity check (expression lifted from `tools/verify.mjs`, where no gap
window exists) — so the sync block sat inside the chunked rAF-gap window and
produced exactly one giant gap per run. Fix: parity is computed in a separate
task after the gap window closes (see `runSync()` in the probe). `verify.mjs`
itself is unaffected — it asserts `meta.maxSliceMs < 120` and parity, not rAF gaps.

## Assertions now enforced by the probe (regression value)

- Throttle actually engaged per rate (calibration ratio ≥1.4 — a no-op throttle
  fails loudly instead of silently measuring an unthrottled page).
- Chunked completes with exact parity to sync, slices ≥3 at 4×/6×.
- Worst slice <120 ms (gate parity); no gap >100 ms more than once per run;
  end-to-end chunked max gap <60 ms at every rate (incl. 1×);
  chunked max gap < sync max gap at 4×/6× (the contrast only meaningfully opens
  there; at 1× both are ~2 cadence ticks and the comparison is noise).

No engine or copy change resulted from this pass — the measurement supports the
intended design; nothing was substantiated as a defect. Only the kept probe and
this record were added.
