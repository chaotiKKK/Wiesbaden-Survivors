# Abuse-Playtest — Careless User (2026-09-11)

GRADES spec=4 design=4 correctness=5 quality=4; biggest gap: flüchtige Nutzung nur auf Menü-/Meta-Flows getrieben — Gameplay-Missbrauch (Item-Spam im Shop, Level-Up-Reroll-Kettenspam) bleibt außerhalb des Headless-Lenkbaren ohne rAF.

## Ansatz

Echte Oberfläche (http-serve + headless Chromium), bewusst fahrlässige Nutzung:
Müll-Seeds, 8×-Rapid-Klicks, Escape-Bursts, Reload mitten im Run, Müll im
Code-Import, Wipe → sofort spielen, reine Tastaturnavigation, Tippen im Feld.

## Beobachtete, substantiierte Defekte (alle gefixt)

1. **Seed-Feld-Key-Hijack (kritisch, First-Run):** Tippen von "ocexn" in den
   Seed öffnete nach dem "o" das Optionsmenü — der window-level keydown-
   Recorder zeichnet alle Tasten auf, der Titel mappt O/E/C/S/X/N auf Menü-
   Aktionen. Fix:Recorder-Guard — in TEXTAREA/INPUT (echte Textfelder) keine
   Gameplay-Tasten aufzeichnen, Escape ausgenommen.
2. **preventDefault fraß Caret-Bewegung:** Space/Arrows/Enter wurden global
   weggefangen — Pfeiltasten bewegten den Cursor in der Code-Box nicht.
   Fix: preventDefault nur außerhalb von Textfeldern.
3. **Nav-Ring stahl den Fokus aus dem Eingabefeld:** `paintNav()` fokussiert
   bei jedem Repaint das Ring-Element; mit sichtbarem Ring wurde der Fokus
   nach dem ersten getippten Zeichen zurück auf einen Button gezogen ("o"
   blieb liegen, Rest ging an Hotkeys). Fix: Ring holt keinen Fokus, solange
   ein Textfeld aktiv ist.
4. **Enter im Seed-Feld tat nichts:** Erwartete Bedienung nach dem Tippen.
   Fix: Enter löst den vorhandenen, validierten seedPlay-Pfad aus (kein
   zweiter Parse); Müll + Enter zeigt weiterhin den Validation-Toast.

Regressionen von 1–3 sind in `tools/pw_abuse.py` gepinnt (Checks 22–24).

## Bewährt (kein Fix nötig)

- Seed-Validation: alle 6 Müll-Varianten abgewiesen mit klarem Toast;_valider
  Seed geht durch;leeres Feld harmlos.
- Import-Kette: Plain text, kaputtes Base64, Base64 ohne JSON, leerer Payload
  → alles "Ungültiger Code", nie ein Crash; WS1-Roundtrip + Restore nach
  Wipe funktioniert (glory-Marker 77 → 0 → 77).
- Rapid clicks / Escape-Bursts / Pause-Resume-Spam: endet immer in validem
  Zustand, keine Duplikat-Runs.
- Reload mitten im Run: sauberer Titel, Save intakt (bestWave nie gefallen).
- Wipe → sofort neues Run ohne Restzustand.

## Was ein User noch stolpern lässt (offen, nicht substanziiert als Bug)

- Reload mitten im Run meldet sich nicht ("Run war unterwegs") — Produkt-
  Entscheidung, kein Defekt; als Hinweis möglich.
- Seed-Feld akzeptiert Buchstaben bis zum Submit (inputmode=numeric könnte
  führen); Fehlermeldung ist aber klar und inline.
- HeroBig-Figur läuft hinter den Menüzeilen durch (Design-Pass: Stimmung,
  falls störend `opacity:.55` testen).
- SW-Update-Toast erscheint bei jedem Restamp-Reidload — korrektes PWA-
  Verhalten, bei häufigen Updates aber sichtbar häufig.

## Strukturelle Gesundheit

- Alle vier Fixes landeten im jeweiligen Owner: Input-Recorder (Typing-Guard),
  UI.paintNav (Fokus-Policy), UI.bindUI (Enter-Submit), seedRow-CSS/Markup.
  Kein Cross-Module-Hack, kein Duplikat von Validierung.
- Der Recorder-Guard sitzt am höchsten Blast-Radius des Spiels (window
  keydown) — bewusst als einzige Engstelle gewählt statt Punktlösungen in
  jedem Handler; Escape-Ausnahme dokumentiert.
- index.html bleibt eine eingebettete Wirbelsäule (AGENTS.md-Scope); die
  Änderungen verstärken die bestehenden Module, statt neue zu erzeugen.
- Playwright-Suiten als Keeper: tools/pw_recon.py, pw_walk.py, pw_vol_probe.py,
  pw_abuse.py (28 Checks). Wegwerf-Diagnosen (pw_diag_focus, pw_diag_enter,
  pw_typing_repro, pw_design_review) nach Gebrauch gelöscht.
- Gates nach Fix: verify VERIFY OK · data-regression 22/22 · walk 23/23 ·
  vol_probe 18/18 · abuse 28/28. sw.js-CACHE: wbns-9a91157d…
