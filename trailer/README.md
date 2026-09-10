# Trailer — HyperFrames-Audio (2026-09-10: ECHTES Audio)

Ein korrekt verdrahtetes HyperFrames-Audio-Gerüst für einen Spiel-Trailer:
**Musik-Bed + Voiceover-Gruppe + Carve**. Die Audio-Dateien in `media/` sind
jetzt **echtes Audio** (vorher −91-dB-Stille-Platzhalter):

- `bgm-trailer.mp3` — 20 s BGM-Bett, synthetisiert (A-Moll, 96 BPM),
  erzeugt von `tools/trailer-audio.mjs` (ffmpeg-only, keine npm-Deps).
- `vo-intro/mid/outro.mp3` — deutsche Narration, **Microsoft Hedda (de-DE)**
  via System.Speech-TTS, −16 LUFS.

Der fertige 20-s-Trailer wird von `tools/trailer-build.mjs` aus den
Capture-Frames gemischt; das Bett duckt deterministisch unter die drei
VO-Fenster (1.5–5.5 / 7–11 / 14–18 s).

## Was drin ist (und korrekt ist)
- `<hf-audio-group id="voiceover">` — Voiceover-Bus mit eigener Effektkette
  (Kompressor + Präsenz-Peak @3 kHz) und Fader.
- 3 Narrations-Clips als Gruppenmitglieder (`data-audio-group="voiceover"`).
- `music-bed` mit `data-fx-carve` → zeigt auf die Gruppe `voiceover`
  (dynamisch, Stärke 0.25). Der Carve gehört auf den **Bett-Clip**, nie auf
  die Gruppe oder einen Voice-Clip.

## Was fehlt, damit es „echt" wird
1. ~~**Runtime:** `npm i -D @hyperframes/core`~~ — für den gemischten Trailer
   nicht nötig: `tools/trailer-build.mjs` assembliert direkt mit ffmpeg.
2. ~~**Echte Audios** in `media/`~~ — erledigt (tools/trailer-audio.mjs).
3. Optional (HyperFrames-Carve-Route, falls das Comp live laufen soll):
   ```
   node C:\Users\HP\.agents\skills\hyperframes-audio\scripts\carve.mjs --comp trailer/trailer.html
   ```
   (braucht `ffmpeg` auf PATH — ist installiert — und `@hyperframes/core`.)

## Nicht enthalten
- Bild/Video, Titelkarten, Clip-Timing-Layout → das ist `/hyperframes-core`.
- Fade-in/out-Volume-Lane des Betts → nach echtem Audio ergänzen
  (JSON-Schema in `references/attributes.md` der Skill prüfen).

Solange stilles Platzhalter-Audio drin ist, produziert der Carve nichts
Hörbares — es gibt keine Sprachbänder zum Herausschneiden. Die Verdrahtung
ist aber die richtige Form; mit echtem Voiceover greift sie sofort.
