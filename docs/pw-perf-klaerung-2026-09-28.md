# pw_perf: warum die 6x-Beine rot sind (2026-09-28)

GRADES spec=7 design=5 correctness=7 quality=7; biggest gap: nur auf einem Rechner und in einem Browser (headless Chromium, Software-Rendering) gemessen; ob ein echtes schwaches Gerät mit GPU das Problem überhaupt hat, ist ungeprüft.

## Befund

`python tools/pw_perf.py` bestand auf dem Stand von PR #5 (05f38cf) **31 von
34** Prüfungen. Alle drei Fehler liegen in den CPU-gedrosselten Beinen:

| Prüfung | Wert | Grenze |
|---|---|---|
| low-end 4x: kein rAF-Freeze | raf=83, stale=False | raf ≥ 100 |
| low-end 6x: kein rAF-Freeze | raf=49, stale=True | kein Slot > 250 ms ohne Frame |
| low-end 6x: kein harter Stall | max 300 ms, p50 233 ms | max ≤ 250 ms |

Die Beine ohne Drossel sind alle grün: Welle 25, 40 und 60 im God-Modus sowie
das autonome Kampfbein laufen mit einem Median von 16,7 ms pro Frame.

## Ursache, gemessen

Eine eigene Sonde, in einem Temp-Verzeichnis außerhalb des Repos, lief mit
derselben Last: Welle 25 im God-Modus, etwa 50–60 Gegner, Canvas 1280×720 bei
DPR 1. Pro Bein wurde 6 s gemessen. `Prof.cpu` ist die Arbeit der Spielschleife
pro Frame (Update, Audio, Render-Aufrufe). LoAF bedeutet Long Animation Frames,
also Frames über 50 ms, aufgeteilt in Skript- und Render-Phase.

| Bein | Frame p50 / max | Prof.cpu Mittel / max | LoAF gesamt: Skript / Render |
|---|---|---|---|
| 1x | 16,7 / 33,4 ms | 3,2 / 7,4 ms | keine Frames über 50 ms |
| 6x | 150–217 / 250–367 ms | 28–43 / 56–77 ms | 103–216 / 177–1058 ms |
| 6x mit Watchdog-Ticker | 183 / 267 ms | 36 / 58 ms | 130 / 583 ms |
| **6x, `Game.render` abgeschaltet** | **16,7 / 83 ms** | **9,6 / 26 ms** | 47 / 21 ms |
| 1x, `Game.render` abgeschaltet | 16,7 / 16,8 ms | 1,2 / 3,5 ms | keine Frames über 50 ms |

Was daraus folgt:

1. **Die Simulation ist nicht das Problem.** Ohne Zeichnen hält sie auch bei
   6-facher Drossel 60 fps.
2. **Das Zeichnen ist es, und zwar überwiegend außerhalb von
   `Game.render`.** Chromium zeichnet Canvas-2D-Befehle zunächst nur auf und
   rastert sie erst in der Paint-Phase. Ohne GPU geschieht das in Software auf
   dem Main-Thread. Deshalb fällt die meiste Zeit in die Render-Phase der
   LoAF-Einträge und fehlt in `Prof.cpu`. Ungedrosselt kostet das Rastern
   etwa das Vier- bis Fünffache der Spiellogik. Bei 1x reicht es trotzdem
   knapp für 60 fps.
3. **Die Messung belastet selbst.** Der `setTimeout(0)`-Ticker des Watchdogs
   macht bei 6x die Frames um etwa 20 % langsamer.
4. **Die Grenzwerte liegen im Rauschen.** Vier 6x-Durchläufe ohne Watchdog
   ergaben einen Median von 150, 150, 200 und 217 ms. Die Grenze von 250 ms für das Maximum
   liegt mitten in dieser Streuung. Das Bein ist also von Natur aus wackelig
   und kein stabiler Detektor. Bei 4x verlangt `raf ≥ 100` in etwa 9 s
   mindestens 11 fps. Gemessen wurden 9–12 fps bei `stale=False`, die Frames
   fließen also. Hier ist die Schwelle zu knapp, es friert nichts ein.

## Einordnung

- **Kein Freeze und kein Fehler in der Spiellogik.** `autoQuality` greift
  (0,55), die Simulation bleibt live, und nach dem Aufheben der Drossel kehrt
  die Seite sofort zu 16,7 ms zurück. Alles davon ist grün.
- **Die Kombination ist unrealistisch.** Die CPU-Drossel bildet keine GPU
  nach. Software-Rastern mal sechs ist schlechter als ein echtes schwaches
  Gerät, das Canvas fast immer über die GPU zeichnet.
- **Ein echter Hebel wäre vorhanden,** falls es je darauf ankommt:
  `autoQuality` verringert Effekte, aber nicht die Auflösung des Canvas. Eine
  niedrigere Backing-Auflösung bei `autoQ` < 1 würde genau die Raster-Kosten
  senken. Da die HTML-Fassung abgelöst ist (UE-5.8-Plan), lohnt das nur, wenn
  schwache Geräte ohne GPU tatsächlich Zielgruppe sind.

## Empfehlung, noch nicht umgesetzt

`pw_perf` bleibt **außerhalb der CI**. Wer es grün haben will, ohne es
aufzuweichen:

1. In den gedrosselten Beinen **Stalls nach Ursache beurteilen**. Rot nur,
   wenn die Arbeit der Spielschleife (`Prof.cpu` max) oder die Skript-Phase
   der LoAF-Einträge das Budget sprengt. Die rohe Frame-Zeit bleibt als
   Info-Zeile erhalten.
2. Die **Freeze-Erkennung an der Drossel skalieren**, also „250 ms ohne Frame“
   nur bei 1x. Die 4x-Schwelle `raf ≥ 100` an die gemessenen 9–12 fps
   anpassen, oder als Kriterium nur `stale=False` verwenden.
3. Oder die gedrosselten Beine mit GPU-Rasterung fahren (SwiftShader bzw.
   `--enable-gpu-rasterization`) und so näher an echte Geräte kommen.

Ohne einen dieser Schritte ist ein rotes 6x-Bein **kein Regressionssignal**.