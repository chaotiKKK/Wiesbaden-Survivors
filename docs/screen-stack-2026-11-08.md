# Menue-Navigation als echter Bildschirm-Stapel (2026-11-08)

## Ausgangslage

`UI.show(id)` blendete alle 18 Bildschirme aus und genau einen ein. Ein Stapel
existierte zwar (`UI.stack`, `push`, `back`), wurde aber nicht benutzt: `show()`
fasste ihn nie an, also blieb nach jedem Wurzelwechsel eine alte Kette stehen.
Konkret:

- `push()` schob `this.cur` auf den Stapel und rief `show()` — der Eintrag
  ueberlebte zwar, aber `show()` aus anderen Pfaden (`tuneBack`, `resume`,
  Wellenende) setzte den Stapel nicht zurueck. Ein spaeteres `back()` konnte
  dadurch einen laengst verlassenen Bildschirm wieder hervorholen.
- Tuning und Musik wurden mit `show()` geoeffnet und mit fest verdrahtetem Ziel
  geschlossen (`tuneBack -> scOptions`, `musicBack -> scChar`) — Herkunft
  unbekannt, Tiefe 0.
- Esc behandelte nur `scOptions` und fiel dort hart auf den Titel zurueck.
- "Optionen ueber der Pause" funktionierte nur, solange kein anderer `show()`-
  Aufruf den Stapel zwischendurch gefuellt hatte.

## Aenderung

`UI` hat jetzt drei klar getrennte Ebenen:

| Methode | Bedeutung |
| --- | --- |
| `_display(id)` | reines Rendern (Sichtbarkeit, HUD, Fokus, Ring, `fit()`) |
| `show(id)` | Wurzelwechsel: `stack = [id]` (bzw. `[]` bei `null`), dann `_display` |
| `push(id)` | Unterbildschirm: `id` kommt oben auf den Stapel |
| `back(fallback)` | obersten Eintrag entfernen; ist der Stapel dann leer, `fallback` |

Der Stapel enthaelt die ganze Kette **inklusive** des sichtbaren Bildschirms.
`hideAll()` leert ihn weiterhin. 19 Aufrufstellen wurden umgestellt:

- `play` / `coop` / `daily` -> `push('scChar')`
- `charConfirm` -> `push('scControls')`, `controlsBack` -> `back('scChar')`
- `options` und `pauseOptions` -> `push('scOptions')` (statt `show`)
- `openTune` -> `push('scTune')`, `tuneBack` -> `back('scOptions')`
- `openMusic` -> `push('scMusic')`, `musicBack` -> `back('scChar')`
- `achv`, `codex`, `stats`, `code`, `netOpen` -> `push`; die zugehoerigen
  `*Back`-Aktionen -> `back('scTitle')`
- `charBack` -> `back('scTitle')` (im Koop bleibt der Zweig fuer Spieler 2
  unveraendert: er rendert Spieler 1 und bleibt auf der Figurwahl)
- Esc: `else if (UI.stack.length > 1) UI.back();` statt Sonderfall `scOptions`

Wellenende-Bildschirme (`scLevel`, `scRelic`, `scShop`, `scEnd`, `scEndless`)
bleiben Wurzelwechsel — sie ersetzen das laufende Spiel und sollen nicht ueber
der Pause oder dem Menue liegen.

## Messung

`tools/_screenstack.py` klickt die echten Wege und liest nach jedem Schritt
`UI.cur`, den kompletten `UI.stack` und die Menge der sichtbaren Bildschirme
(erwartet: genau einer). Der Pause-Tastendruck wird wie im Loop ausgeloest
(`Input.pressed` setzen, `handleGlobalInput()`, sofort loeschen), damit kein
zweiter Frame die Pause wieder umschaltet.

