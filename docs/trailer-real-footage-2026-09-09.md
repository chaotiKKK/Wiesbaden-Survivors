# Trailer aus echtem Gameplay — Bau- und Prüfprotokoll (2026-09-09)

GRADES spec=7 design=5 correctness=8 quality=6; biggest gap: Tonspur ist stumm (Plan liefert nur Platzhalter-Audio)

Erste Fassung des Trailers, die **echtes Spielmaterial** benutzt statt einer
Hand-off-Spezifikation. Anlass: die Notiz „kein nutzbares Video-Toolchain" in
AGENTS.md war veraltet (siehe gleichen Tag) — ffmpeg 9.0.1 ist vorhanden und
end-to-end geprüft.

## Ergebnis

`trailer/out/wiesbaden-survivors-trailer.mp4` — 1280x720, 60 fps, H.264 High@4.1
+ AAC 48 kHz stereo, **20.000 s**, 11,9 MB, `+faststart`. Ungetrackt; bewusst
nicht committet.

## Was „echtes Gameplay" hier heißt

Kein Replay, keine gescriptete Animation. `tools/trailer-capture.mjs` startet den
ausgelieferten Build in headless Edge, lässt die echte rAF-Schleife laufen und
zieht die Bilder per CDP `Page.startScreencast` heraus. Ein In-Page-Autopilot
schreibt **ausschließlich in `Input.keys`** — dieselbe Map, die der reale
`keydown`-Handler beschreibt. Bewegung, Kollision, Spawns, Waffen, Schaden
laufen also durch denselben Code wie bei einem Menschen an der Tastatur.

Belegt durch die Captures selbst: Welle 1 startet mit 3 Gegnern und füllt sich,
Welle 10 zeigt 50 Gegner, Kombo-Zähler, Boss-Leiste, Auftrag und Wetten-Badges.

- Gelieferte Bildrate: **58,4 / 60,0 / 60,0 fps** über 8,97 / 9,96 / 9,97 s.
- Die Frame-Liste (`frames.txt`) trägt die **echten** Zeitabstände, damit die
  Montage in Wall-Clock-Geschwindigkeit läuft und nicht in einer angenommenen.

## Eingriffe — und warum sie legitim sind (weiß-kastig, nicht versteckt)

| Eingriff | Grund |
|---|---|
| `?qa` + `Game.qaGod = true` | Ein Beat darf nicht im Todesbildschirm enden. |
| `Game.qaGo(5)` / `qaGo(10)` | Bosswellen sind in einem begrenzten Live-Lauf nicht erreichbar (AGENTS.md). |
| `#intro` + `#sawfx` entfernt | Studio-Vorspann liegt auf z-index 200 über der Leinwand. **Ohne das war Frame 300 des ersten Versuchs reine Logokarte** — nachgewiesen, nicht vermutet. |
| Sicht-Mods geleert (`nacht`, `stromausfall`, `nebel`) | TIEFE NACHT bzw. NEBELBANK legen eine schwarze Vignette über den Spieler; der dritte Beat war ein dunkler Fleck. Echtes Feature, unbrauchbares Material. |
| `OPT().tutorial = false`, `UI.toast` stumm | Keine Hinweis-Overlays und QA-Toasts im Bild. |
| Seed `20260909` | Reproduzierbarer Lauf. |

## Aufbau (folgt `trailer/trailer.html`)

Die Komposition dort gibt Bett 0–20 s und drei Sprecher-Fenster bei 1,5 / 7 / 14 s
(4 / 5 / 4 s) vor. Der Schnitt übernimmt genau das:

| Zeit | Material | Zeile |
|---|---|---|
| 0–7 | Welle 1, ab Capture-Sekunde 1,5 | WIESBADEN SURVIVORS · ÜBERLEBE DIE WELLEN |
| 7–13 | Welle 5, Boss | BESIEGE DIE BOSSE |
| 13–18 | Welle 10, Boss + 50 Gegner | WIESBADEN BRENNT |
| 18–20 | Endkarte | WIESBADEN SURVIVORS · JETZT SPIELEN |

Die Schnittfenster beginnen bewusst **nach** der Spawn-Flaute (erste Fassung
schnitt bei 0,0 bzw. 2,5 s an und zeigte fast leere Arenen — per Kontaktbogen
geprüft und korrigiert).

## Offener Mangel: die Tonspur ist stumm

`trailer/media/*.mp3` sind Platzhalter. Gemessen: **mean_volume −91,0 dB,
max_volume −91,0 dB** — digitale Stille, genau wie `trailer/README.md` es sagt.
Das Bett ist trotzdem gemuxt, damit das Spurlayout dem Plan entspricht; die
Ausgabedatei misst folgerichtig ebenfalls −91,0 dB. Die Narration trägt deshalb
**visuell** über die Textzeilen in den VO-Fenstern.

Das ist eine Lücke des Plans, nicht des Baus: echtes Voiceover und ein echtes
Musikbett müssten gesourct werden (`/media-use` laut README). Erst dann greift
auch der `data-fx-carve` in `trailer.html` — Stille hat keine Sprachbänder zum
Herausschneiden.

## Reproduzieren

```
node tools/trailer-capture.mjs      # ~45 s, echtes Gameplay -> JPEG-Beats + frames.txt
node tools/trailer-build.mjs        # ~60 s, zwei ffmpeg-Durchgänge -> MP4
```

Beide sind abhängigkeitsfrei (Node >= 22 + System-Edge + ffmpeg auf PATH).

## Was noch fehlt

- Ton (siehe oben) — der größte Mangel.
- Keine Übergänge: harte Schnitte, nur Ein-/Ausblende. Reicht für 20 s, ist aber
  nicht das, was ein Cutter abliefern würde.
- Der Autopilot umkreist die Arenamitte; er spielt korrekt, aber nicht *gut* —
  ein Mensch würde spektakulärere Situationen erzeugen.
- Beide Skripte laufen nicht im Gate (`tools/verify.mjs`); ein Regress im
  Capture-Pfad fällt erst beim nächsten Bau auf.
