# Mid-run / end-run playtest — 2026-09-03

Scope: widen the verified first-run journey into the rest of the loop and the meta
surfaces on the served copy (`http://127.0.0.1:8080`), per the approved plan.
Engine untouched; zero code changes this pass. All observations below were made on
the served copy through the live preview surface unless marked otherwise.

## Method caveat (read first)

- `requestAnimationFrame` does not fire in this environment's preview (verified:
  0 callbacks over repeated windows), so real-time play cannot advance on this
  surface. The engine's own shipped selftest drives the identical engine via
  `Game.update(1/60)` steps (`LongRun` assertion: "echte Game.update ueberquert
  mindestens zwei Wellen"), so runs were advanced in small `Game.update(1/60)`
  batches and every UI transition below was observed as a real engine-state
  transition after each batch. This is engine-stepped observation, not real-time
  play.
- Consequence: in-run **Spielzeit stays 0:00** on the end screens — playtime is
  wall-clock based and the clock never advances here. That is a surface artifact,
  not a game defect.
- Persistent save was cleared at pass start (clean slate) and wiped again at pass
  end, so no playtest artifacts (fabricated wave-1 "Sieg", unlock progress)
  remain in the checkout's localStorage.

## Leg results

### Title cold start (clean slate)
Title is the first readable state after a reload; footer shows zeroed stats
(Beste Welle 0, Siege 0, Runs 0, Kills 0). Main nav is explicit
(SPIEL STARTEN / TÄGLICHER RUN / KOOP / ONLINE-KOOP / OPTIONEN / ERFOLGE /
KOMPENDIUM / STATISTIKEN / SPIELSTAND-CODE / SPEICHERSTAND LÖSCHEN). Clear.

### Leg 1 — Mid-run progression (wave 1 → shop → wave 2+)
- Wave 1 auto-fires (HUD: "ANGRIFFE FEUERN AUTOMATISCH"), kills, ends on timer.
- Wave end auto-opens a **level-up picker** (`scLevel`, STUFE 3): 4 offers
  (value, name, one-line desc, tier color), per-offer **VERBANNEN** button with
  a title tooltip ("Entfernt diese Aufwertung für den Rest des Runs"), a
  "Verbannt: 0 Aufwertungen" counter and NEU WÜRFELN (1×/Stufe). Card click takes
  the upgrade. Two queued level-ups (LV1→3) = two sequential pick screens.
- After picks: **shop** (`scShop`) with MATERIAL 33: 6 offers (5 weapons + a
  passive), each with price, tier, stats block and a DPS estimate for Leonidas;
  Arsenal panel (1/6) with VERKAUFEN; stat panel; fusion lab
  ("Zwei Waffen kombinieren — drei Waffen ergeben eine LEGENDÄRE Fusion");
  top actions NEU WÜRFELN (6) / WETTE: HETZJAGD (+50% Material) / GEFAHR ▲ (25
  MAT) / NÄCHSTE WELLE ▶.
- Bought Schraubenschlüssel: material 33→18, arsenal 1→2. NÄCHSTE WELLE ▶ →
  state `play`, WELLE 2 · 20s.
- Wave 3 scaled hard standing still (HP 135→21 while wave 2 cost nothing);
  material 158 by end of wave 3.
- First-time-player reading: the picker and shop are dense but every element is
  labeled with a concrete effect; the loop is understandable after one wave.

### Leg 2 — Tutorial option gate
- **OFF** (options → Tutorial-Hinweise AUS): wave 1 runs with `#tutHint` hidden
  (verified via DOM on two waves). Option persists (Save).
- **ON** (toggled back): wave-1 cue appears again with first step
  "WASD / Sticks — BEWEGUNG · Weiche den Feinden aus!" + ÜBERSPRINGEN; skip
  hides the hint and the run continues. Cue reappears on later runs' wave 1 —
  consistent with the design "per-run wave-1 cue, gated by the option" (this
  settles the earlier first-run-gating handoff: an option gate exists and works;
  a once-per-save marker remains a product decision, not a missing feature).

### Leg 3 — Natural defeat → end screen
- Died to enemy damage in wave 4 (HP 0, state `end`) while AFK at GEFAHR 0 —
  a real damage-driven death, not a quit.
- `scEnd` defeat variant: heading "RUN BEENDET", full run summary (wave reached
  4, danger, arena, max combo 36, kills 110, damage 2.234,4, material 172),
  per-player lines (level 7, taken damage 169,3, healed 25,6, crits 23,
  most-used weapon, arsenal), **Neu freigeschaltet** (Erfolg: Erster Einsatz,
  Waffe Sonic Blaster, Erfolg: Aufräumdienst), wave mods (BLUTMOND ·
  HALBE HEILUNG), death cause (Schütze), seed, feedback loop (ZU LEICHT /
  GENAU RICHTIG / ZU SCHWER / UNFAIR, "Noch keine Rückmeldung abgegeben."),
  NOCHMAL / HAUPTMENÜ.
- HAUPTMENÜ → title footer persisted: Runs 1, Kills 110, Erfolge 2/36,
  Waffen 24/42. Persistence works.

### Leg 5 — Seed determinism (partial, wave-1 scope)
- Typed seed `12345` → setup screen shows SEED 12345 → run: HUD SEED 12345.
- Two runs with the same typed seed reproduced identically on wave 1:
  arena RHEINGAU-TERRASSEN, first spawns walker|swarm|walker|runner|walker,
  HP 135, same feel. Determinism is confirmed at the observable wave-1 level.
  (The selftest additionally asserts "gleicher Seed → 100 identische Werte".)
- Deeper determinism (shop rolls, level-up offers across runs) not asserted;
  recorded as partial by design.

### Leg 4 — Victory end-screen variant (white-box probe)
- Wave 20 is unreachable by natural play in-session; `Game.endRun(true)` was
  invoked directly (reported as white-box, not natural play).
- The victory variant renders correctly: heading "WIESBADEN GERETTET", stat line
  "Erreichte Welle 1 (Sieg)", victory narrative ("Die ROGUE-KI ist besiegt…"),
  unlock line "Erfolg: Wiesbaden gerettet, Charakter Rockstar", same feedback
  loop and NOCHMAL/HAUPTMENÜ skeleton. In real play this screen only appears via
  the wave-20/endless-offer path (`winNow`/`continueEndless`); the wave-1 content
  shown here is a probe artifact. The screen *variant* is what was verified.

### Leg 6 — Meta surfaces
- **Erfolge & Freischaltungen**: 3/36 earned (Erster Einsatz, Aufräumdienst,
  Wiesbaden gerettet), 16 open unlocks listed with concrete conditions
  (e.g., Cyborg: "Überlebe 5 Wellen mit unter 10% HP").
- **Kompendium**: tabs Waffen / Gegner & Bosse / Charaktere / Items & Relikte /
  Runen & Begleiter / Arenas & Wetter / Fusionsrezepte.
- **Statistiken**: aggregate runs, Siegrate 33%, kills, total damage, played
  waves, material, Endlos-Rekord, Beste Welle, Ruhm, Prestige 0/10,
  Meister-Charaktere (Welle 10+) 1/2.
- **Spielstand-Code roundtrip**: export produced `WS1:` + base64 payload
  (2228 chars); SPEICHERSTAND LÖSCHEN (confirm-stubbed) zeroed the title footer
  to 0/0/0/0; re-import of the code fully restored Beste Welle 3, Siege 1,
  Runs 3, Kills 118 through the real screens. Codec works.
- **Daily run**: title → TÄGLICHER RUN → setup shows SEED "Zufall"; once running,
  HUD SEED 1161904060 == `Game.dailySeed()` — the daily seed is deterministic per
  day and applied at run start. Title banner shows the day's seed (AZ …).

### Leg 7 — Selftest
`?selftest` on the served copy: **SELFTEST 98/98 · PASS** with the full
assertion list (RNG determinism, Save roundtrip, Combat, Loop, LongRun across
≥2 waves, Net/MQTT parser, Brotato shop rules, etc.).

## Findings worth a product decision

1. **Dev/balancing controls in the player codex** — **FIXED** (follow-up pass,
   same day): the sim row in `scCodex` is now gated behind a `?devsim` flag.
   Implementation: `SIMS_ENABLED` const (URL `?devsim`), the sim buttons row is
   `hidden` by default in markup (`id="simRow"`), `renderCodex()` toggles its
   visibility and removes/adds the `.nav` class (so keyboard/gamepad navigation
   skips the buttons when disabled), and the `sim`/`simClear`/`simJson` actions
   bail out when disabled. Verified on the served copy: default load — row
   hidden, not in a11y tree, forced click does not run a simulation;
   `?devsim` — row visible, 2000-run simulation runs and renders the report
   (114.648 runs in 33 ms) + JSON export available; `?selftest` still
   98/98 PASS after the change.
2. **Stat label semantics**: FIXED 2026-09-03 (wording-only pass). The defeat
   screen's "Erreichte Welle 4" (wave *reached* — `Game.wave` at run end) is
   now consistent with the account record, relabeled to "Beste geschaffte
   Welle" (wave *completed* — `d.bestWave`, updated on wave-clear only) on the
   title footer, statistics rows, and save-code info. The per-character value
   (reached-wave semantics via `Save.data.mastery`) is labeled "Welle erreicht"
   on the char-select card and "Runs · Welle erreicht" on the statistics
   screen. Achievement copy a_w5/10/15 now reads "Schließe Welle N ab." to
   match their completed-wave key (as a_first already did).
3. **Daily-run seed display**: the setup screen shows SEED "Zufall" for a daily
   run although the run deterministically uses today's seed (visible only in
   the HUD once running). A player checking the setup screen may be misled.

## Verified working (no defect found in the exercised scope)
Wave-clear → level-up (ban/reroll) → shop (buy/sell/advance) rhythm, wave 2+
progression, tutorial option gate, natural-defeat end screen with stats/unlocks,
victory end-screen variant, run persistence, achievements/stats/codex surfaces,
save-code export/wipe/import roundtrip, deterministic daily seed, typed-seed
reproducibility, selftest 98/98.

## Limits of this pass
- Real-time play (movement, dodging) was not exercisable — rAF is throttled in
  this preview; all run legs were engine-stepped and should be replayed by a
  human once for feel confirmation.
- Online coop (`scNet`), local 2-player coop, wave-20 natural victory, and
  Endlos mode were not exercised (need real networking / human-length play).
- Spielzeit displays 0:00 under engine-stepping (wall-clock artifact).
