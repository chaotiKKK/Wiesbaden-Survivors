# Playtest Welle 20 — Bewegung, Zielen, Trefferfeedback (2026-11-08)

Frage dieses Passes: **wie fühlen sich Bewegung, Zielen und Trefferfeedback in
Welle 20 an?** Kein Code-Umbau, keine Balance-Änderung — messen, ansehen,
berichten.

## Methode und ihre Grenzen

- Echter Headless-Chromium (Playwright, `chromium-1248`), servierte Kopie auf
  `127.0.0.1:8973`, `?qa=1`, Lauf über die echten Menüs gestartet
  (`[data-act="play"]` → `charConfirm` → `controlsOK`).
- Eingabe ist **echt**: `page.keyboard.down/up` und `page.mouse.move` gehen als
  CDP-Events in `Input.keys` / `Input.mouse`, also durch dieselbe Schicht wie
  eine Tastatur. Kein `Game.update()`-Stepping.
- Pro Frame (rAF) wird der Engine-Zustand mitgeschrieben: Position, `vx/vy`,
  `aim`, `weapons[0].angle`, `Game.hitstop`, `Game.timeScale`, `cam.trauma`,
  Gegner-`hitFlash`, Kills, Combo, `rollT`/`dashT`, `invuln`, HP. Zusätzlich
  werden `AudioSys.sfx`-Aufrufe und `Game.feedback`-Stufen gezählt.
- **Grenzen, die dieser Pass nicht überschreitet:** synthetische Eingabe statt
  menschlicher Hand; Software-Renderer headless; der Sampler kostet selbst
  Frames (Zahlen sind also eher zu niedrig); Audio wird nur *gezählt*, nicht
  gehört. „Fühlt sich gut an" kann hier niemand bestätigen — gemessen wird die
  Engine-Antwort, die das Gefühl erzeugt.

## Bewegung

| Messung | Wert |
| --- | --- |
| Latenz Taste → erste Bewegung | **1 Frame**, 19–20 ms (3× gemessen) |
| Beschleunigung auf 95 % Tempo | **300 / 322 / 320 ms** |
| Abbremsen auf < 5 % nach Tastenloslassen | **323 / 323 / 325 ms** (19 Frames) |
| Spitzentempo (`speed()`-Stat) | 244,9 px/s, erreicht 244,5–244,6 |
| Diagonal (W+D) vs. gerade | **Ratio 1.000** (kein Diagonal-Boost) |
| Ausweichrolle | **122,5 px in 266 ms**, i-Frames **0,32 s** |

**Lesart:** Der Start ist hart (ein Frame), danach ist die Bewegung *träge
symmetrisch*: ~0,32 s bis zum vollen Tempo und ~0,32 s bis zum Stillstand. Das
kommt von der Bodenreibung (`slip = 0.0001` im Lerp), nicht von fehlender
Eingabe. Ergebnis: die Figur schiebt sich schwerfällig durch den Raum, was in
Welle 20 mit 50–70 Gegnern als gewichtig liest — aber ein Ausweichmanöver, das
auf den letzten Pixel genau sein muss, kostet Überwindung. Die Rolle ist der
Gegenhebel: 2,7× Tempo, 266 ms, 0,32 s unverwundbar.

### Bewegung nachgeschaerft (Antritt + Stop)

Die Bewegung war ein einziger exponentieller Lerp mit `slip = .0001` (trocken)
bzw. `.045` (Regen) — Zeitkonstanten 0,11 s und 0,32 s. Jetzt steht dort eine
explizite Zeitkonstante: **0,06 s trocken**, **0,18 s Regen**
(`index.html`, `Player.update`). Dieselbe Konstante gilt fuer Beschleunigen
und Abbremsen, Top-Tempo und Diagonal-Normalisierung sind unberuehrt.

| Messung | vorher | nachher |
| --- | --- | --- |
| Ramp auf 95 % (trocken) | 314,7 / 322,3 / 323,8 ms | **152,1 / 181,7 ms** (Harness: 153,7 / 172,2 / 175,1) |
| Stop auf < 5 % (trocken) | 311,9 / 318,6 / 319,5 ms (17–19 Frames) | **169,8 / 171,1 / 173,4 / 177,2 / 178,1 ms** (9–10 Frames) |
| Latenz Taste -> Bewegung | 1 Frame, 21,5–23,9 ms | **0 Frames, 1,9–10,1 ms** |
| Top-Speed | 244,5–244,9 px/s | 244,9 px/s |
| Diagonal vs. gerade | 1.000 | 1.000 |
| Regen: Ramp / Stop | nicht gemessen; aus τ 0,32 s gerechnet ≈ 0,97 s | **541 / 543 ms** Ramp, **537 / 524 ms** Stop |