```
OK   start                              cur=scTitle    depth=1 stack=['scTitle'] shown=['scTitle']
OK   Titel -> Optionen                  cur=scOptions  depth=2 stack=['scTitle', 'scOptions'] shown=['scOptions']
OK   Optionen -> Tuning                 cur=scTune     depth=3 stack=['scTitle', 'scOptions', 'scTune'] shown=['scTune']
OK   Tuning -> Optionen (pop)           cur=scOptions  depth=2 stack=['scTitle', 'scOptions'] shown=['scOptions']
OK   Optionen -> Titel (pop)            cur=scTitle    depth=1 stack=['scTitle'] shown=['scTitle']
OK   Titel -> Figuren                   cur=scChar     depth=2 stack=['scTitle', 'scChar'] shown=['scChar']
OK   Figuren -> Musik                   cur=scMusic    depth=3 stack=['scTitle', 'scChar', 'scMusic'] shown=['scMusic']
OK   Musik -> Figuren (pop)             cur=scChar     depth=2 stack=['scTitle', 'scChar'] shown=['scChar']
OK   Figuren -> Steuerung               cur=scControls depth=3 stack=['scTitle', 'scChar', 'scControls'] shown=['scControls']
OK   Steuerung -> Figuren (pop)         cur=scChar     depth=2 stack=['scTitle', 'scChar'] shown=['scChar']
OK   Figuren -> Titel (pop)             cur=scTitle    depth=1 stack=['scTitle'] shown=['scTitle']
OK   Koop: Titel -> Figuren (P1)        cur=scChar     depth=2 stack=['scTitle', 'scChar'] shown=['scChar']
OK   Koop: P1 bestaetigt -> P2          cur=scChar     depth=2 stack=['scTitle', 'scChar'] shown=['scChar']
OK   Koop: P2 zurueck -> P1             cur=scChar     depth=2 stack=['scTitle', 'scChar'] shown=['scChar']
OK   Koop: P1 zurueck -> Titel          cur=scTitle    depth=1 stack=['scTitle'] shown=['scTitle']
OK   Run gestartet (Wurzel)             cur=None       depth=0 stack=[] shown=[]
OK   Pause per Taste                    cur=scPause    depth=1 stack=['scPause'] shown=['scPause']
OK   Pause -> Optionen                  cur=scOptions  depth=2 stack=['scPause', 'scOptions'] shown=['scOptions']
OK   Optionen -> Pause (pop)            cur=scPause    depth=1 stack=['scPause'] shown=['scPause']
OK   Esc aus Optionen -> Pause          cur=scPause    depth=1 stack=['scPause'] shown=['scPause']
OK   Fortsetzen (Wurzel leer)           cur=None       depth=0 stack=[] shown=[]
     Zustand nach Fortsetzen: play
```

21 Schritte plus die Zustandspruefung: **22/22**, keine Konsolenfehler. Die letzten vier Schritte sind der Koop-Weg: Spieler 1 waehlt, bestaetigt, Spieler 2 geht zurueck zu Spieler 1, Spieler 1 zurueck zum Titel; die Tiefe bleibt bei den beiden Figurenwahl-Schritten 2 und faellt erst am Ende auf 1. Der
Kernfall ist Zeile 14/15: Optionen, aus der Pause geoeffnet, kehren per Zurueck
und per Esc zur Pause zurueck statt auf den Titel.

Gate danach: `node tools/verify.mjs` -> `VERIFY OK`, 203 pass / 0 fail / 0 skip,
exit 0. Darin enthalten ist der Charakter-Riege-Leg, der alle 32 Helden und die
fuenf neuen Faehigkeiten ueber die echte UI prueft. Die vier Koop-Schritte liegen auch als dauerhafte Assertions im
Stack-Leg von `tools/verify.mjs` (Tiefe 2 / 2 / 2 / 1).

## Grenzen

- Alle Bildschirme bleiben dauerhaft im DOM (wie vorher); der Stapel verwaltet
  nur Navigation, nicht Lebensdauer oder Zustand der Bildschirme.
- Esc wirkt jetzt eine Ebene zurueck auf **jedem** gestapelten Bildschirm
  (Figuren -> Titel, Steuerung -> Figuren, Tuning -> Optionen, Optionen ->
  Pause). Vorher war nur `scOptions` verdrahtet; das ist eine bewusste
  Verhaltensaenderung, keine reine Umsortierung.
- Der Koop-Zweig von `charBack` ist jetzt Teil des Tests: `coop` legt die
  Figurenwahl auf den Titel (Tiefe 2), der Wechsel Spieler 1 -> Spieler 2 und
  zurueck aendert **keinen** Bildschirm (Tiefe bleibt 2), und erst der
  Zurueck-Weg von Spieler 1 poppt die Figurenwahl vom Titel (Tiefe 1). Die
  Tiefe wird in jedem Schritt als `UI.stack.length` mitgeprueft, nicht nur die
  Bildschirm-ID.
- Die Pruefung ist Zustands-, keine Sichtpruefung: sie belegt, dass genau ein
  Bildschirm sichtbar ist, nicht wie er aussieht. Layout, Fokusring und `fit()`
  laufen unveraendert durch `_display`.
