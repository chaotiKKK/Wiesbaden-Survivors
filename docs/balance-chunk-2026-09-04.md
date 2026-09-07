# BalanceSim chunked (Voll-Simulation ohne Main-Thread-Blockade) — 2026-09-04

## Problem

`BalanceSim.compute(10000)` (devsim: Kompendium → Voll-Simulation) lief
synchron: hier ~50 ms, auf schwachen Geraeten leicht Sekundenbruchteile bis
Sekunden blockierend — ein eingefrorenes Spiel waehrend der Rechnung.

## Change

`compute()` wurde in eine Slice-Maschine zerlegt (derselbe Rechenkern,
Arbeitseinheiten + Zeitbudget), ohne Zahlen zu veraendern:

- `BalanceSim.compute(iters)` — bleibt synchron (Gate/Harness), exakt wie vorher.
- `BalanceSim.computeChunked(iters, onProgress)` — neu: rechnet in Slice-Blocks
  von `SLICE_MS` (10 ms), gibt zwischen den Blocks via `setTimeout(0)` an den
  Event-Loop ab (rAF/Eingaben laufen dazwischen) und meldet onProgress(0..1).
- Phasen: Waffen (Einheit = Waffe, 4 Tierwerte) → Charaktere (Einheit =
  `CHAR_BATCH`=64 Laeufe, **Seed genau einmal pro Charakter**, RNG-Stream laeuft
  ueber Slice-Grenzen kontinuierlich weiter) → Aufsaetze → Bedrohung/Bosse/
  Paarungen.
- `run(iters)` delegiert jetzt an `compute`+`render(data)`; `render(data)` ist
  extrahiert und wird vom UI-Pfad wiederverwendet.
- `meta` gewinnt `{ chunked, slices, maxSliceMs }`; `meta.ms` bleibt die reine
  Rechenzeit (Pausen zaehlen nicht).
- UI (`case 'sim'`): Button zeigt „Simulation läuft … N %“, `_busy`-Guard gegen
  Doppelklick, am Ende Originaltext + Bericht. Nur unter ?devsim erreichbar.

**Warum die Zahlen identisch bleiben:** jede Waffe/jeder Charakter hat einen
isolierten Seed (`weaponSeed`); Slice-Grenzen reseeden nie mitten in einem
Charakter. Die Aufteilung ist damit reine Ausfuehrungsreihenfolge.

## Verified

- `node tools/verify.mjs`: selftest 103/103, Sync-compute 10k gruen (49 ms),
  **neuer Leg „BalanceSim chunked 10k yields“**: 5 Slices, max. Slice 10,7 ms,
  Parity OK (dps-Arrays bitgleich zu sync), Fortschritt 100%. Dazu
  `--disable-background-timer-throttling`-Familie in den Headless-Edge-Flags
  (versteckte Tabs drosseln setTimeout auf ~1 Hz — gleiche Falle wie beim rAF-
  Throttling der Realdeath-Probe).
- `node tools/_simui-probe.mjs` (served ?devsim, echte Button-Clicks): Sim-Zeile
  sichtbar/navigierbar, Klick startet chunked Lauf, Button zeigt live
  Fortschritt, danach Originaltext + Bericht („569.926 Durchläufe in 57 ms“),
  sim idle. rAF-Gap-Messung waehrend des Laufs: max 31,1 ms — Kontrast dazu ein
  erzwungener SYNC-10k-Lauf mit demselben Tracker: 41,8 ms Blockade.
- Backup vor dem Spleiss: `%TEMP%\index.html.pre-balancesim-chunk.bak`.
  Werkzeug war das einmalige, anchor-basierte `tools/_balance-chunk-splice.mjs`
  (schrieb erst nach Eindeutigkeits-Checks) samt Chunk-Snippet; beide sind nach
  vollzogenem Spleiss im Deletion-Pass 2026-09-04 entfernt — der Code unten und
  die Gate-Marker dokumentieren das Einfuegte.

## Limits

- Headless-Messzahlen sind Obergrenzen-inkonservativ (Jitter); das
  Realgeraete-Versprechen gilt konstruktiv: Slice endet bei Budget + hoechstens
  einer Arbeitseinheit (~2 ms selbst auf sehr schwacher Hardware).
- Versteckter Tab (Nutzer wechselt weg): Browser drosselt die setTimeout-Yields
  — der Lauf dauert dann laenger (Rechenzeit unveraendert, korrektes Verhalten).
