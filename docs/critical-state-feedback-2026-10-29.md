# Kritisch-Zustand: Vignette, Trefferrichtung, Herzschlag (2026-10-29)

GRADES spec=7 design=5 correctness=6 quality=7; biggest gap: die Wirkung ist
hier nicht am Bild geprüft — auf dieser Maschine fehlen die Systembibliotheken
für Chromium (`libnspr4` u. a., kein root, kein Paketindex), also liefen nur die
statischen Beine und die Datentests.

## Was dieser Durchgang ändert

Ziel war kein Umbau, sondern eine zusammenhaengende Praesentationsschicht fuer
den gefaehrlichsten Moment des Spiels: **unter 30 % Leben**. Bisher sagte das
HUD nur ueber die Laenge eines Balkens Bescheid; jetzt tragen drei Kanaele
dieselbe Aussage.

| Kanal | Wo | Verhalten |
| --- | --- | --- |
| Bild | `Game.drawCritFx` | Rote Randvignette, geglaettet ueber `Game.critVis`, atmet mit dem Herzschlag-Takt. Nur der Rand faerbt sich; die Mitte bleibt lesbar. |
| Bild | `Game.drawCritFx` | Treffer-Aufblitz als Rahmen plus **Richtungsbogen** am Bildrand: `Game.hurtDir` kommt aus `h.srcAngle` in `Combat.applyPlayerHit`. Die Kamera ist nicht gedreht, der Weltwinkel ist also der Bildwinkel. |
| HUD | `UI._updateHudBox` | `.bar.hp.crit` ab unter 25 %: roter Rahmen, kraeftigerer Verlauf, ruhiges Atmen (`critPulse`), das bei `body.reduced-motion` steht statt zu blinken. |
| Ton | `AudioSys.heartbeat` | Lub-dub aus zwei Sinus-Stoessen auf dem SFX-Bus; Tempo 1,25 s → 0,55 s mit der Schwere. Wird in `Game.update` geplant, nicht pro Bild erzeugt. |
| Gefuehl | `Combat.applyPlayerHit` | Impact-Halt 30–90 ms, gestaffelt nach Schadensanteil und bewusst kuerzer als der Boss-Hitstop (150 ms), damit ein Kratzer nicht wie ein Boss-Kill wirkt. |

Abschaltbar ueber die neue Option **`critFx`** („Kritisch-Effekte (Vignette &
Herzschlag)", Standard an). Alte Spielstaende kennen den Schluessel nicht; die
Abfragen sind `!== false`, also bleibt der Effekt fuer sie aktiv, ohne Migration.

## Kosten

- Der Verlauf wird je Fenstergroesse **einmal** gebaut (`Game._vig`, Schluessel
  `W×H`) und dann nur noch mit einem `fillRect` gezeichnet — kein Gradient pro
  Bild, keine neuen Partikel.
- Bei `Game.quality() < 1` (Grafik-Preset „Niedrig") zeichnet die Schicht
  nichts; sie ist damit auf dem Mobilprofil kostenlos.

## Bewusst nicht enthalten

- **Kein Mastering am Musikbett.** Der gemessene Ist-Stand aus
  `docs/lufs-harness-2026-09-11.md` liegt bei −19,8 LUFS, also ~3,8 LU unter dem
  Zielband. Eine Anhebung waere eine Mischungs-Entscheidung und braucht die
  Messung im Browser (`AudioSys.audioConformance`) — hier nicht messbar, also
  nicht angefasst. Das bleibt der naechste echte Klanggewinn.
- Keine Aenderung an Balance, Spawnplan oder Wirtschaft; der Balance-Pfad ist
  nicht beruehrt (`node tools/data-regression.mjs` 22/22, Balance-Paritaet
  unberuehrt).

## Pruefungen, die tatsaechlich liefen

- `node -e` Syntaxpruefung beider Inline-`<script>`-Bloecke nach dem Edit: OK.
- `node tools/data-regression.mjs`: 22/22 PASS.
- `node tools/verify.mjs --no-browser`: VERIFY OK, inklusive der zwei neuen
  Gate-Pins (`drawCritFx(ctx)`, `heartbeat(sev)`).

## Was noch fehlt (ehrlich)

- Ein Bild- und Hoertest auf einer Maschine mit lauffaehigem Browser: Vignette
  bei 25 %, 10 % und 3 % Leben, Richtungsbogen bei Treffern aus vier
  Himmelsrichtungen, Herzschlag-Tempo, und `?selftest` (das Gate pinnt die
  Marker, nicht das Verhalten).
- `tools/_polish-probe.py` ist dafuer vorbereitet (LUFS-Bericht + drei
  Screenshots: Kampf, kritisch, Boss) und laeuft, sobald Playwright-Chromium
  startfaehig ist.
