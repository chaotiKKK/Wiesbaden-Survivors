# Welle-20-Balance-Pass (nur ?qa-Panel) — 2026-09-04

## Method

Repeatable pass: `node tools/wave20-balance-pass.mjs` — the WHOLE run is driven
through the real ?qa panel with real clicks: run start → Escape → „→ Welle 20"
→ Gott-Modus → ~55 s real-time observation sampling (every ~2 s) → „Ende:
Niederlage" → „Save zurücksetzen". Save snapshot/restore use the panel buttons
(qaSnap/qaRestore); the probe never touches `Save.data`. In-page reads are
observation only. Two runs (fresh profiles, random seeds) both completed
12/12 PASS, zero page errors.

## Observed facts (two runs)

| | Run A (seed 1272215824) | Run B (seed 3220166943) |
|---|---|---|
| Wave-20 boss | SEBBOS ROGUE-KI (NEROBERG-ARENA) | MARKTKIRCHEN-TURM (INNENSTADT) |
| Boss pool rule | tier-3 pool {SEBBOS, MARKTTURM}, `(seed+20)%2` | same (other member) |
| maxHp (wut) | 27 500 (= 22000 × 1.25) | 33 750 (= 27000 × 1.25) |
| armor (wut) | 27 (= 20 + 3 + 4) | 29 (= 22 + 3 + 4) |
| dmg at spawn | — | **85.0** = 34 × 2.0 × 1.25 (exact) |
| spd at spawn | — | **63** = 40 × 1.24 × 1.28 (exact) |
| late (ÜBERZEIT 2) | dmg 102.2 = 80 × 1.13²; spd 129 | dmg 108.5 = 85 × 1.13²; spd 70 |
| Wellen-Mods | ZEITDRUCK · MATERIALHAGEL | ZEITDRUCK · UMSCHALTUNG |
| Arena-Mod | NEBELBANK | HITZEWELLE |
| Measured player DPS | ≈ 80 (over 46 s) | ≈ 80.7 (over 44 s) |
| Projected TTK vs HP pool | ≈ 5.7 min | ≈ 7 min |
| Overtime started | t ≈ 28.5 s | t ≈ 28.8 s |
| Peak adds on screen | 137 (2 kills total) | 105 (0 kills total) |
| End stats | dmg 3 688, kills 2, runs 1 | dmg 3 566, kills 0, runs 1 |
| End screen | RUN BEENDET, bestWave stays 0 | same |

Both runs: jump-build (level-1 Leonidas, starting weapon) cannot kill the boss
in the wave window — hp only dropped ~1-3 % during the observation; overtime
ramps the boss instead. This is expected (the jump bypasses 19 waves of
progression — a QA artifact, not a balance claim), but the numbers below are
the real tuning spine the window is built around.

## Scaling rules confirmed live (code + observation agree exactly)

- **Wave-20 boss**: `(seed+20)%2` picks from the tier-3 pool; solo danger-0 base
  HP is NOT wave-scaled (`boss ? boss.hp : def.hp * waveScale`), then the
  **WUT variant** (wave ≥ 20) applies: maxHp ×1.25, dmg ×1.25, spd ×1.28,
  armor +4. Armor additionally gets `floor(wave/6) = 3` from `Enemy.spawn`.
- **Enemy speed/damage wave scale**: `spd × (1 + min(.35, wave·.012))` (wave 20:
  ×1.24), `dmg × (1 + wave·.05)` (wave 20: ×2.0). Danger 0 multipliers are 1.0.
- **Wave window**: `clamp(18 + 20·.8, 18, 35)` = **34 s** (×0.8 = 27.2 s under
  ZEITDRUCK — matches the observed overtime start ≈ 28 s after the announce).
- **ÜBERZEIT**: when the timer expires with the boss alive, every 12 s the level
  rises (cap 10): boss **dmg ×1.13, spd ×1.05** per level (compounding on the
  current value — observed ×1.13² / ×1.05² at level 2 exactly), casts speed up,
  and from level 3 a global Störfeuer ticks the player. Banner: „DER BOSS
  DREHT AUF".

## Tuning implications (facts, not fixes)

1. A solo danger-0 wave-20 boss carries **27.5 k / 33.75 k HP at armor 27/29**
   and must fall inside a 34 s window → an in-window kill needs roughly
   **810-990 sustained effective DPS** (before armor), i.e. ≈ 10-12× the
   level-1 starter DPS we measured (~80) — the jump is unkillable by design.
2. The adds at wave 20 are equally unforgiving for underleveled builds: regular
   enemies scale `×1.20^(wave−1)` ≈ **×26.6 base HP**; a level-1 build lands
   0-2 kills in 44 s and lets the screen fill past 100+ adds — the overtimed
   boss + add wall is the designed „you are not supposed to be here" state.
3. bestWave stays 0 after a forfeit endRun (the wave was never cleared) — wave
   progress is only credited on clear, consistent with the stat semantics.

## Limits

- Jump-build numbers are NOT a real wave-20 build comparison; true in-window
  TTK for a progressed build needs a natural playthrough or the devsim
  BalanceSim (excluded by mission: panel only). The pass pins the *targets*
  (HP/armor/window/ramp), not the player side.
- Bullet pressure is `EnemyBullets.active` (Pool API); peaked at 64 live
  enemy bullets in run B.
- Both runs rolled ZEITDRUCK (coincidence), so the 34 s base window was never
  observed unmodified; the −20 % effect is confirmed by the overtime timing.
