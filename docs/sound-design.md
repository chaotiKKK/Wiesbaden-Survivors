# Sound Design — Wiesbaden Survivors

Short brief and plan. Licensed assets are not shipped; the browser-native presentation scaffold below is shipped.

## Posture

- Sound work is ElevenLabs-gated.
- Generation script lives at `tools/gen_sfx.mjs`.
- It requires `ELEVENLABS_API_KEY` and `@elevenlabs/elevenlabs-js`.
- Output target is `audio/*.mp3` in the workspace root.
- This environment does not run generation here; the brief is a plan, not an executed asset set.

## Intended sound behavior

- UI sounds: short, clean, low-friction confirmations for menu/selection and navigation.
- Gameplay impacts: restrained but distinct shoot/hit/explosion/damage cues, in tone with the retro-futurist terminal aesthetic.
- Weapon identity: weapon-specific cues can exist, but the larger the set, the more important it is to keep them consistent and not noisy.
- Ambient/mood: optional, light, and non-intrusive; used sparingly so the page stays readable.

## Plan shape

- Define a small set of sound roles first: UI, core gameplay impacts, optional ambient/mood.
- Where weapon-specific SFX make sense, map stable filenames to weapon IDs so integration stays predictable.
- Keep assets small and loop-friendly where ambient/mood is used.
- When generated, wire assets into the existing audio path as fallbacks/playables without inventing a new audio system.

## Shipped procedural presentation scaffold

- Endscreen victory and defeat use the existing `AudioSys` roles (`win`/`over`) followed by a delayed (`520 ms` / `460 ms`) jingle (`win`/`lose`). The sequence is centralized in `AudioSys.endCue()` to avoid duplicate end sounds.
- The wave-20 endless decision gets one short `wave` transition cue and a brief music duck; it does not start a loop or force the audio context.
- Cues remain subject to the existing SFX/music settings, voice budgets, and user-gesture audio initialization. Reduced-flicker mode also suppresses the new endscreen motion while leaving text and controls available.
- This is a functional fallback contract, not an asset-quality mix; licensed samples can later replace the same role names.

## Blocker, stated plainly

- ~~Licensed/generated asset generation remains blocked until an `ELEVENLABS_API_KEY` is available or the work is done elsewhere.~~ **Gelöst auf lokalem Weg (2026-09-10):** eine ffmpeg-Synthese-Pipeline erzeugt jetzt echte, hörbare Cues — siehe "Lokale Asset-Pipeline" unten. Lizenzierte/menschliche Assets bleiben der nächste Qualitätsschritt, sind aber kein Blocker mehr für hörbares Feedback.
- Do not treat `tools/gen_sfx.mjs` as already runnable here without that key and dependency.

## Lokale Asset-Pipeline (2026-09-10, ohne ElevenLabs)

- `tools/synth-audio.mjs` → `audio/<role>.m4a` (21 Rollen, AAC 96k, −16 LUFS,
  −1 dBTP). Rollennamen = BAKE_SLOT-Slots; Kontrakt gepinnt in
  data-regression 3j (Manifest ⊆ BAKE_SLOT, Dateien vorhanden).
- `AudioSys.prefetchAssets()` (index.html) lädt die Cues NUR bei http(s) und
  NUR nach der Audio-Init-Geste; file:// bleibt still bei der Bake. Die
  Profile (SFX_PRIO/DUCK/VERB/STACK, Koaleszenz, Voice-Budget) gelten
  unverändert — die Wellenform kommt aus der Datei, das Verhalten aus der
  Engine.
- `tools/trailer-audio.mjs` → `trailer/media/`: 20 s BGM-Bett (A-Moll,
  96 BPM, Synth-Pad/Arp/Kick/Bass) + deutsche VO (Microsoft Hedda, de-DE).
  Ersetzt die −91-dB-Stille-Platzhalter; trailer.html-Kontrakt unverändert.
- `tools/trailer-build.mjs` mischt Bett+VO mit deterministischem
  Fenster-Ducking (VO +5.6 dB, Bett −55 % unter den Zeilen).

## Suggested next step

- On a machine with the key and toolchain, generate a small starter set, place the outputs in `audio/`, and integrate only the roles that measurably improve first-run clarity and gameplay feedback.

## Perzeptuelle Lautstärke-Leiter (2026-09-11)

- master/sfx/music/amb steppen auf einer −4-dB-Leiter (11 Sprossen + Stille),
  Anzeige in dB (`-4,0 dB` / `AUS (stumm)`), Links = lauter, Rechts = leiser.
  Gespeichert bleibt weiterhin die Amplitude 0..1 — Gain-Konsumenten, Save-
  Format und Code-Import bleiben kompatibel. Alte Saves rasten einmalig
  (`_volMig`) per dB-Distanz auf die nächste Sprosse.