Der Wegfall der einen Frame Verzoegerung ist kein Zufall: die ramp ist jetzt so
kurz, dass schon der erste Frame nach dem Tastendruck die 2-%-Schwelle reisst.

Methode: `tools/_move-ab.py` misst beide Pfade in einem Lauf mit echten
`KeyD`-Events in Welle 20. Welle 20 selbst wuerfelte in diesem Lauf
`zeitdruck` + `ressourcen_dieb` (kein Regen) — der Regen-Pfad wurde ueber
`Game.modIs` kontrolliert erzwungen, damit die nasse Fahrbahn messbar bleibt.

Nebenwirkung, die bewusst ist: die vorher als "traege symmetrisch" beschriebene
Bewegung ist damit deutlich direkter (rund 45 % kuerzere Ramp und Stop). Die
Rolle ist unveraendert (dieser Lauf: 122,6 px in 279 ms ab Stand; mit Anlauf
173,4 px in 267 ms — die Distanz haengt weiter von der Restgeschwindigkeit ab).

## Zielen

| Messung | Wert |
| --- | --- |
| Auto-Ziel: Abweichung zum nächsten Ziel | **0,00° max, 0,00° Ø** (62 Frames) |
| Auto-Ziel: Umschalten auf neues nächstes Ziel | **1 Frame / 25 ms** |
| Manuell (`KeyV`): Zittern bei festem Cursor | **0,00°** (27 Frames) |
| Waffen-Slew 180° → < 5° | **77,5 ms** (18,0° → 1,6° über 10 Frames) |

**Lesart:** Das *Zielen* selbst ist nicht das Nadelöhr — Auto-Ziel sitzt exakt
und schaltet im nächsten Frame um. Das Gefühl entsteht eine Ebene tiefer: die
Waffen drehen mit ~78 ms Nachlauf hinterher (`dt*14`-Glättung). Das ist der
Unterschied zwischen „mein Fadenkreuz klebt" und „meine Kanone schwenkt" — in
Welle 20 mit schnellen Adds fühlt sich das nach Masse an, nicht nach
Verzögerung. Manuell ist präzise (0° Zittern), aber nicht der Standardpfad.

## Trefferfeedback

15 s echte Welle 20, Gott-Modus, 70 Gegner Peak, Boss aktiv:

| Messung | Wert |
| --- | --- |
| Hitstop-Ereignisse | 4–5 in 15 s, max. **0,12 s** |
| Hitstop-Anteil der Frames | **7,1 %** |
| `timeScale`-Tiefpunkt | **0,30** |
| Kamera-Trauma | max. **0,99**, Ø **0,26** |
| Gegner-Hitflash-Frames | **607** (summiert über alle Gegner) |
| SFX-Aufrufe im Fenster | `hit` 40, `crit` 20, `boom` 14, `telegraph` 14, `wall` 114 |
| `Game.feedback`-Stufen | `mittel` 13, `gross` 5 |
| Damage-Numbers | sichtbar gestapelt (`10×2`, `10×2`, `6`, …) am Gegnerklumpen |
| Frame-Pacing (headless, mit Sampler) | p50 **19,1 ms (52 fps)**, p95 30,2 ms, max 103,5 ms |

**Lesart:** Treffer haben drei Ebenen — kurzer Freeze (0,12 s), Zeitlupe bis
0,3 und Kamera-Shake bis 0,99 Trauma, dazu Weißblinken der Gegner und
Zahlenstapel. Das ist die Sprache eines schweren Treffers, und sie ist messbar
da. Die HUD-eigene FPS-Anzeige zeigt in den Frames 47 bzw. 34 fps, deckt sich
also mit dem gemessenen Pacing.

## Befund Bild-Lesbarkeit — inzwischen behoben (2026-11-08)

Beim Playtest lag die eigene Figur bei 52–76 Gegnern unter einem Stapel aus
Damage-Numbers, Ringen und AoE-Flaechen (`pw/playtest-w20-combat.png`). Fix im
Draw-Layer (`FX`): eine Lesbarkeits-Zone (`FX.quietR = 52`) um jeden lebenden
Spieler.

