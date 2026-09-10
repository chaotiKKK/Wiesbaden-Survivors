# Audio-Mediensuche F: — Exportliste
# Ziel: Dateien mit Endscreen- / Musik- / SFX- / Trailer-Relevanz finden
# Format-Ziel: mp3, ogg, wav, m4a, aac, opus, wem
# Nebenordner: Downloads, Music, Videos, Desktop, tmp + game-adjacent Pfade

## Status: ABGESCHLOSSEN — durch lokalen Pipeline-Ersatz hinfällig (2026-09-10)

Die Suche selbst wurde NIE ausgeführt: `F:` ist in dieser Umgebung **nicht
gemountet** (Get-PSDrive listet nur C:). Ein nicht gemountetes Laufwerk ist
ein nicht verfügbarer Scope, kein leerer Datenträger — daraus darf kein
"Drive durchsucht, nichts gefunden"-Ergebnis abgeleitet werden.

Stattdessen hat die Session den Bedarf anders gelöst — ohne externe Dateien:

- **Game-SFX:** `tools/synth-audio.mjs` erzeugt 21 AAC-Cues nach Rollenname
  (BAKE_SLOT-Slots) in `audio/`, geladen von `AudioSys.prefetchAssets()`
  (nur http(s), nach Geste). Manifest-Kontrakt: data-regression 3j.
- **Trailer:** `tools/trailer-audio.mjs` erzeugt BGM-Bett (20 s, A-Moll,
  96 BPM) und deutsche VO via Microsoft Hedda (de-DE, System.Speech) —
  die −91-dB-Platzhalter in `trailer/media/` sind ersetzt.
- **Ursprüngliche Motivation (Endscreen/Musik-Jingles):** weiter abgedeckt
  durch die prozedurale `AudioSys.endCue()`-Kette; lizenzierte Assets
  bleiben der nächste Qualitäts-Schritt, sind aber kein Blocker mehr.

Falls `F:` später gemountet wird und ein echter Lizenz-Fund gelingt,
können die Dateien die Rollennamen in `audio/` direkt ersetzen — der
Manifest-Kontrakt bleibt gleich.
