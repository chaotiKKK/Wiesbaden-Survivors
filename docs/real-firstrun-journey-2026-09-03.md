# Real-time first-run / user-journey playtest — 2026-09-03 (real Edge, real input)

Replaces the earlier preview-surface journey pass (`firstrun-journey-verification-2026-09-03.md`):
this run drove the game through the **real visible surface** in real time — headless Edge
with a live `requestAnimationFrame` (~1000–1200 fps headless), real CDP mouse clicks at
element coordinates (true hit-testing), a fresh profile with a pristine save, served copy
`http://127.0.0.1:8080/index.html?cb=…`.

Tool: `node tools/firstrun-journey-playtest.mjs [baseUrl]` — **31/31 PASS, exit 0, zero page
errors** on the recorded run (wave seed 3648158382; a repeat run also 31/31).

## Journey legs, as actually observed

1. **Cold start / title.** Real first readable state is the title (UI.cur `scTitle`). The
   full-screen studio splash (`#intro`, z-200, covers 1280×720) is present over it and
   consumes the first pointer gesture (audio unlock, by design). Title nav complete
   (SPIEL STARTEN / TÄGLICHER RUN / OPTIONEN / ERFOLGE / KOMPENDIUM / STATISTIKEN /
   SPIELSTAND-CODE / SPEICHERSTAND LÖSCHEN). Footer on the pristine save:
   `Beste geschaffte Welle: 0 · Siege: 0 · Runs: 0 · Kills: 0 · Charaktere 3/23 …`.
2. **Seed cue — long-open visibility question CLOSED.** On the real surface, both the seed
   input (`#seedInput`, 209×33 visible) and the purpose cue (`#seedHelp`, 145×128 visible)
   render visibly under the title's seed row. Earlier passes could only confirm the cue in
   served HTML; this run confirms visible rendering.
3. **Character select.** SPIEL STARTEN (real click) → `scChar` with 23 cards; each card
   shows name/role/stats/ability/start weapon/moveset. Clicking Leonidas marks `.sel` and
   `Game.sel[0] === 'leonidas'`; Bestätigen → controls screen.
4. **Controls / objective screen** (first run): explicit key mapping + speed/difficulty,
   clear primary action `OK · Los geht's ▶` (1494 chars of copy).
5. **Wave 1 in real time.** State `play`, WELLE 1 · 18 s timer counting down in real wall
   time; HUD shows HP/MATERIAL/GEGNER and an FPS readout. Tutorial cue appears
   (option `tutorial` defaults ON) with step 1 *WASD / Sticks — BEWEGUNG · Weiche den
   Feinden aus!* and the first-run objective line *„Ziel: die 4 Gegner in Welle 1
   besiegen, bevor die Zeit abläuft."* + ÜBERSPRINGEN. Left unattended, the cue
   auto-advanced at 3.5 s to step 2 (*ANGRIFFE FEUERN AUTOMATISCH · Dein Arsenal zielt auf
   den nächsten Feind*) — real-time timing works. Real click on ÜBERSPRINGEN hid the hint,
   `_tutI` reset, run continued, and the cue stayed hidden through the rest of wave 1.
   Auto-fire killed enemies with zero input (kills 0 → 12 in wave 1; HP started dropping
   only when enemies closed in).
6. **Mid-run shop via real flow** (T+13 s, wave 1 cleared early by kills): `scShop` with
   6 concrete offers (names + integer prices 19–44), MATERIAL 47 visible, reroll / danger /
   `Nächste Welle ▶` controls — all reached by clicking the real level-up cards first.
7. **Natural defeat.** Run continued through wave 2; died to enemy damage (Schütze) in
   wave 3 at T+65 s with 110 kills and **58 s of real Spielzeit** (the engine-stepped
   “0:00” artifact is gone — this is the first real-time end-screen confirmation).
   End screen: RUN BEENDET, reached wave 3, wave mods, death cause, seed, unlock lines;
   HAUPTMENÜ returned to the title with a persisted footer (`Runs: 1 · Kills: 110 …
   Beste geschaffte Welle: 2 · Waffen 24/42 · Erfolge 1/36`); defeat recorded zero victory
   credit (`bestWave = completed = 2`).

## Defects substantiated this run

1. **Title footer “Charaktere 3/23” contradicts the roster (fresh save).** Real-time check
   on a pristine save: the title (and statistics-style) counter reads `Charaktere 3/23`,
   but the character screen offers **21 of 23** characters unlocked — only Cyborg
   (`lowHpWaves ≥ 5`) and Rockstar (`wavesWon ≥ 1`) carry real `unlock` rules; every other
   char has `unlock: null` and is playable immediately. `Save.data.unlockedChars` starts as
   `['leonidas','sylvia','sebbo']` and only ever grows via those two achievement gates, so
   the counter can read 3/23 while 21 are pickable. A first-time player reading the footer
   will believe only 3 characters exist/are playable. Reproduction: fresh profile → title →
   SPIEL STARTEN (see `tools/_charroster-probe.mjs`, ROSTER dump: total 23, locked 2).
   Product decision needed: either count genuinely available characters or relabel the stat
   (“durch Erfolge freigeschaltet” vs. roster availability). Not changed this pass —
   semantics ambiguity, engine untouched.
2. **FPS counter is on for players by default.** The HUD shows a live FPS chip
   (`… GEGNER 3 994 FPS SEED …` at every HUD read) because `OPT().showFps` defaults to
   `true` in a fresh save. Debug-facing telemetry is visible to a first-time player on
   their first run. Product decision: default `showFps: false` (kept on in dev/`?qa`).
3. **Splash eats the first click for up to ~9.3 s (observation, by design).** `#intro`
   covers the whole viewport at cold start; its dismiss gesture is the first pointerdown,
   so an impatient player clicking SPIEL STARTEN inside the splash window has that click
   consumed (the button never receives it). Standard studio-splash behavior; recorded so
   first-run acceptance criteria account for it.

## Verified working in real time (no defect in scope)
Cold-start title + fresh footer; seed cue visibly rendered; char select/confirm; controls
screen; wave-1 tutorial cue with explicit objective, timed auto-advance, skip via real
click, no reappear; auto-fire combat; wave clear → level-up picker → shop flow; natural
damage death → defeat end screen with real Spielzeit; end-screen stats/mods/cause/seed;
persistence via HAUPTMENÜ; defeat not counted as victory.

## Honest limits
- Headless FPS (~1000+) is an artifact of `--disable-frame-rate-limit` compositor flags;
  real-device pacing is ~60 fps. The engine is dt-based and behaved identically across the
  two full runs, but *feel* on a 60 Hz panel is still a human-play item.
- Shop purchase/fusion and wave-20 victory paths were not exercised this run (victory
  variant already engine-verified in `midrun-endrun-playtest-2026-09-03.md`).
- 1280×720 desktop surface only; touch/mobile was separately verified
  (`touch-controls-mobile-emulation-2026-09-03.md`).
