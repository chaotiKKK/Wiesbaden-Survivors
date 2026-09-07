# Daily-Run-Seed-Copy (Setup „Zufall“ → „Tages-Seed“) — 2026-09-04

## Finding (recorded in midrun-endrun-playtest-2026-09-03.md, Leg 5)

The pre-run setup screen (scControls → seed row) displayed `SEED Zufall` also
for **TÄGLICHER RUN** — but `Game.startRun()` applies
`this.daily ? this.dailySeed() : (manualSeed || random)`: on a daily run the
seed is **never random**, it is the date-fixed value (`dailySeed()` = hash of
`YYYY-MM-DD`), identical for every player that day and identical to the
„AZ“-number shown in the title/statistics footer. So the setup screen lied to
the player by omission of the one property that defines a daily run.

## Decision + change (copy-only)

Setup seed row now renders, when a daily run is armed (`Game.daily`):

- Value: **`Tages-Seed (fix je Datum)`** — states plainly that the seed is not
  random but pinned to the date (same for everyone today, deterministic per
  date). Wording mirrors the existing „Tages-Streak“/„Heute“-vocabulary of the
  stats screen.
- Normal runs (SPIEL STARTEN / KOOP) keep `Zufall` (still truthful there) and
  typed/„Neuer Seed“ numbers unchanged (manualSeed branch untouched).

No engine, seed logic, or button behavior changed.

## Verified

- `tools/_daily-copy-probe.mjs` (real headless Edge, served copy): normal setup
  → `Zufall`; daily armed → `Tages-Seed (fix je Datum)`; `dailySeed()` = value
  startRun would apply (1161904061 today vs 1161904060 in yesterday's doc —
  hash differs by date, proving date-pinning); manual seed 424242 still shown in
  normal mode. Probe kept in tools/.
- `node tools/verify.mjs`: full gate green — selftest unchanged (copy affects no
  assertion), BalanceSim sync + chunked legs green, new change-set marker
  (`Tages-Seed (fix je Datum)`) present. Exit 0.

## Residual (recorded, not changed — behaviour)

On a daily run the „Neuer Seed“ button still shows and sets `manualSeed`, but
`startRun()` ignores it (`daily ? dailySeed()` wins). Copy-only scope per
mission; if desired, a follow-up could hide/disable the reroll button while
`Game.daily` is armed.

## Follow-up — AZ number now on the controls screen (2026-09-04)

The controls seed row now shows the actual deterministic number: when a daily
run is armed, `#seedVal` reads **`Tages-Seed · AZ <n>`** (e.g. „Tages-Seed · AZ
1161904061“), the exact value `startRun()` applies and the title footer's AZ —
so players can compare/verify today's shared challenge before starting. Normal
runs keep `Zufall`/manual numbers untouched. Copy-only; the verify.mjs marker
and `tools/_daily-copy-probe.mjs` expectation moved with the copy (the probe now
asserts the shown suffix equals `Game.dailySeed()`). Gate green (plain all-green
+ ?qa pass 106/106).

Now also guarded in the selftest itself: `SelfTest._controlsSeedCopy()` (3
assertions) renders the controls screen in each mode and requires `Zufall`
without a manual seed, `Tages-Seed · AZ <n>` (exactly `Game.dailySeed()`) under
a daily run, and the typed number for a manual seed — suite 109 → 112 plain
(106 → 109 under ?qa), all green in real Edge.