- Schadenszahlen werden beim Anlegen knapp aus der Zone geschoben
  (`quietPush`, Zielradius `quietR * 1.12`) — sie stehen neben, nicht auf der
  Figur.
- Ringe, deren Zentrum in der Zone liegt, sinken auf 45 % Deckkraft
  (`.45 + .55 * quiet`); die *Fuellung* von Telegraph-Flaechen auf 30 %. Der
  Warn-Rand bleibt unangetastet.
- Zahlen, in die der Spieler hineinlaeuft, blenden auf 45 % herunter.

Kein Eingriff in Trefferlogik, Schaden, Telegraph-Zeitpunkt oder -Radius;
`FX.quietR = 0` schaltet die Zone komplett ab.

A/B im selben Lauf (Welle 20, Gott-Modus, 3-s-Fenster off/on/off/on, gleiche
Waffe, `tools/_clutter-ab.py`):

| Messung | Zone aus | Zone an |
| --- | --- | --- |
| Zahlen innerhalb 52 px, Ø | 1.15 | **0.00** |
| je lebender Zahl | 0.17 / 0.35 | **0.00 / 0.00** |
| Gegner im Fenster (Konfounder) | 31 / 57 | 51 / 62 |

Die Zone-an-Fenster hatten *mehr* Gegner (51/62 vs. 31/57) und trotzdem keine
Zahl auf der Figur — der Effekt laeuft also gegen den Konfounder. Die Zahl der
Ringe in der Zone bleibt gleich: Ringe wandern nicht, nur ihre Deckkraft; das
ist im Standbild sichtbar, nicht zaehlbar.

Sichtpruefung: `pw/clutter-off.png` (Zahlen `10/6/6` auf der Figur) gegen
`pw/clutter-on.png` (Figur frei, Zahlen daneben). Gate danach:
`node tools/verify.mjs` → 93 pass / 0 fail / 0 skip, exit 0.


### Boss-Namensschild (dieselbe Zone)

Das Schild ueber dem Boss (`Enemy.draw`, 128x14 px, Name + Segmentleiste)
stand bei Kontakt mitten in der eigenen Figur. Es folgt jetzt derselben
Lesbarkeits-Zone (`FX.quietR`; 0 = aus):

- steht eine Figur unter dem Schild, wird es um den Ueberlappungsbetrag nach
  oben gehoben (nur nach oben — das Schild bleibt ueber dem Boss) und auf 26 %
  Deckkraft abgeblendet;
- steht die Figur schon ueber dem Schild, wird nur abgeblendet: Heben wuerde
  sie erst recht ins Bild schieben;
- ohne Figur darunter bleiben Geometrie und Deckkraft exakt wie vorher
  (dieselben 128x14 px, dieselbe Textzeile).

A/B im selben Lauf (`tools/_plate-ab.py`, Boss MARKTKIRCHEN-TURM, r 60).
"Freiraum" = Oberkante Figur minus Unterkante Schild, also der Wert, den der
Draw-Aufruf tatsaechlich benutzt hat:

| Figur steht | Freiraum aus | Freiraum an | Deckkraft |
| --- | --- | --- | --- |
| auf der Boss-Mitte | +59,7 px | +45,8 px | 1,00 / 1,00 |
| auf der Boss-Oberkante | **-1,1 px** | **+5,0 px** | 1,00 / 0,26 |
| auf der Schildlinie | -29,9 px | -31,9 px | 1,00 / 0,26 |

Die mittlere Zeile ist der Kontaktfall: das Schild ueberlappte die Figur um
1 px, jetzt steht es 5 px frei bei 26 % Deckkraft. In der dritten Zeile steht
die Figur *ueber* dem Schild — dort bleibt die Ueberlappung, das Schild wird
nur abgeblendet (es wird vor der Figur gezeichnet, die Figur bleibt oben). Im
Boss-Mitte-Fall greift die Zone nicht, weil das Schild dort schon ~60 px ueber
dem Kopf liegt. Der Boss-Intro-Titel hat inzwischen eine eigene Behandlung
(naechster Abschnitt).

Sichtpruefung: `pw/plate-off.png` (Schild auf der Figur) gegen
`pw/plate-on.png` (Figur frei). Gate: `node tools/verify.mjs` 93/0/0.


