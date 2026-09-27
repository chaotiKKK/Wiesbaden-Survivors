# Wiesbaden Survivors

Ein Survivors-Spiel im Stil von Brotato, als einzelne HTML5-Canvas-Seite:
prozedurale Pixel-Figuren, Wellen, Bosse, Shops, Koop für zwei und eine PWA-Hülle.
Es läuft komplett im Browser und braucht keinen Server.

**Status:** Die HTML-Fassung ist fertig und wird nur noch gepflegt, sie bekommt
keinen neuen Umfang mehr. Ihr Nachfolger ist ein Neubau in Unreal Engine 5.8
(3D mit echten Assets, nur Windows, Mehrspieler von Anfang an mitgedacht). Siehe
[`docs/ue58-portierungsplan-2026-09-16.md`](docs/ue58-portierungsplan-2026-09-16.md).

## Spielen

- **Live:** **https://chaotikkk.github.io/Wiesbaden-Survivors/**, mit vollem
  Sound (21 SFX-Cues) und offline-fähig: Der Service-Worker legt Hülle und Cues
  im Cache ab. Über das Browser-Menü lässt es sich mit „App installieren“
  installieren.
- **Lokal als Datei:** `index.html` direkt öffnen (`file://`). Das Spiel läuft
  vollständig, der Ton kommt dann aus der eingebauten Offline-Synthese.
- **Lokal mit vollem Ton:** den Ordner über http ausliefern, zum Beispiel mit
  `python -m http.server`. Erst dann lädt `AudioSys.prefetchAssets()` die Cues
  aus `audio/`, und zwar erst nach der ersten echten Nutzergeste.
- **Koop:** Ein Spieler eröffnet einen Raum und nennt dem anderen den
  6-stelligen Code. Die Verbindung selbst ist WebRTC. Nur der Verbindungsaufbau
  läuft über öffentliche MQTT-Broker, und zwar versiegelt: Dort sind weder
  Raumcodes noch IP-Adressen zu lesen. Details stehen in
  [`docs/netseal-coop-signaling-2026-09-27.md`](docs/netseal-coop-signaling-2026-09-27.md).

## Prüfen

Voraussetzungen:

- **Gate:** Node ≥ 22 und Microsoft Edge (der Headless-Browser des Gates).
- **Playwright-Suiten:** Python 3.14,
  `pip install playwright==1.62.0` und `python -m playwright install chromium`.
- **Audio- und Trailer-Werkzeuge:** zusätzlich `ffmpeg` auf dem PATH.

| Befehl | Was es prüft |
|---|---|
| `node tools/verify.mjs` | Das Gate. Enthält statische Marker, die In-Page-Selftests (`?selftest`, `?qa`), die BalanceSim-Parität (10k) und die Beine mit 4- und 6-facher CPU-Drossel. Endet bei Fehlern mit einem Exit-Code ungleich 0; `--no-browser` führt nur die statischen Teile aus. |
| `node tools/data-regression.mjs` | Integrität der Datentabellen und den Kontrakt des Audio-Manifests, in unter 100 ms. |
| `node tools/build-site.mjs` + `node tools/site-smoke.mjs` | Baut die Pages-Seite aus der Allowlist nach `_site/` und prüft, dass nur freigegebene Dateien ausgeliefert werden. |
| `python tools/pw_recon.py` | Die Seite lädt, der Titel und `play` sind erreichbar, und es gibt keine Konsolenfehler. |
| `python tools/pw_walk.py` | Die kritische Schleife: Kaltstart ohne Fehler und ohne Audio vor der Geste, dann Figurenwahl → Lauf → Pause → Beenden → Zusammenfassung → Titel. |
| `python tools/pw_abuse.py` | Das Verhalten bei achtlosen Nutzern: Müll-Seeds, Klickgewitter, Neuladen mitten im Lauf, kaputter Code-Import, Löschen des Spielstands, Bedienung nur per Tastatur. |
| `python tools/pw_vol_probe.py` | Die Lautstärke-Leiter. |
| `python tools/pw_beatsync.py` | Das Beat-Raster. |
| `python tools/pw_danger.py` | Die Gefahrenkurve. |
| `python tools/pw_lufs.py` | Die Lautheit. |
| `python tools/pw_netseal.py` | Koop über den echten öffentlichen Broker, ob Raumcode oder IP mitzulesen sind. |

