# Throttled 4x/6x gate leg — transport rework + freeze contract (2026-09-04)

Completes `docs/chunked-throttle-validation-2026-09-04.md`: the validated
standalone probe is now a permanent leg of `node tools/verify.mjs`, and the two
flaky failure modes found while wiring it are fixed at the root.

## What the leg asserts (per rate 1 / 4x / 6x)

Same headless Edge as every other leg, `Emulation.setCPUThrottlingRate` (the
DevTools performance-panel mechanism):

| Assertion | Form | Why |
|---|---|---|
| throttle engaged | calibration loop ratio ≥ 1.4x | proves the rate is a no-op NOT happening |
| chunked 10k completes | `slices ≥ 3`, `chunked: true` | the yielding pattern survives throttle |
| worst slice bounded | `maxSliceMs < 60` | **deterministic** guard: a non-yielding sim is one giant slice (~160-240 ms throttled) and fails here; contract = SLICE_MS budget + one indivisible tail work unit, measured worst ~21 ms |
| parity | chunked dps rows == sync compute | slicing is order-independent |
| no SUSTAINED freeze | no rAF gap ≥ 300 ms, < 5 gaps > 100 ms | corroboration that frames kept flowing; see contract below |

## Why wall-time budget, not a CPU-work quota (unchanged verdict)

A CPU/iteration quota fixes *work* per slice, so on a slow device slice *wall
time* grows (fixed quota × slower per-iter) — exactly backwards for frame
blocking. The wall-time budget (SLICE_MS = 10 ms, plus one indivisible tail
work unit per slice) keeps worst-case frame impact bounded on any device; the
tail's wall cost scales with the CPU rate (measured 10.6 → 20.2 ms from 1x to
6x). See the earlier validation doc for the full argument.

## Root-cause fix 1: daemon-routed evals flapped

`?selftest` banner polls went through the long-lived agent-browser daemon and
intermittently landed on stale targets from killed Edge sessions (symptom:
"BalanceSim is not defined" after 25 s on a page that boots fine on the next
leg). Fix: the gate now binds **one raw-CDP WebSocket** to the exact page
target (`/json/list` → `webSocketDebuggerUrl`) and drives every phase through
it; agent-browser is fully out of the gate. Side effect: banner detection
dropped from ~36 s worst-case to 3.6-5.1 s; browser leg ~14-17 s total.

## Root-cause fix 2: the freeze assertion vs. measured noise floor

First wiring failed `o100 === 0` (zero rAF gaps > 100 ms). Population over 9
full-gate runs on this box: 4x max rAF gap ∈ {29.8 … 143.3 ms}; isolated
>100 ms outliers appeared as *pairs* in ~2/9 runs — GC/OS scheduling noise on
a shared Windows box, not the sim (rAF alone cannot tell those apart).

Two changes make the assertion honest:

1. **Contract restated to what rAF gaps can prove**: fail only a *sustained*
   freeze — single gap ≥ 300 ms (frozen page) or ≥ 5 long gaps (chronic
   stutter). ~9x headroom above the noise floor; a blocking sim still fails
   deterministically in the in-page `maxSliceMs < 60` assertion, which is the
   real guard for the regression this leg exists to catch.
2. **setTimeout(0) discriminator**: a parallel ticker records main-thread gaps;
   a rAF gap whose setTimeout twin is equally long = main-thread stall
   (GC/OS), a rAF-only gap = frame-source stall. Both PASS and FAIL messages
   carry top gaps + classification, so failures diagnose themselves.

## Measured (full gate, real headless Edge, 2026-09-04)

- 4 consecutive green runs; calibration ratios 4.3-4.5x / 6.9-7.0x.
- Worst slice: 10.6-10.7 ms (rate 1), 19.7 ms (4x), 20.2 ms (6x) — inside the
  budget+tail contract at every rate.
- rAF gaps: 0 >100 ms outliers in the 4 green runs (max 29.8-98.3 ms); the
  2 outlier runs before the restatement would now PASS with a cause label.
- Gate exits 0; `rc` verified on both a green and a failed run.

## What remains

- Splitting a main-thread outlier into GC vs OS scheduling would need a full
  CDP performance trace; the setTimeout classifier is sufficient for the
  gate's contract, so that trace stays optional.
- The standalone probe `tools/_throttle-sim-probe.mjs` remains for ad-hoc
  runs; the gate leg supersedes it for regression purposes.
