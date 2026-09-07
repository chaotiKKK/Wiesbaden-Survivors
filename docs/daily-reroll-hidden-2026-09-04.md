# Neuer-Seed button hidden under daily runs — 2026-09-04

**Finding (previous pass, `docs/daily-seed-copy-2026-09-04.md`):** the controls/setup screen
showed a „Neuer Seed" reroll button even while a daily run was armed, but `startRun()`
applies `this.daily ? this.dailySeed() : (manualSeed || random)` — under a daily run the
manual seed is **ignored**. The button invited a change that could never happen.

**Change (index.html, one render site + handler + selftest):**
1. `renderControls()` seed row: the button is now emitted only when `!Game.daily`
   (`${Game.daily ? '' : '<button ...>Neuer Seed</button>'}`). Under a daily run the row
   shows just `Seed  Tages-Seed · AZ <n>` — no dead control.
2. `'seedReroll'` dispatch: added `if (this.daily) { AudioSys.sfx('err'); break; }`
   double-guard so a stale/re-added button can never mutate `manualSeed` on a daily run.
3. `SelfTest._controlsSeedCopy()` extended from 3 → **5 assertions** (same walk, same
   try/finally state restore): normal shows `Zufall` *and offers the button*; daily shows
   `Tages-Seed · AZ <n>` *and hides the button*; manual seed 424242 shows as a number.

**Verified live (real headless Edge, served copy):**
- New kept probe `tools/_daily-reroll-proof.mjs` — 3/3 PASS through the **real user flow**
  (title → Täglicher Run → controls vs title → controls): normal run renders the button
  (`{"seed":"Zufall","reroll":true}`), daily run hides it (`{"seed":"Tages-Seed · AZ
  1161904061","reroll":false}`), and arming daily + rendering leaves `manualSeed` untouched
  (`{"before":0,"seed":0,"daily":true}`).
- Full gate twice clean: plain `?selftest` **114/114** (112 + 2 new), `?selftest&qa=1`
  **111/111** with branch-switch proof (`pos:[true], plain:0, all:true`), BalanceSim sync +
  chunked legs PASS, exit 0.
- Current-state count references updated in AGENTS.md (109/109 vs 112/112 → 111/111 vs
  114/114, with the new reroll-button clause) and `docs/edge-cdp-playtest-handoff.md`
  (112/112 → 114/114). Older dated docs left as historical records.

**Residual:** `_controlsSeedCopy`'s walk duplicates the external `_daily-copy-probe.mjs`
three-mode walk (probe adds live `dailySeed()` equality + determinism checks); the reroll
hide/render and handler guard live mid-file with the rest of the UI — no engine change, no
new counts parsed by the gate (count-agnostic banner).