### Boss-Intro-Titel (dieselbe Zone, Bildschirm-Koordinaten)

Der grosse Titel beim Boss-Auftritt (`drawBossIntro`) liegt in der Bildmitte
und lief quer ueber die eigene Figur, sobald die Kamera zum Boss schwenkte. Er
folgt jetzt derselben Zone (`FX.quietR`; 0 = aus), nur in
Bildschirm-Koordinaten:

- die Tintenflaeche wird pro Bild per `measureText` gemessen (Ober- und
  Unterlaenge von Name und Unterzeile), nicht aus der Schriftgroesse geschaetzt;
- steht eine Figur darunter, weicht der ganze Block senkrecht aus — in der
  kleineren der beiden Richtungen, plus 6 px Luft, begrenzt auf den Bereich
  zwischen den Balken;
- das Ausweichen ist mit einer Zeitkonstante von ~0,16 s geglaettet, damit ein
  Richtungswechsel kein Sprung ist (der Titel bekommt kein `dt`, die Glaettung
  rechnet deshalb aus `Game.time`);
- bleibt danach Ueberdeckung, wird abgeblendet (Grundwert 26 %, wie beim
  Boss-Schild);
- ohne Figur unter dem Text bleiben Lage und Deckkraft exakt wie vorher.

A/B im selben Lauf (`tools/_intro-ab.py`, Boss SEBBOS ROGUE-KI, Zoom 1,42; die
Figur wird auf feste Bildhoehen gesetzt, der Intro-Timer auf t = 0,65
gehalten, damit Ein- und Ausblenden die Deckkraft-Spalte nicht verfaelschen).
"Freiraum" = Abstand zwischen Titel-Tinte und Figurenkasten, wie ihn der
Draw-Aufruf tatsaechlich benutzt hat:

| Figur steht bei | Freiraum aus | Freiraum an | Deckkraft | Verschiebung |
| --- | --- | --- | --- | --- |
| 0,50 H (unter dem Titel) | **-41,5 px** | **+24,1 px** | 1,00 / 1,00 | 0 -> -32,8 px |
| 0,26 H (darueber) | +91,7 px | +91,9 px | 1,00 / 1,00 | 0 -> 0 |
| 0,80 H (darunter) | +165,8 px | +183,2 px | 1,00 / 1,00 | 0 -> 0 |

Zeile 1 ist der Kontaktfall: der Titel lag 41,5 px in der Figur und steht jetzt
24,1 px frei — die Figur bleibt sichtbar und der Titel bleibt voll deckend, er
wird verschoben statt abgeblendet. Zeilen 2 und 3 sind die Gegenprobe: ohne
Kontakt bewegt sich nichts. Sie differieren um 0,2 bzw. 17,4 px, weil der Boss
zwischen den Durchgaengen laeuft und damit Figurenkasten und Zoom minimal anders
liegen — der Titelblock selbst ist in allen Laeufen identisch (297,2-386,4 px).

Bei einer einzelnen Figur ist der Abdunkel-Zweig im A/B nicht erreichbar (der
Titel kommt immer frei); er greift erst, wenn der begrenzte Bereich nicht
reicht — etwa im Koop mit Figuren ueber und unter dem Text. Geprueft wurde er
deshalb nur synthetisch: ein Block hoeher als der sichere Bereich, direkt an
`Game.introQuiet` uebergeben (kein gezeichneter Frame) — der Zweig blendet auf
0,958 ab, ist also verdrahtet, ohne dass diese Zahl aus einem Spielbild stammt.

Sichtpruefung: `pw/intro-off.png` (Titel quer ueber der Figur) gegen
`pw/intro-on.png` (Figur frei, Titel hochgerueckt). Gate danach:
`node tools/verify.mjs` -> 93 pass / 0 fail / 0 skip, exit 0.

## Zweiter Lauf (aktueller Stand, inkl. Lesbarkeits-Zone)

Gleicher Harness, gleicher Ablauf, neue Messung. Die Zahlen streuen run-to-run,
deshalb stehen beide Laeufe nebeneinander statt "Ersatz":

