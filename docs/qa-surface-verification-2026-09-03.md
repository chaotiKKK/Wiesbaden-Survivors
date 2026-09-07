# QA-Oberfläche (?qa) — Implementation + Verification (2026-09-03)

Surface: served copy on 127.0.0.1:8080, live-driven via CDP/Edge with `?qa=1`; regression via `node tools/verify.mjs`.

## What was added (index.html, +124/−16 vs. the documented baseline)

A QA panel on the pause screen (scPause), gated behind a new `QA_ENABLED` const
(URL `?qa`), independent of the existing `?devsim` sim gate:

- **Wellensprung**: preset buttons Welle 1/5/10/15/20/30 + numeric input + "→ Welle"
  (`qaWave`/`qaWaveGo` → `Game.qaGo(n)`). `qaGo` requires an active run, clamps
  1–999, and sets `endless = true` only when `n > 20` (the one case `startWave`'
  own gate would otherwise divert to the endless offer), then calls the real
  `startWave(n)` (full wave setup incl. wager/contract/arena-mod/spawn plan).
- **Wellen-Mods**: one chip per `MODS` entry rendered into `#qaMods`
  (`renderQaMods`), live membership in `Game.mods`; chip shows `✓` + mod color
  when active. Clicking calls `qaModToggle(id)` (add/remove), then re-renders
  chips + `UI.renderHud()`. Reads the run's actual rolled mods on pause-open.
- **Gott-Modus / HP**: `qaGod` toggle (`Game.qaGod`) — on activation it also
  full-heals/revives; while on, `Player.damage()` returns early and
  `Player.down()` cannot kill (hp floors at 1). `qaHeal` (full heal + revive),
  `qaHp` (numeric input sets hp 0–99999 on all players).
- **Run-Ende**: `qaEnd` win/lose buttons → the real `Game.endRun(true|false)`.

Gate discipline mirrors the sim row: `qaRow` is `hidden` in markup, `syncQaRow()`
(called from `UI.show` for scPause) hides it + strips `.nav` from its 12 buttons
when the flag is off, `renderQaMods` builds no chips when off, and every action
case double-guards with `if (!QA_ENABLED) { err; break; }`.
`tools/verify.mjs` marker list extended (QA_ENABLED / id="qaRow" / godmode guard).

## Verified live (real clicks, no engine stepping)

- `?qa` on: pause shows the panel with 9 chips reflecting the run's 2 rolled mods
  (elite_doppel, halbe_heilung). Flag off / plain load: row `hidden`, 12 buttons
  in DOM but **0** in the nav ring, 0 chips built.
- Welle-15 button → `Game.wave === 15`, state `play` (pause auto-closed by startWave).
- God toggle → `damage(99999)` leaves hp at 135 (max); toggle off → same hit
  kills (alive=false, hp 0). Guard is directional, i.e. real.
- Mod chip zeitdruck → `modActive('zeitdruck')` true, chip ✓ + colored; second
  click removes it.
- HP input 4321 → player hp 4321; Voll heilen revives a dead player to full.
- qaEnd lose → state `end`, scEnd visible, `_endWon === false`; qaEnd win →
  `_endWon === true`.
- Save left clean (0/0/0) — probe snapshotted `Save.data` and restored it;
  endRun writes the persistent save by design.
- `node tools/verify.mjs`: all legs PASS incl. `?selftest` 98/98 + 10k BalanceSim
  (53 ms); exit 0. Git flag `H`.

## Known boundaries (by design)

- `endRun` (both buttons) writes the real persistent save (wins/stats/mastery/
  glory) — QA tool, so snapshot/restore when probing.
- `qaGo` abandons the current wave and skips its rewards; the jump consumes the
  real RNG for wager/contract/arena-mod rolls.
- Godmode protects players only (single funnel `Player.damage`/`down`); enemies
  and hazards still run. Chip styling uses inline colors, matching the sim-row
  pattern; no theme-system changes.

## Re-verified 2026-09-04 (post several nav/selftest/sim passes — no code change needed)

Mission re-issued ("?qa exposing startWave(n), godmode, one-click endRun"); the
surface already delivered all three, so this pass re-ran it live instead of
rebuilding: `tools/_qa-live-probe.mjs` (kept) — real menu clicks start a run,
Escape pauses, then only the panel's real buttons do deep work:

- Pause → QA panel visible, its buttons in the nav ring (keyboard-reachable).
- Godmode click → `Gott-Modus: AN`; `damage(99999)` on wave 20 leaves hp at 135.
- `#qaWaveIn` = 20 → real click "→ Welle" → `Game.wave === 20`, state `play`
  (no `qaGo`/`startWave` eval — pure panel input).
- "Ende: Niederlage" click → real end screen (RUN BEENDET, wave 20),
  `_endWon === false`; save written (runs 0→1) then snapshot-restored.
- 13/13 PASS, zero page errors; no index.html change this pass.

Flow a balance pass uses today: start run (3 real clicks) → Escape → Welle 20 /
Gott → observe → Ende — no white-box engine calls anywhere.