Hinweis: `pw_walk`, `pw_vol_probe` und `pw_recon` überschreiben die
Screenshots in `docs/pw/`. Wer sie nicht committen will, setzt sie mit
`git checkout -- docs/pw` zurück.

## CI und Deploy

`.github/workflows/ci.yml` läuft bei jedem Pull Request und bei jedem Push auf
`main`:

1. **Gate + Playwright** (Windows, blockierend). Der Job prüft zuerst, dass
   sich der Cache-Stempel in `sw.js` mitbewegt hat, sobald sich `index.html`
   ändert. Danach laufen das Gate, der Bau und Smoke-Test der Seite und alle
   Playwright-Suiten außer `pw_netseal`.
2. **Koop über den öffentlichen Broker** (nicht blockierend). Der Job hängt
   von fremden Brokern ab, deshalb macht ein roter Lauf die CI nicht rot.
3. **Deploy auf GitHub Pages**, nur bei einem Push auf `main` und nur nach
   grünem Job 1. Ausgeliefert wird ausschließlich die Allowlist aus
   `tools/build-site.mjs`: Spiel, `data.js`, Audio, PWA-Dateien und Lizenzen.
   Debug-, Vorschau- und Doku-Seiten sind nicht öffentlich.

Ein Merge nach `main` ist also ein Deploy.

## Regeln beim Ändern

- **Cache-Stempel:** Nach jeder Änderung an `index.html` den Stempel
  `CACHE` in `sw.js` auf `wbns-<sha1 von index.html>` setzen, gerechnet über
  die Datei, wie sie im Arbeitsbaum liegt (`git hash-object` ist *nicht*
  dasselbe). Sonst behalten installierte Spieler das alte Spiel.
- **Reihenfolge der Skripte:** `data.js` muss vor dem Engine-Skript in
  `index.html` geladen werden, und die Tabellen dürfen nicht zusätzlich inline
  stehen. Das Gate prüft beides.
- **Neue öffentliche Dateien** kommen in die Allowlist in
  `tools/build-site.mjs`, sonst fehlen sie auf der Live-Seite.
- **Fremde Assets** kommen mit Quelle und Lizenz in [`CREDITS.md`](CREDITS.md),
  bevor sie ausgeliefert werden.

## Aufbau

- `index.html`: Engine und UI in einer Datei. Die Struktur ist bewusst so, und
  das Gate pinnt sie.
- `data.js`: die reinen Daten-Registrien für Figuren, Waffen, Gegner, Arenen
  und Achievements.
- `audio/`: externe SFX-Cues und `manifest.json`.
- `sw.js`, `manifest.webmanifest`: die PWA-Hülle.
- `tools/`: Gate, Regressionen, Playwright-Suiten (`pw_*.py`, `pw_lib.py`),
  Seitenbau sowie die Audio- und Trailer-Werkzeuge. Dateien mit `_` am Anfang
  sind einmalige Sonden.
- `trailer/`: Gerüst, Medien und Werkzeug für den Trailer.
- `docs/`: datierte Aufzeichnungen pro Durchgang. Eine Übersicht steht in
  [`docs/README.md`](docs/README.md).

## Wo der aktuelle Stand steht

| Frage | Datei |
|---|---|
| Wie arbeitet man in diesem Repo, welche Fallen gibt es? | [`AGENTS.md`](AGENTS.md) |
| Wohin geht das Projekt? | [`docs/ue58-portierungsplan-2026-09-16.md`](docs/ue58-portierungsplan-2026-09-16.md) |
| Was ist offen oder kaputt, was ist als Nächstes sinnvoll? | [`docs/audit-brainstorm-2026-09-27.md`](docs/audit-brainstorm-2026-09-27.md) |
| Woher stammen Figuren, Deko und Schrift? | [`CREDITS.md`](CREDITS.md), [`docs/kaykit-herkunft-lizenz-2026-09-28.md`](docs/kaykit-herkunft-lizenz-2026-09-28.md) |

## Lizenz

Für den Code dieses Projekts ist noch keine Lizenz festgelegt. Bis dahin gilt
das Urheberrecht, Weiterverwendung ist also nicht erlaubt. Die fremden Assets
stehen unter ihren eigenen Lizenzen, siehe [`CREDITS.md`](CREDITS.md). Die
Schrift Chakra Petch steht unter der SIL Open Font License 1.1 (`licenses/`).