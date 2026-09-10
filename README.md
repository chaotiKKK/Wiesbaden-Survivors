# Wiesbaden Survivors

Ein Brotato-artiges Survivors-Spiel als einzelne HTML5-Canvas-Seite — prozedurale
Pixel-Figuren, Wellen-Gameplay, Bosse, Coop-Shops, PWA-Shell. Alles läuft lokal
im Browser, kein Server nötig.

## Spielen

- **Am einfachsten:** `index.html` direkt öffnen (file://). Läuft komplett;
  Game-Audio nutzt dabei die eingebaute Offline-Synthese-Bake.
- **Voll-Audio (empfohlen):** über http(s) serven (z. B.
  `python -m http.server` oder jeder statische Server). Dann lädt
  `AudioSys.prefetchAssets()` die 21 externen SFX-Cues aus `audio/`.

## Werkzeugkette (Node >= 18, ffmpeg auf PATH)

| Befehl | Zweck |
|---|---|
| `node tools/verify.mjs` | Voller Gate: In-Page-Selftests, QA-Nav, BalanceSim-Parität, 4x/6x-Throttle, rAF-Responsiveness (headless Edge) |
| `node tools/data-regression.mjs` | Daten-Tabellen-Integrität + Audio-Manifest-Kontrakt, <100 ms |
| `node tools/synth-audio.mjs` | Erzeugt `audio/*.m4a` (21 Rollen, AAC, −16 LUFS) |
| `node tools/trailer-audio.mjs` | Erzeugt Trailer-BGM + deutsche TTS-VO nach `trailer/media/` |
| `node tools/trailer-capture.mjs` + `node tools/trailer-build.mjs` | 20-s-Gameplay-Trailer mit geduckter Narration bauen |

## Layout

- `index.html` — Engine + UI (bewusst eine Datei; Gate pinnt die Struktur)
- `data.js` — reine Daten-Registrien (Chars/Waffen/Gegner/Arenen/Achievements)
- `audio/` — externe SFX-Cues + `manifest.json` (Kontrakt: Rollen ⊆ BAKE_SLOT)
- `trailer/` — HyperFrames-Audio-Gerüst, Media, Capture-/Build-Werkzeug
- `docs/` — datierte Per-Pass-Aufzeichnungen
- `tools/` — Gate, Regressionen, Synthese-, Trailer- und Playtest-Werkzeug
