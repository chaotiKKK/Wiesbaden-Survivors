# Positions-Cues im natürlichen Kampf — Reproduktionsnachweis (2026-09-10, Pass 2)

Zweiter, unabhängiger Lauf der Positions-Audio-Prüfung (der Werfer des ersten
Passes wurde als Throwaway gelöscht; dieser Pass hat ihn aus dem Dokument
`docs/combat-audio-playtest-2026-09-10.md` neu gebaut und geschärft).
Echter Run über die echte UI (Titel → Charakterwahl → Bestätigen →
Steuerungs-OK), vertrauenswürdige CDP-Klicks + Pfeiltasten-Input, Auto-Feuer
als Brotato-Regel. Werfer nach dem Pass gelöscht; Arbeitsbaum clean.

## Ergebnis: 20/20 Checks PASS

| Check | Ergebnis |
|---|---|
| Run-Start über die dreistufige UI | PASS |
| SFX-Assets über http nach Geste geladen (`AudioSys.assetsReady`) | PASS |
| Natürlicher Kampf hörbar (Peak 0.15–0.75 je Phase) | PASS |
| 97 Sample-Cues gespielt; jeder aus echtem AudioBuffer mit ctx-Rate (48 kHz) | PASS |
| Pan-Geometrie exakt: pan = clamp(dx/615, ±.75) — diese Session kumulativ 61/61 | PASS |
| Wall-Pin West: Cue-Pool eineitig 14L/0R, Ohren links (28:12 Ticks) | PASS |
| Distanzdämpfung monoton: mul 0.98 → 0.87 → 0.74 (far < 0.1 / 0.1–0.3 / > 0.3) | PASS |
| Voice-Budget: 4 aktiv / 80 Cap; Coaleszenz sichtbar | PASS |
| Frames fließen (schlechteste rAF-Lücke 15.0 ms) | PASS |
| Careless-Reload mitten im Kampf: Audio wartet auf neue Geste | PASS |
| Null Konsolen-/Exceptions | PASS |

## Neuer Befund: Kamera-Klemme dreht die erwartete Seite

Bei West-Wand-Pin war die naive Erwartung „alle Quellen rechts" **falsch —
die Engine hat recht**: Die Kamera klemmt an der Arena-Kante, ihr Zentrum
liegt damit östlich des Spielers; verfolgende Gegner zwischen Spieler und
Kamerazentrum liegen kamerarelativ LINKS. Cue-Pool 14L/0R und Ohr-Dominanz
stimmen exakt mit dieser Geometrie überein. Lehre für jeden künftigen
Audio-Test: die Soll-Seite immer **kamerarelativ** aus der Cue-Geometrie
ablesen, nie aus der Spielerposition annehmen.

## Weitere Messlehren (Probe-seitig)

- **Entscheidungsstarke Pools erst behaupten:** Freie Lauf-Phasen können
  umkämpft sein (3L/2R); Richtungs-Correlation nur bei ≥75 % Einseitigkeit,
  sonst NOTE. Der Wall-Pin liefert die garantiert eineitige Phase.
- **Cue-Zuordnung zeitlich nächster Kandidat:** „erster Match" verpaart bei
  gleichnamigen Cues im selben Frame falsch (1 Fehlpaarung in Lauf 2).
- Gesamt-Bild über drei Läufe dieser Session: 20/20, 18/20→behoben,
  17/22→behoben — sämtliche Fixes waren Probe-seitig, null Engine-Defekte.

## Offen

- Pan-Kurve linear in dx (kein Equal-Power); Distanz-Lowpass nur hörbar,
  nicht spektral gemessen. SFX synthetisiert, kein Mastering; Hedda = TTS.
- index.html unangetastet — sw.js-Stamp weiterhin korrekt; Gates:
  data-regression 21/21, verify.mjs VERIFY OK.