| Messung | Lauf 1 | Lauf 2 |
| --- | --- | --- |
| Latenz Taste -> Bewegung | 19-20 ms / 1 Frame | 21,5-23,9 ms / 1 Frame |
| Ramp auf 95 % | 300/322/320 ms | 314,7/322,3/323,8 ms |
| Stop auf < 5 % | 323/323/325 ms | 311,9/318,6/319,5 ms (17-19 Frames) |
| Ausweichrolle | 122,5 px / 266 ms | 173,4 px / 267 ms |
| Auto-Ziel Fehler | 0,00° | 0,00° (60 Frames) |
| Re-Acquire | 25 ms / 1 Frame | 24,2 ms / 1 Frame |
| Waffen-Slew -> < 5° | 77,5 ms | 89,4 ms |
| Hitstop | 4-5 / 0,12 s / 7,1 % | 4 / 0,12 s / 3,6 % |
| Kamera-Trauma max / Ø | 0,99 / 0,26 | 0,928 / 0,12 |
| Gegner-Hitflash-Frames | 607 | 457 |
| SFX | `hit` 40, `crit` 20, `boom` 14 | `hit` 47, `crit` 24, `wall` 61, `e_shot` 56 |
| Frame-Pacing | p50 19,1 ms (52 fps) | p50 20,4 ms (49 fps), p95 38,0, max 162,8 |
| Gegner-Peak / Boss | 70 / aktiv | 73 / aktiv |

Die Rollendistanz ist **keine Konstante**: die Rolle startet aus der
Restgeschwindigkeit — 122,5 px aus dem Stand, 173,4 px mit Anlauf, bei
identischer Dauer von ~267 ms.

Neuer Befund (Lesbarkeit, offen): Im schwersten Moment ist der groesste
Verdecker nicht mehr die Zahlenmenge, sondern der weisse Impact-Blitz aus
`Game.feedback` (`gross` 1x, `mittel` 7x in 15 s). In
`pw/playtest-w20-wave.png` steht die Figur mitten in einer weissen Bloom ueber
dem Telegraph-Ring. Die Zahlen liegen inzwischen daneben (Zone greift), der
Blitz selbst ist noch ungedaempft.

## Was dieser Pass *nicht* sagt

- Die Kills (1–3 in 15 s) sind **kein** Balance-Urteil: der Sprung
  `Game.qaGo(20)` startet Welle 20 mit einem Level-1-Starter-Loadout. Ein echter
  Welle-20-Build hat mehr Waffen und Schaden; die Trefferfrequenz hier ist
  bewusst niedrig.
- Kein Hör-Eindruck. `hit`/`crit`/`boom` wurden gezählt, nicht bewertet.
- Keine Aussage über Gefühl an einer echten GPU oder mit echten Händen.

## Artefakte

- `tools/_playtest-w20.py` — der Harness (Eingabe, Sampler, Auswertung).
- `pw/playtest-w20.json` — Rohmesswerte aller Legs.
- `pw/playtest-w20-combat.png`, `pw/playtest-w20-wave.png`,
  `pw/playtest-w20-dash.png` — Frames aus der laufenden Welle 20.
- `tools/_clutter-ab.py` — A/B der Lesbarkeits-Zone im selben Kampf.
- `pw/clutter-ab.json` — Zaehlungen beider Zustaende.
- `pw/clutter-off.png`, `pw/clutter-on.png` — dieselbe Welle vor/nach dem Fix.
- `tools/_plate-ab.py` — A/B des Boss-Namensschilds in drei Abstaenden.
- `pw/plate-ab.json`, `pw/plate-off.png`, `pw/plate-on.png` — Schild vor/nach dem Fix.
- `tools/_move-ab.py`, `pw/move-ab.json` — Ramp/Stop trocken vs. Regen in Welle 20.
- `tools/_squash-stills.py`, `docs/pw/squash-stills/` — deterministischer
  Still-Vergleich linear/quadratisch mit identischem `squash` je Zeile;
  Einzelbilder, `stills.json` und `contact-sheet.png`.
- `tools/_squash-live.py`, `docs/pw/squash-stills/live.json` — Live-Abgleich
  der Silhouetten und Frame-Timing fuer linear/quadratisch/kubisch.
- `docs/pw/squash-stills/live-contact-sheet.png`, `live-timing.png`,
  `live-*.png` — Live-Referenz, Kurven und Messpunkte.
- `tools/squash-verify.sh` — reproduzierbarer Gesamtlauf (Stills → Live → Stills).


### Trefferstauchung: Ausklingen statt linearer Rampe

