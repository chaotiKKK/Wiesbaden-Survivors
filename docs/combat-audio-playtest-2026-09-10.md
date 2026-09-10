# Combat-Audio-Kette in natürlichem Spiel: End-to-End-Nachweis (2026-09-10)

Playtest-Pass: echter Run über die echte UI gestartet (Titel → Charakterwahl →
Bestätigen → Steuerungs-OK, trusted CDP-Klicks + Pfeiltasten-Input) und
natürlicher Kampf gefahren (Auto-Feuer ist Brotato-Regel), um die
positionsabhängige Audio-Kette so zu prüfen, wie ein Spieler sie hört.
Werfer: `tools/_combat-audio-probe.mjs` (throwaway, nach dem Pass gelöscht).

## Ergebnis: 17/17 Checks PASS

| # | Check | Ergebnis |
|---|---|---|
| 1–3 | Run-Start über echte UI (Titel → scChar → scControls → play) | PASS (dreistufiger Flow bestätigt) |
| 4 | Natürlicher Kampf hörbar nicht-stumm (Analyser am Master-Limiter, Peak 0.75) | PASS |
| 5 | Sample-Cues wirklich gespielt in natürlichem Spiel (67 Cues) | PASS |
| 6 | Jeder Cue trägt in-range mul/pan | PASS |
| 7 | Gepannte Cues matchen ihre sfxAt-Geometrie: pan = clamp(dx/615, ±.75), 20 geprüft, 0 daneben | PASS |
| 8 | Linke Phase: Stereo-Energie sitzt auf der Cue-Seite (19L/3R Cues → L-Dominanz 87:24 Ticks) | PASS |
| 9 | Rechte Phase: dito (1L/7R → R-Dominanz 15:89) | PASS |
| 10 | Verschiebt die Handlung nach rechts, wandert die Energie mit (Delta +137 Ticks) | PASS |
| 11 | Positions-Cues mit echtem Stereo-Offset in natürlichem Spiel (30) | PASS |
| 12–14 | Distanzdämpfung monoton über drei Bands: mul 0.99 → 0.90 → 0.66 (far < 0.1 / 0.1–0.3 / > 0.3) | PASS |
| 15 | Frames laufen unter Audio+Kampf-Last weiter (schlechteste rAF-Lücke 32.5 ms) | PASS |
| 16 | Careless-Reload mitten im Kampf: Audio wartet auf neue Geste | PASS |
| 17 | Null Konsolen-/Exceptions über den ganzen Lauf | PASS |

Voice-Budget unter Last: 3 aktive Stimmen gegen 80 Cap; 67 Cues verteilt auf
11 Rollen (kill 13, shard 13, hit 12, w_loeschwasser 12, e_spawn 7, …) —
Koaleszenz/Coalescing griff sichtbar (nicht jede Cue-Geometrie produziert
eine eigene Stimme).

## Messlehren (Probe-seitig, nicht Engine-Bugs)

1. **Panz-Erwartung:** `Game.player` existiert nicht — es ist `Game.players[0]`.
2. **Stereo-Dominanz tickweise messen:** der zentrierte Musik-Bett-Kanal setzt
   in JEDEM Tick beide Kanäle gleich; nur per-Tick-Dominanz (Tick-L > 1.15·Tick-R
   usw., Stille-Ticks ignoriert) trennt Cue-Seite von Musik. Ganz-Phasen-Maxima
   sind wertlos für die Richtungsbehauptung.
3. **Natürliches Spiel erzeugt fast keine fernen Quellen:** Auto-Feuer tötet aus
   der Nähe; erster Lauf: 39 Near / 0 Far. Der Rückzugs-Phase (weg vom
   nächsten Gegner laufen) hat das ferne Band gefüllt (4 Cues, mul 0.66).
4. **`playBaked`-Spy muss normalisieren** wie die Engine (`_sMul != null ? _sMul : 1`),
   sonst crasht `.toFixed` auf null bei direkten sfx()-Cues.
5. **Der Run-Start hat drei Screens** — charConfirm führt NICHT direkt zu
   startRun(), sondern über scControls. Auf kurzen Viewports ist Bestätigen
   unter dem Fold: scrollIntoView + Klick wie ein echter Spieler.

## Offen für den nächsten Pass

- Positions-Kette vollständig bewiesen; was fehlt, ist Feintuning-Qualität:
  Pan-Kurve ist linear in dx (kein Equal-Power), und die Distanz-Lowpass-
  Fahnengrenze („scharfer Knall verschwindet zuerst") ist nur hörbar, nicht
  spektral gemessen.
- SFX sind kompetente synthetisierte Cues, kein gemasterter Mix; Hedda ist
  Maschinen-TTS.

## Fazit

Kein einziger Engine-Defekt in der positionsabhängigen Kette: Geometrie-Formel,
Pan-Seite, Dämpfungskurve, Voice-Budget und Frame-Rate hielten natürlichem
Kampf stand. Alle Fixes dieses Passes lagen im Probe-Code (gelöscht);
index.html blieb unangetastet — sw.js-Stamp unverändert korrekt.