- Defaults jetzt auf Sprossen: master/sfx −4 dB, music −8 dB (×.5-Preset),
  amb −6 dB — das alte SFX:Musik-Verhältnis (≈10 dB) bleibt erhalten.
- Details, Audit-Tabelle und die zwei dabei gefundenen Bugs
  (invertierte Sprossen-Reihenfolge, Mute-Index-Lücke): siehe
  `docs/audio-design-volume-ladder-2026-09-11.md`.

## Gefahrenschicht — Mehrkanal-Kurve (2026-09-11)

- Die adaptive Gefahrenschicht nimmt jetzt drei Eingänge (Maximum): HP-Kurve
  (unverändert, 1,0-Pin bei ≤ 5 %), Gegnerdruck nahe den Spielern (Nähe
  < ~340 px voll, entfernt 0,35; /55, quadriert — weicher Anlauf) und
  Wellentiefe als Grundplatte, auf 0,35 gedeckelt. Volle HP vor dichtem
  Gedränge bleibt nicht mehr stumm; Tiefe allein beansprucht nie volle
  Intensität. Kurve als `Game._dangerChan()` ausgelagert (selftest-/probe-
  prüfbar); `endRun()` zieht den Drone sofort herunter (`setDanger(0)`).
- Details, Kurvenwerte und Probe: `docs/danger-curve-2026-09-11.md`.

## Takt-Raster für Gameplay-Events (2026-09-11)

- Wellenstarts und Boss-Wechsel feuern nicht mehr sofort/mitten im Takt:
  `requestSwitch`/`setAmbientKeepGrid`/`beatAt` legen Song-Wechsel und
  Stinger an die nächste Taktgrenze des laufenden Sequencers (16tel-Grid,
  Audio-Uhr). `setAmbientCore` wechselt Stück/Hall/Drone OHNE Phase zu
  reißen; nach einem Switch bricht der Scheduler vor dem Schritt ab und
  liest im nächsten Frame neu — sample-genau, kein Sprung. Ohne laufende
  Musik wird sofort geflusht; `endRun`/`startRun` räumen die Queue auf.
- Kurzer Wellen-Stinger (Riser+Sub) auf dem Musik-Bus, Takt-synchron.
- Details: `docs/beatsync-2026-09-11.md`.

## LUFS-Messharness (2026-09-11)

- `AudioSys.lufsMeasure` implementiert ITU-R BS.1770-4: K-Filterung
  (48-kHz-Koeffizienten, inkl. −0,691-Kalibrierungs-Offset), 400-ms-Blöcke
  mit 75 % Überlappung, Absolut-Gate −70 LUFS + Relativ-Gate −10 LU,
  Sample-Peak. Kalibriert verifiziert: 997-Hz-Sinus bei −20 dBFS misst
  −20,0 LUFS (±0,01).
- `AudioSys.lufsRender(seconds)` rendert das Musik-Bett über den ECHTEN
  Sequencer-Scheduler (`_chipTick`) in einen OfflineAudioContext (48 kHz
  stereo). Bus-Kette liegt jetzt in `_buildBuses()` — Live-`init()` und
  Offline-Render bauen dieselbe Produktionskette (Comp → Presence →
  Brickwall → Soft-Clip, Music-Filter/Pump/Duck-Pfad, Hall, Echo).
  Der Render erzeugt KEINEN AudioContext und fasset den Live-Kontext
  nicht an (Gesten-Gate-kompatibel, auch vor erster Geste lauffähig).
- `AudioSys.audioConformance()` misst und ordnet ins Zielband
  **−16…−14 LUFS** ein (`LUFS_TARGET`). Außerhalb des Bandes = Warnung
  (Toast + `console.warn '[LUFS]'`), KEIN Gate — über eine Anhebung der
  Mischung entscheidet der Balance-Pass. Gemessener Ist-Stand:
  **−19,8 LUFS, Peak −7,6 dBFS** (Musik-Bett, Intensität 0,6, 0 dB-
  Pegelreferenz) — ~3,8 LU unter dem Band, docH als Befund vermerkt.
- Oberflächen: `?qa`-Button „LUFS messen…" (Pause-Screen, Toast mit
  Ergebnis) und Selftest-Gruppe `LUFS` (3 Checks: Plausibilität,
  Determinismus Δ ≤ 0,5 LU, warn/inWindow-Konsistenz —async nach
  Balance-Parity-Muster).
- Details: `docs/lufs-harness-2026-09-11.md`.

## Aufgabe (2026-09-10)

- Interview-Breakdown als Material ablegen (Oberfläche, Status-Link-Hover-Bug, startRuns/ShortCloseEdge defaultBaseDelay).
- Dokumentieren, was bereits lokal sitzt und was noch als klarer Nächster Schritt offen ist.
- Damit der nächste Schritt nicht losgelöst von der Sound-/Audio-Suche arbeitet, arbeiten wir zuerst die Oberflächenaufgabe ab.