Die Stauchung eines getroffenen Gegners (`Enemy.squash`, gesetzt in
`Combat.applyHit` als `clamp(.14 + tier * 2.4, .14, .55)`) lief bisher linear ab
(3,2 pro Sekunde). Jetzt klingt sie kubisch aus — gleicher Spitzenwert,
gleiche Dauer, nur die Kurve ist anders. `Game.squashEase = 2` ist Shipping;
`1` ist die quadratische Kontrolle, `0` die alte lineare Rampe.

A/B im selben Lauf (`tools/_squash-ab.py`, Boss SEBBOS ROGUE-KI, drei Laeufe je
Variante, Median; ein 200k-Crit auf einen Boss mit voruebergehend 1e9 LP, damit
der Spitzenwert 0,55 statt des Mindestwerts 0,14 erreicht). Abtastung pro
gezeichnetem Bild, also das, was bei 43-58 fps wirklich auf dem Schirm stand:

| Messung | linear | quadratisch |
| --- | --- | --- |
| Spitzenwert | 0,550 | 0,550 |
| Dauer bis 0 | 150,7 ms | 142,0 ms |
| Sichtbare Frames | 9 | 9 |
| Halbwert (50 % des Peaks) | 95,7 ms | 41,2 ms |
| Flaeche 0-260 ms | 39,5 | 22,5 |

Gleicher Peak, gleiche Bildanzahl, Dauer im Rahmen der Frame-Aufloesung
(gemessen 142-151 ms bei 171,9 ms Soll — das letzte sichtbare Bild liegt vor dem
echten Nulldurchgang): die Rueckfederung wird also nicht laenger. Der
Unterschied liegt in der Form: der Halbwert halbiert sich (95,7 -> 41,2 ms) und
die sichtbare Verformung im 260-ms-Fenster sinkt um 43 % (39,5 -> 22,5). Der
Gegner springt schneller in seine Form zurueck und laesst danach nur einen
kurzen Rest stehen, statt gleichmaessig zu verschwinden.

Wiederholung nach dem spaeteren UI-Stapel-Patch (`tools/_squash-ab.py` erneut,
Boss MARKTKIRCHEN-TURM, wieder drei Laeufe je Variante): dieselbe Richtung,
andere Absolutwerte wegen anderer Bildrate — Dauer 153,9 -> 129,1 ms, Halbwert
92,1 -> 44,6 ms, Flaeche 39,1 -> 20,1, sichtbare Frames 9 -> 8, Peak 0,550 in
beiden Varianten. Die Verkuerzung und der halbierte Halbwert sind also nicht an
einen Lauf oder einen Boss gebunden.

Grenze der alten A/B-Messung: gemessen ist die Kurve, nicht die Wahrnehmung.
Die Werte streuen run-to-run, weil der Sampler selbst Frames kostet. Der
fruehere Standbild-Versuch war unbrauchbar, weil Frame-Jitter die Varianten bei
verschiedenen Stauchwerten pausieren liess. Der deterministische Still-Vergleich
(`tools/_squash-stills.py`) pinnt Boss, Zielwinkel, `hitFlash`, `spawnScale` und
`Game.time` und rendert linear/quadratisch mit identischem `squash` je Zeile:
5/5 Paare pixelgleich, 0 abweichende Pixel. Die Form ist also kurvenunabhaengig;
nur der Zeitpunkt unterscheidet sich.

### Kubisch vs. quadratisch: Live-Messung (2026-11-09)

Die Entscheidung fuer die naechste Stufe fiel im echten Renderer, nicht am
Schreibtisch. `tools/_squash-live.py` pinnt den Wellen-20-Boss KURHAUS-KOLOSS
in eine leere Ecke (`396,621`), die Kamera auf 1,8x, dpr 1, Qualitaet 2, den
Spieler ausser Reichweite und `Game.state = 'paused'`. `Game.qaSilhouette`
blendet nur Nameplate/HP aus; der Bosskoerper laeuft durch `Enemy.draw` und die
Produktionsmatrix. Jeder Lauf setzt einen 200k-Crit auf einen Boss mit 1e9 LP,
damit der Peak wirklich 0,55 ist (`Combat.applyHit`), und sampelt nach
`Game.render()` an der Frame-Grenze. Fuenf Laeufe pro Kurve, Median.

