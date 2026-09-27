# Frontend-Design-Pass — Titel-Feinschliff (2026-09-11)

GRADES spec=4 design=5 correctness=4 quality=4; biggest gap: nur der Titelbildschirm wurde im Preview begutachtet; Charakterwahl/Optionen/Endscreen liegen nur als Headless-Screenshots (docs/pw/design-*.png) vor, nicht im Bridge-Review.

## Befund statt Rebrand

Der Audit-Scan (zwei `:root`-Blöcke) ergab: das Spiel trägt bereits eine
vollständige, bewusste Identität — **"Btx"** (Bildschirmtext/Behörde):
Bundesblau `#0033A0`, Post-Gelb `#FFCC00`, Stempel-Rot `#C8102E`,
Formular-Papierton `#E8E4D9` auf echtem Schwarz, Bahnschrift/DIN als
Anzeigeschrift, flache Blöcke mit 6-fach-Authority-Balken statt Neon-Chamfer,
AZ-Aktenzeichen im Fuß. Die zweite Theme-Schicht überschreibt die Arcade-
Basis komplett und gewinnt per Reihenfolge. Fazit: **nichts reißen,
scharfen statt neu erfinden** (Scope-Regel AGENTS.md).

## Kritik am gerenderten Titel (Preview-Screenshot, nicht nur DOM-Lektüre)

1. **Seed-Zeile war zerfallenes Formular:** Platzhalter mittig abgeschnitten
   ("Seed eingeben (opt"), Button dreizeilig gequetscht, Hilfetext in einer
   ~120px-Spalte mit 8 Zeilen. Ursache: `flex` ohne `flex-wrap`/`flex-shrink`-
   Schutz — drei Kinder zwangen in eine Zeile.
2. **"Speicherstand löschen" ohne Gefahren-Semantik:** Markup trug nie die
   `danger`-Klasse; die Stempel-Rot-Regel existierte, griff aber nie.
3. Copy-Bug: "leer lasse du für einen zufälligen Start" (Grammatik).

## Fixes (alle im Btx-System, keine neuen Token)

- `.seedRow`: `flex-wrap` + `#seedInput{flex:1 1 150px;min-width:150px}` +
  Button `white-space:nowrap` + `.sub{flex:1 1 100%}` — Eingabe = volle
  Breite, Button einzeilig, Hilfe als eigene Caption-Zeile.
- Placeholder auf "Seed (optional)" gekürzt (passt ganz).
- Copy: "Ein eigener Seed macht den Run teilbar und wiederholbar — Feld
  leerlassen für einen zufälligen Start."
- `data-act="wipe"` → `class="btn danger nav"`; Hover/Fokus-Abstufe
  (`#ff4256`-Balken) ergänzt. Nav-Ring-Mitgliedschaft bleibt (verify:
  QA-Nav-Zweig grün).

## Ausdrücklich nicht angefasst

Gleich hohe Menüzeilen (Behörde = gleiche Vorgänge, bewusst), Hero-Figur
(reduced-motion-gepinnt), Scanline/Vignette, gesamte Typo-Skala. Kein
zusätzliches Element, kein Emoji, kein Gradient — die Signatur bleibt der
Aktenzeichen-Fuß (AZ + Stats) über der Stempel-Rot-Ausnahme.

## Gates

- `node tools/verify.mjs` → VERIFY OK (Selftest-Banner inkl. seed-copy-Vertrag)
- `node tools/data-regression.mjs` → 22/22
- `tools/pw_walk.py` → 23/23 · `tools/pw_vol_probe.py` → 18/18
- sw.js-CACHE neu gestempelt: wbns-2b519741…
- Screenshots: docs/pw/design-1…6 (Headless) + Preview-Shots design1/design2

## Offen

- Endscreen/Charakterwahl könnten denselben Formular-Feinschliff vertragen
  (nächster Kandidat: `.sfoot`-Fußzeile auf schmalen Screens).
- HeroBig-Kollision (Figur hinter den Zeilen) ist Stimmung, nicht Fehler —
  falls sie stört: `#heroBig{opacity:.55}` als sanfte Stufe testen.
