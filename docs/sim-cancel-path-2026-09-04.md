# Cancel path for the chunked Voll-Simulation (2026-09-04)

The 10k Voll-Simulation under `?devsim` previously ran to completion once started
(~0.3 s here, more on slow machines) — a player who launched it by accident had
no way to stop it. Now the running button becomes an Abbrechen affordance
mid-run, and clicking it stops the remaining slices cleanly.

## Change (index.html — BalanceSim + the `sim` dispatch case; no data, no combat)

- **`BalanceSim.cancelChunked()`** sets `_cancelReq`; `computeChunked()` checks it
  at the top of each `step()` — the in-flight slice (≤ `SLICE_MS` + one unit)
  finishes, then the promise **resolves** with `{ cancelled: true, partial: true,
  meta: { iters, slices, workMs, maxSliceMs } }` instead of rejecting: no
  unhandled-rejection risk for UI callers, no hanging chain, no `_assemble`/
  `_lastJson` side effect, and the slice state `S` becomes garbage once settled.
  `_cancelReq` is cleared on the next `computeChunked()` entry, so a stale cancel
  can never kill a later run.
- **UI (`case 'sim'`)**: while `BalanceSim._busy`, the running button (tracked as
  `BalanceSim._runBtn`) shows `Abbrechen (Simulation läuft … <n> %)`; a click
  calls `cancelChunked()`. The other sim button while a run is active keeps the
  err sfx. On a cancelled settle the UI restores the button label and renders
  nothing (no half-report). Completion/cancel/error all funnel through one
  `clean()` that clears `_busy`, `_runBtn`, and the label.
- **`BalanceSim._execCalls`** — per-`_exec` counter, reset at `computeChunked`
  entry; lets probes prove the chain actually stopped (no growth after cancel).

## Verified, not assumed — `tools/_simui-probe.mjs` cancel leg (real clicks)

The probe now (a) runs the existing full-run leg, then (b) throttles the renderer
to 4× via raw CDP `Emulation.setCPUThrottlingRate` (the 10k finishes in ~150 ms
at 1× here — faster than CDP round-trips can click), starts another 10k, clicks
the real button mid-run, and asserts:

- the mid-run affordance text was literally `Abbrechen (Simulation läuft … 10 %)`,
- after the cancel click: `busy` false, button label restored, `_cancelReq` false,
- **no partial report**: simOut length identical before/after (5221 → 5221),
- **chain stopped**: `_execCalls` frozen across a 400 ms quiet window (9 → 9),
- **machinery reusable**: a full 2000 run right after the cancel completes and
  renders a report.

Probe result: **SIM-UI PROBE OK, 12 PASS, 0 FAIL** (twice green). Full gate:
**VERIFY OK** — `SELFTEST 116/116` unchanged (no selftest assertions added; the
cancel is UI/API behavior, guarded by the probe), BalanceSim sync/chunked legs
unchanged, new verify.mjs change-set marker `cancelChunked()` PASS.

## Probe-drift hardening included along the way

The cancel leg exposed two probe-level bugs worth recording:
- **CSS attribute values must be quoted** — `[data-val=10000]` is an *invalid*
  selector (unquoted numeric value); every eval using it threw a SyntaxError and
  the leg silently "missed" for three attempts. Fixed by selecting buttons by
  index within `#simRow` (0 = 2000, 1 = 10000).
- **Tab drift**: one probe run evaluated from the drifted fresh-profile tab
  (`UI is not defined`) — added the same href + engine-readiness guard
  `verify.mjs` uses before any leg runs.
- The old 1× rAF-gap-contrast assertion (`chunked gap < sync gap`) flaked 2 of 3
  runs on this loaded VM and was demoted to an informational note: the throttle
  probe (`tools/_throttle-sim-probe.mjs`) already established that contrast only
  opens at 4×+, where it is asserted rigorously.

Session strays: several early-exit paths in the probes skip their `finally`
cleanup (drift-guard `process.exit`, connect-failure exits); 30 leftover scratch
Edges were found and killed this pass. Flag `H`.