Silhouetten-Gegenprobe: 5/5 Werte (Peak 0,55, 0,44, 0,33, 0,22, 0,11) treffen
die Offscreen-Referenz; bbox-Delta 0, Flaeche 0,00 % Abweichung, IoU
0,9956–0,9989, 339 abweichende Pixel ueber alle fuenf (max. 135), Hintergrund
stabil, 0 Konsolenfehler. Ein echter Unterschied war zuerst da: die Offscreen-
Referenz liess `Game.drawShadows` weg, die separate Weltraum-Schattenebene nach
dem Bosskoerper. Sie ist jetzt mit ihrer No-Light-Verzweigung (Alpha .3)
gespiegelt; danach passte die Silhouette.

| Messung | linear | quadratisch | kubisch |
| --- | --- | --- | --- |
| Peak | 0,550 | 0,550 | 0,550 |
| Halbwert (50 % Rest) | 84,3 ms | 45,2 ms | **35,3 ms** |
| 80 % abgeklungen | 33,3 ms | 15,1 ms | **12,1 ms** |
| 20 % Rest | 130,7 ms | 89,9 ms | **71,3 ms** |
| Flaeche 0–260 ms | 45,85 | 29,01 | **23,71** |
| gezeichnete Frames | 22 | 22 | 22 |
| erster Null-Frame | 177,4 ms | 177,6 ms | 181,8 ms |

Der erste Null-Frame ist kein Kurvenende: T = 171,9 ms nominal, die
Frame-Abtastung liegt danach. Entscheidend sind Halbwert und Flaeche. Kubisch
ist bei gleichem Peak 9,9 ms frueher halb (22 % kuerzer) und hat 18 % weniger
Flaeche; auch bei 80 % und 20 % liegt es vorn. Damit gewinnt kubisch die
Vorgabe „schneller abklingen, ohne den Einschlag groesser zu machen“.
`Game.squashEase = 2` ist jetzt Shipping; `1` bleibt die quadratische
Kontrolle, `0` die lineare. Der Peak wird ausschliesslich in
`Combat.applyHit` gesetzt und blieb in allen 15 Laeufen 0,550.

Gegen die Brotato-Erwartung heisst das: der Treffer sitzt genauso kurz und
hart, aber die Figur ist nach 35 ms schon halb zurueck statt nach 45 ms. Ein
direkter Frame-Vergleich mit Brotato wurde nicht erhoben; die Aussage stuetzt
sich auf die gemessene eigene Kurve. Wahrnehmung bleibt offen (Software-
Renderer, keine Haende), die Form ist dagegen pixelgenau belegt.

Reproduzieren:

```bash
./tools/squash-verify.sh
```

Der Wrapper aktiviert die Browser-Umgebung, baut die Still-Referenz, misst
linear/quadratisch/kubisch live und baut die Haupttafel neu. Einzeln:
`tools/_squash-live.py` bzw. `tools/_squash-stills.py`; Details in
`docs/pw/squash-stills/live.json`.

Gate danach: `node tools/verify.mjs` -> 93 pass / 0 fail / 0 skip, exit 0.


## Veedel-Item-Familien — Shop-Pool und Fokus (2026-11-09)

**Gewähltes System:** fünf Item-Familien als Direktor für den Shop-Pool. Die
konkrete Brotato-Lücke ist der breite, build-definierende Item-Pool: 24 neue
Items, 70 insgesamt, und ein Shop, der einen begonnenen Build nach zwei
Familienitems sichtbar weiterführt. Bewusst **keine** neue Set-Bonus-Schicht
(die Stadtgeschichte ist bereits das Item-Pair-Evolutionssystem) und keine
neuen Stadtgeschichte-Linien (die Gates sind auf 7 Linien / 14 Teile
festgelegt).

### Was dazugekommen ist

| Familie | Items | Achse |
| --- | ---: | --- |
| Feuerwehr | 15 | Überleben, Rüstung, Heilung |
| Kurpark | 11 | Glück, Ernte, XP |
| Rheinufer | 13 | Tempo, Ausweichen, Rückstoß |
| Labor | 16 | Technik, Elemente, Explosionen |
| Innenstadt | 15 | Krit, Reichweite, Präzision |
| **Gesamt** | **70** | 24 neue Items |

Die Fokusregel greift ab **zwei** Items derselben Familie: `ShopSystem.generate()`
garantiert dann mindestens ein Item dieser Familie, ohne den letzten Waffenslot
zu ersetzen. Die Rarität bleibt über `cap = 1 + floor(wave / 5)` wellenbegrenzt.
Shop-Karten tragen ein Familien-Tag, der Shop zeigt den Fokus-Hinweis, das
Inventar `Veedel: … · Fokus: …`; der Items-Tab im Kompendium listet die fünf
Familien und den Tag pro Item. Keine neuen Stats, keine Save-Migration.

