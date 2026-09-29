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
  aus `audio/`, und zwar erst nach der ersten echten Nutzergeste. Direkt aus dem
  Repo serviert, fragt der Service-Worker immer zuerst beim Server nach, eine
  lokale Kopie ist nach `git pull` also sofort aktuell.
- **Koop:** Ein Spieler eröffnet einen Raum und nennt dem anderen den
  8-stelligen Code (angezeigt als `K7RM 2XQP`). Die Verbindung selbst ist WebRTC. Nur der Verbindungsaufbau
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
| `python tools/pw_coop_run.py` | Ein ganzer Online-Koop-Lauf mit zwei Browsern: Figurenwahl, Welle 1, Level-ups, Shop, Welle 2. Beide müssen dasselbe Spiel sehen (Live-Bilder, HUD, Menüs) und steuern (Bewegung, Wahl, Käufe). Dazu die riskanten Momente: Pause von beiden Seiten, ein Spieler fällt aus und kommt zur nächsten Welle zurück, die Verbindung bricht mitten im Lauf ab, zuerst auf Seiten des Gastes, in einer zweiten Sitzung auf Seiten des Hosts. |

Hinweis: `pw_walk`, `pw_vol_probe` und `pw_recon` überschreiben die
Screenshots in `docs/pw/`. Wer sie nicht committen will, setzt sie mit
`git checkout -- docs/pw` zurück.

## CI und Deploy

`.github/workflows/ci.yml` läuft bei jedem Pull Request und bei jedem Push auf
`main`:

1. **Gate + Playwright** (Windows, blockierend). Hier laufen das Gate, der Bau
   und Smoke-Test der Seite und alle Playwright-Suiten außer `pw_netseal`.
2. **Koop über den öffentlichen Broker** (nicht blockierend). Der Job hängt
   von fremden Brokern ab, deshalb macht ein roter Lauf die CI nicht rot.
3. **Deploy auf GitHub Pages**, nur bei einem Push auf `main` und nur nach
   grünem Job 1. Ausgeliefert wird ausschließlich die Allowlist aus
   `tools/build-site.mjs`: Spiel, `data.js`, Audio, PWA-Dateien und Lizenzen.
   Debug-, Vorschau- und Doku-Seiten sind nicht öffentlich.
4. **Live-Koop nach dem Deploy** (blockierend). Zuerst wartet der Job, bis
   das CDN genau die ausgelieferten Dateien liefert. Dann verbinden sich
   auf der öffentlichen Seite zwei Spieler über Koop, mit dem angezeigten
   Raumcode, und Eingaben und Bild müssen in beide Richtungen ankommen
   (`tools/pw_live_coop.py`).

Ein Merge nach `main` ist also ein Deploy.

Zusätzlich läuft `.github/workflows/live-coop-daily.yml` **jeden Tag um
05:17 UTC** (und auf Knopfdruck unter *Actions*) denselben Live-Koop-Check.
Koop hängt an Dingen, die sich ohne Deploy ändern: öffentliche Broker,
STUN-Server und Browser. Scheitert der Check, öffnet der Workflow ein Issue
mit dem Label `live-coop`. Weitere Fehlschläge kommentieren dasselbe Issue,
und der nächste grüne Lauf schließt es. GitHub schaltet Zeitpläne nach 60
Tagen ohne Aktivität im Repo ab. Dann lassen sie sich unter *Actions* wieder
einschalten.

## Regeln beim Ändern

- **Cache-Stempel:** Von Hand ist nichts zu tun. `tools/build-site.mjs`
  stempelt `CACHE` in der veröffentlichten `sw.js` aus den Bytes aller
  vorgecachten Dateien, die es veröffentlicht: `index.html`, `data.js`,
  Manifest, Icons und Audio. Jede Änderung an einer davon erreicht also
  installierte Spieler. Im Repo bleibt `CACHE = 'wbns-dev'` stehen.
  `tools/site-smoke.mjs` rechnet den Stempel nach.
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

**Alle Rechte vorbehalten.** Das ist eine bewusste Entscheidung vom
2026-09-28, keine vergessene Lizenzdatei. Der Quelltext ist öffentlich
einsehbar, Kopieren, Weitergeben oder Weiterverwenden ist aber nicht erlaubt. Die fremden Assets
stehen unter ihren eigenen Lizenzen, siehe [`CREDITS.md`](CREDITS.md). Die
Schrift Chakra Petch steht unter der SIL Open Font License 1.1 (`licenses/`).