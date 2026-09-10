# SFX-Asset-Pfad: End-to-End-Nachweis über http(s) (2026-09-10)

Playtest-Pass: das Repo wurde lokal über http serviert und in headless Edge
real bedient (vertrauenswürdige CDP-Mauseingaben auf dem echten Titel-Button),
um den in `4c48c8d` eingebauten externen SFX-Asset-Pfad so zu prüfen, wie ein
Spieler ihn trifft.

## Ergebnis: 9/9 Checks PASS

| # | Check | Ergebnis |
|---|---|---|
| 1 | 21 `audio/*.m4a` Requests über das Netzwerk nach der Geste (CDP Network-Log) | PASS — exakt 21, keine vor der Geste |
| 2 | Alle Responses 200 | PASS (0 non-200) |
| 3 | MIME `audio/*` | PASS — `audio/mp4` (nach Fix, s. u.) |
| 4 | Bank-Audit: 21/21 Rollen als dekodierter `AudioBuffer` | PASS — Dauern 0.12–1.61 s, samplePath bestätigt |
| 5 | Hörbarer Render (Analyser am Master-Limiter, Peak-Hold über die ganze Hüllkurve) | PASS — Shot 0.367, UI 0.672 von Vollskaie; Ruhig-Baseline exakt 0 |
| 6 | Careless: Reload + erneute Geste | PASS — 21 Fetches erneut (SW-Cache), Cue hörbar (Peak 0.80) |
| 7 | Fail-Variante: ein Cue schlägt fehl → kein Wedge | PASS — `_assetsLoading` settled false, `assetsReady` true bei 20/21 |
| 8 | Fehlgeschlagener Cue nicht als Phantom-Asset in der Bank | PASS — Buffer ist die Offline-Bake (0.145 s = BAKE_SLOT-Länge), nicht das Asset (~0.25 s) |
| 9 | Keine Konsolen-/Exception-Fehler im ganzen Lauf | PASS (0) |

## Defekte gefunden und behoben (alle real beobachtet, nichts Spekulatives)

1. **MIME-Lücke im Harness-Server** (`tools/lib/harness.mjs`): `.m4a` fehlte
   in der MIME-Tabelle → Assets gingen als `application/octet-stream` raus.
   Kein Player-Problem (decodeAudioData rät am Bytestream), aber falsch und
   der erste Stolperstein für jeden anderen Server-Betreuer. Fix: `.m4a`
   → `audio/mp4` (plus `.wav`), per Probe-Lauf verifiziert.
2. **Wedge im Settle-Counter von `AudioSys.prefetchAssets`** (index.html):
   `--pending` stand nur im `catch`; bei teilweise fehlgeschlagenen Loads
   wäre `done()` nie erreicht und `_assetsLoading` für immer true gewesen
   (im Probe-Fail-Lauf: 20 von 21 Cues geladen, aber kein Settle). Fix:
   gemeinsamer `step(good)`-Pfad — jeder Abschluss, Erfolg oder Fehler,
   zielt auf denselben Zähler.
3. **Einmalige Peak-Abtastung untersucht front-loaded Cues falsch**
   (Probe-Bug, kein Produktfehler): 120 ms nach dem Abspielen ist die
   Pistolen-Hüllkurve (exp-Decay) bereits abgeklungen → gemessener Peak 0.
   Korrektur: kontinuierlicher Peak-Hold über die volle Cue-Dauer. Erste
   Messung war der Grund für einen falschen "shot cue silent"-FAIL.

## Serviceworker-Interaktion (beobachtet, nicht geraten)

- Der SW served `audio/*.m4a` beim zweiten Lauf aus dem Cache (21 Reqs beim
  Reload, korrekt fürs PWA; Shell enthält audio/ bewusst nicht, Runtime-Cache
  greift).
- CDP-`Fetch`-Interception sieht SW-ausgeführte Fetches NICHT (Page-Target:
  Pause fired nie; SW-Target: `Fetch.enable` hängt) — und Unregister hilft
  nicht (Seite registriert sw.js bei jedem Load neu, `clients.claim()`).
  Deshalb prüft die Fail-Variante den Fehlerpfad in-page per Fetch-Monkeypatch
  (gleicher `catch`-Zweig wie ein Netzwerkfehler).

## Sauberkeits-Note

Der Throwaway-Probe (`tools/_asset-path-probe.mjs`) wurde nach dem Lauf
gelöscht; nur dieser Bericht bleibt. `sw.js` wurde auf den neuen index-Hash
(`98a5b039…`) neu gestempelt, da index.html den Settle-Fix trägt.