### Erreichbarkeit im Run

Der normale Weg ist der Shop nach einem Wellenende. Für die Evidenz wurde ein
echter `Game.startRun()` (Leonidas, Seed `0x51ee`, Gefahr 0) gestartet, zwei
**neue** Kurpark-Items ins Inventar gelegt und die Welle über den
Produktionspfad `Game.endWave()` beendet. Ergebnis: `UI.cur = scShop`,
`Game.state = shop`; das erste erzeugte Angebot hatte bereits einen neuen
Kurpark-Treffer, also keine zusätzliche Generierung nötig.

| Messung | Wert |
| --- | --- |
| Shop-Angebote | **6** |
| Fokus | **Kurpark** (2 Items) |
| Garantiertes Fokus-Angebot | **Kurpark-Taubenpaar**, 44 Material |
| Kauf über `ShopSystem.buy()` | **Luck 10 → 24**, Max. Leben 165 → 160 |
| Material | **10015 → 9971** |
| Inventar | **Kurpark ×2 → ×3**, Fokus Kurpark |
| Kompendium | 5 Familien, 15/11/13/16/15 Items |
| Konsolen-/Seitenfehler | **0** |

Die Screenshots nutzen 100 % UI-Skalierung für Lesbarkeit (Auto-Fit würde den
Shop auf 900 px auf 58 % schrumpfen); das ist nur eine Evidenz-Zoomstufe. Der
Studio-/Sägen-Vorspann (`#sawfx`, z-70) ist für die Aufnahmen ausgeblendet, weil
er sonst jede UI übermalt.

### Evidenz

- `pw/veedel-families/shop-focus.png` — Shop mit Fokus-Banner, Familien-Tag auf
  **Kurpark-Taubenpaar** und `Veedel: Kurpark ×2 · Fokus: Kurpark`.
- `pw/veedel-families/shop-after-buy.png` — nach dem Kauf: 9971 Material,
  Leben 160/160, Glück +24, `Kurpark ×3 · Fokus: Kurpark`, Karte ausgegraut.
- `pw/veedel-families/codex-families.png` — Items-Tab mit allen fünf Familien
  und `[Familie]`-Tag pro Item.
- `pw/veedel-families/evidence.json` — Rohwerte, 13/13 `checks` true,
  `naturalEndWave: true`, `attempts: 0`, `consoleErrors: []`.
- `tools/_veedel-evidence.py` — reproduzierbarer Harness; schreibt die PNGs und
  die JSON neu.

### Gate

`node tools/verify.mjs` → **121 pass / 0 fail / 0 skip**, Exit 0; darin fünf
statische Pool-/Familienprüfungen und sechs Live-Prüfungen (natürlicher
Wellenende-Übergang, Fokus aus zwei Items, garantiertes Familienangebot, Kauf
mit Stat-Anwendung, Shop-Tag/Fokus-Banner, Inventar-Familienzeile).
Zusätzlich prüft der AI-Band-Leg, dass kein Gegnertyp mehr als 3
Richtungsumkehrungen/s in einem 12-px-Abstandsband macht, und der
Heiler-Wandcheck, dass der Sanitäter nicht an der Arenakante klebt.
`node tools/verify.mjs --no-browser` → **75 / 0 / 0**.
`node --test tools/content-stadtgeschichte.test.mjs` → **13/13**;
`node tools/stadtgeschichte-balance.mjs` → **STADTGESCHICHTE OK**.

### Grenzen

- Echter Engine-Lauf, aber die Welle wird nach dem Setzen der zwei Items über
  `Game.endWave()` beendet; keine vollständige 20-Wellen-Runde mit menschlicher
  Eingabe.
- Headless-Chromium/Software-Renderer; keine Aussage über Gefühl, Sound oder
  Lesbarkeit an einer echten GPU.
- 70 Items sind mehr als vorher, aber weiter unter Brotatos Katalog; der Pass
  schließt die Shop-Pool-/Fokus-Lücke, nicht jede Item-Parität.
- Die 24 neuen Items sind reine Stat-Items; keine neue Save-Migration und keine
  neue Set-Bonus-Schicht.
