# Balance-Parity async guard in the selftest (2026-09-04)

The chunked-BalanceSim parity was previously asserted only by the browser gate
(`tools/verify.mjs` chunked leg, which drives a 10k computeChunked + sync diff in
headless Edge). A plain `?selftest` never exercised the async path. Now the suite
itself ends with an async group so the split is regression-guarded anywhere the
selftest runs.

## Change (index.html, selftest only — no engine, no sim code touched)

- `SelfTest._asyncPending: 0` — the suite now knows when async groups are open.
- New group `SelfTest._balanceParity()`, registered last in `run()`:
  - sync `BalanceSim.compute(2000)` for the reference dps key,
  - then `BalanceSim.computeChunked(2000, null)` (the real yielding path),
    asserting (1) the chunked run resolves with `iters === 2000` and rows, with
    slices/max-slice in the row text, and (2) the chunked dps rows equal the sync
    rows **exactly** (`String(dps)` joins).
  - 8 s guard: if the promise can't resolve in time (pathological timer
    throttling) it records one FAIL and terminates the suite instead of hanging.
- `run()` renders the banner only when `_asyncPending === 0` — the async group
  renders on completion. Without this, the gate's banner poll could accept the
  sync-only state (first all-green `SELFTEST n/n`) before the async rows land,
  silently un-guarding the path under the very gate meant to check it.
- 2000 iters was chosen deliberately: ~1-2 budget slices on any machine (10k
  would add ~50 ms and is already covered by the gate's chunked leg). The guard
  asserts **parity**, not slice count — a fast machine may finish 2000 iters in
  one slice and `meta.chunked` would be false there, so that flag is deliberately
  not part of the pass condition (row text still shows slices/max for eyeballing).

## Verified, not assumed

- Full gate in real headless Edge: plain **`SELFTEST 116/116`** (114 + 2) — the
  poll landed directly on 116/116, proving no sync-only intermediate was ever
  acceptable; `?selftest&qa=1` pass **113/113** with the QA-Nav branch-switch
  proof intact; BalanceSim sync (39 ms) + chunked 10k (4 slices, max 10.7 ms,
  parity OK) legs unchanged; new verify.mjs change-set marker `_balanceParity()`
  PASS; exit 0.
- Live per-row proof on the served copy (temp CDP probe, deleted): both rows ran
  in-page and passed — `computeChunked(2000) async fertig (2 Slice(s), max 10.1 ms)`
  and exact parity — suite 116/116.
- Stale count references updated in AGENTS.md and the handoff doc (114/114 →
  116/116, 111/111 → 113/113). No stray Edge processes; flag `H`.

Residual (unchanged by design): the *yielding* contract (slices ≥2, bounded
slice, no >100 ms stall) is still asserted only at 10k by the gate + the
throttle probe (`tools/_throttle-sim-probe.mjs`) — the in-page guard's job is
parity of the async path, and 2000 iters cannot reliably force a yield boundary
on every machine.
