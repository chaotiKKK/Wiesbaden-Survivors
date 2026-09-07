# Trailer — HyperFrames-Audio-Skelett (noch NICHT real)

Ein korrekt verdrahtetes HyperFrames-Audio-Gerüst für einen Spiel-Trailer:
**Musik-Bed + Voiceover-Gruppe + Carve**. Es ist bewusst ein **Skelett** — die
Audio-Dateien in `media/` sind **stille Platzhalter**.

## Was drin ist (und korrekt ist)
- `<hf-audio-group id="voiceover">` — Voiceover-Bus mit eigener Effektkette
  (Kompressor + Präsenz-Peak @3 kHz) und Fader.
- 3 Narrations-Clips als Gruppenmitglieder (`data-audio-group="voiceover"`).
- `music-bed` mit `data-fx-carve` → zeigt auf die Gruppe `voiceover`
  (dynamisch, Stärke 0.25). Der Carve gehört auf den **Bett-Clip**, nie auf
  die Gruppe oder einen Voice-Clip.

## Was fehlt, damit es „echt" wird
1. **Runtime:** `npm i -D @hyperframes/core`
2. **Echte Audios** in `media/` ersetzen (aktuell still):
   - `bgm-trailer.mp3` — Musik-Bett (via `/media-use` sourcen)
   - `vo-intro.mp3`, `vo-mid.mp3`, `vo-outro.mp3` — Voiceover (via `/media-use`)
3. Danach carven:
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
