# KI-Audit Welle 20: haengende und oszillierende Gegner (2026-11-08)

Audit, keine Aenderung am Spiel. Ziel war, in einem dichten Welle-20-Kampf zu
messen, welche Gegner stehen bleiben oder zwischen zwei Richtungen pendeln.

## Aufbau

`tools/_ai-audit.py` instrumentiert `Enemy.prototype.update`, also jeden
Simulationsschritt und nicht nur gerenderte Frames, und fuehrt je Gegner Buch:

| Groesse | Definition |
| --- | --- |
| `stuck` | Sekunden mit Verschiebung < 1,2 px/s bei lebendem Ziel > 45 px, ohne legitime Sperren (Stun, Freeze, Spawn-Eingang, Latch, Telegrafie, Boss-`railT`/`introHold`) |
| `maxRun` | laengste zusammenhaengende Phase davon, mit Ort und Distanz |
| `rev` | echte Richtungsumkehr: Skalarprodukt der Verschiebungen < 0, beide Schritte > 25 px/s |
| `turn` | Sprung der Bewegungsrichtung > 0,35 rad bei > 40 px/s — Zittern an Schwellen, ohne Zustandswechsel |
| `jitT` | Sekunden in 1-s-Fenstern mit > 50 px Weg und < 15 px Netto-Strecke |
| `ch`/`flips` | Wechsel von `eState`/`state`, davon Rueckfaelle A->B->A in < 0,4 s |

Lauf: `qaGo(20)`, `qaGod`, Spieler 8 s still, danach 4 x 2,5 s W/S/A/D.
Zusaetzlich sechs Elite-Walker (`makeElite()`), weil Welle 20 im Lauf keine
Eliten liefert und die `eliteAI`-Zustandsmaschine sonst nie laeuft.

Ergebnis des Laufs: Arena 1200x950, Spitze **117 lebende Gegner**, 107 erfasste
Gegner, 58.512 Simulationsschritte, 51 fps (headless), 43 Rudelwechsel,
keine Konsolenfehler. Rohdaten: `docs/pw/ai-audit.json`.

## Schwellen-Zittern (isolierte Gegenprobe, Vorher/Nachher)

**Vorher (harter Schwellenwert):** Die drei auffaelligsten Typen wechselten die
Laufrichtung an genau einer Distanz. `tools/_ai-threshold.py` setzt je einen
Vertreter exakt auf diese Distanz, haelt den Spieler still und protokolliert
jede Umkehr mit der Distanz in diesem Bild (6,9 s, keine Fremdgegner):

| Typ | Schwelle | Umkehrungen | im Band +-6 px | Distanzbereich |
| --- | --- | --- | --- | --- |
| Siren | 260 px | 361 (52/s) | 361 (100 %) | 257,8 .. 263,7 |
| Summoner | 300 px | 332 (48/s) | 332 (100 %) | 299,5 .. 301,7 |
| Bomber | 210 px | 99 (14/s) | 99 (100 %) | 207,4 .. 210,8 |

Alle Umkehrungen lagen im Band um die Schwelle, keine einzige ausserhalb: das
war reines Schwellen-Zittern, keine Reaktion auf den Spieler.

**Nachher (Hysterese, 2026-11-09):** Derselbe Rig setzt je einen Vertreter in
die Bandmitte (260 / 300 / 210), misst wieder 6,9 s und zaehlt Umkehrungen
innerhalb von +-6 px um die Bandmitte:

| Typ | Band | Umkehrungen | im Band +-6 px | Distanzbereich |
| --- | --- | --- | --- | --- |
| Siren | 246 .. 274 px | 20 (2,9/s) | 0 (0 %) | 246,5 .. 273,8 |
| Summoner | 286 .. 314 px | 14 (2,0/s) | 0 (0 %) | 286,4 .. 314,2 |
| Bomber | 196 .. 224 px | 21 (3,0/s) | 1 (5 %) | 194,9 .. 225,0 |

Die Umkehrungen wandern damit an die Bandkanten; im Zentrum bleibt die
Richtung stehen. In vier Wiederholungen (6,9-7,0 s) lag der Bomber bei 1-2
Zentrumstreffern (4-12 %, 0,14-0,29/s), Siren und Summoner in allen Laeufen
bei 0. Die Gesamtrate verteilt sich auf beide Bandkanten, nicht auf ein
12-px-Band. Exit 0, keine Konsolenfehler, keine Fremdgegner. Die Tabelle zeigt
den letzten Lauf; Rohdaten: `docs/pw/ai-threshold.json`.

## Befund, nach Schwere

### 1. Siren — 52 Richtungswechsel pro Sekunde

```js
if (d < 260) this.moveTo(ang + Math.PI, sp, dt); else this.moveTo(ang, sp * .8, dt);
```

[index.html:6975](index.html#L6975). Ein einziger harter Vergleich, keine
Hysterese: bei 259,9 px laeuft sie weg, bei 260,1 px auf den Spieler zu. Im
dichten Lauf 157 Umkehrungen in 16,7 s (9,4/s), Weg/Netto-Verhaeltnis 73:1 an
derselben Stelle (664,717). Auf dem Schirm ist das ein Stehenbleiben mit
Richtungszucken, kein Halten des Abstands.

### 2. Summoner — 48 Richtungswechsel pro Sekunde

```js
if (d < 300) this.moveTo(ang + Math.PI, sp, dt); else this.moveTo(ang, sp * .7, dt);
```

[index.html:6816](index.html#L6816). Gleiches Muster bei 300 px, im Lauf
102-125 Umkehrungen je ~16,5 s (6,2-7,7/s). Zusaetzlich beschwoert er in dieser
Position weiter, weil `summonCd` unabhaengig von der Bewegung laeuft.

### 3. Bomber — 14 Richtungswechsel pro Sekunde

```js
const keep = 210;
if (d > keep) this.moveTo(ang, sp, dt);
else this.moveTo(ang + Math.PI * .5 + ..., sp, dt);
```

[index.html:6931](index.html#L6931). Der Wechsel ist 90 Grad statt 180 (an
/ seitlich), deshalb weniger Umkehrungen, aber dieselbe harte Kante: im Lauf
97 Umkehrungen in 31,3 s, im Versuch 99 in 6,9 s.

> **Nachtrag 2026-11-09:** Die drei Schwellen sind inzwischen mit einer
> gemeinsamen Hysterese behoben. Die Zahlen oben sind der Vorher-Zustand; die
> Nachher-Messung steht im Abschnitt "Schwellen-Zittern" (Siren/Summoner
> 0 %, Bomber 4-12 % im Zentrum), die Gate-Messung und die Umsetzung unten.

### 4. Healer laeuft in die Arenawand und bleibt dort

```js
this.moveTo(ang + Math.PI * .7, sp, dt);
```

[index.html:6795](index.html#L6795). Der Fluchtwinkel ist fest um 0,7 rad
gedreht; die Sichtpruefung ersetzt `ang` nur, wenn die Sicht blockiert ist.
Steht der Spieler so, dass diese Richtung in die Wand zeigt, schiebt der Heiler
dauerhaft dagegen: 5,4 s von 16,9 s (32 %), laengste Phase 1,79 s bei
x = 1187 — die Arena ist 1200 breit, das ist die rechte Kante. Im ersten Lauf
17,8 s von 31,7 s (56 %), laengste Phase 3,74 s bei (1187,13), also Nordost-Ecke.
Zwei Laeufe, beide Male dieselbe Kante: systematisch, nicht Zufall.

### 5. Kein Befund: Sentiel, Moerser, Boss

- **Sentinel** 19,8 s von 33,0 s ohne Bewegung (laengste Phase 3,90 s bei
  d = 513). Das ist die Rolle: er laeuft nur, wenn `d > B.range`, sonst zielt und
  schiesst er. Die Zustandswechsel (16) sind `idle -> aim`-Feuerzyklen.
- **Moerser** 8,1 s von 31,8 s, laengste Phase 0,25 s: Band-Strafe, kein Zittern.
- **Boss** 1,4 s von 17,3 s: `railT`-Telegrafie und `introHold` sind
  ausgenommen, der Rest ist Angriffs-Knockback. Kein Haengefall.

### 6. Elite-Zustandsmaschine: unauffaellig

Sechs Elite-Walker, 103,5 Gegnersekunden:

| Zustand | Zeit |
| --- | --- |
| circle | 68 s |
| lunge | 24 s |
| approach | 11 s |
| retreat | 0 s |

91 Zustandswechsel, davon 6 Rueckfaelle in < 0,4 s (ein Gegner 2 in 17,3 s).
`retreat` lief nie, weil die Eliten mit `qaGod` nie unter 35 % HP kamen — dieser
Zweig ist ungeprueft. Kein Dauerpendeln zwischen `circle` und `lunge`.

### 7. Gedraenge, kein Zustandsfehler

`swarm` (31 Stueck) steht mit d = 1-7 px auf dem Spieler: 506 Umkehrungen,
1858 Richtungsspruenge in 338 s, Weg/Netto bis 37,7:1. Das ist Separation plus
Kontakt, kein Schwellenfehler — sichtbar aber erwartbar. `runner` (Weg/Netto
10,2:1) und `leech` (28:1) zeigen dasselbe Muster in Spielernaehe.

## Empfehlung (umgesetzt 2026-11-09)

- Fuer Siren, Summoner, Bomber eine Totzone: Rueckzug bis `thr - 14`, Vorruecken
  erst ab `thr + 14`, dazwischen seitlich halten. Drei Einzeiler, kein neuer
  Zustand.
- Heiler: Fluchtvektor an den Weltgrenzen spiegeln oder `moveTo` mit
  Wandabstand gewichten, damit er nicht dauerhaft in die Kante schiebt.

## Gate und Umsetzung (2026-11-09)

Der AI-Audit ist jetzt ein eigener Browser-Leg in `tools/verify.mjs`. Er startet
einen echten Lauf, entfernt die Spielerwaffen, setzt den Spieler still und
spawnt je einen Vertreter **jedes** Typs aus `ENEMIES` in 260 px Abstand. Sechs
Sekunden werden mit festen `Game.update(1/60)`-Schritten simuliert;
`Enemy.prototype.update` zeichnet pro Typ echte Richtungsumkehrungen auf
(Skalarprodukt < 0, beide Schritte > 25 px/s, Abstand >= 80 px, keine
Stun-/Spawn-/Telegrafie-Sperren). Die Umkehrdistanzen werden in 12-px-Baender
sortiert. Ein Typ fällt durch, wenn ein Band mindestens 8 Umkehrungen enthaelt
und die Rate **> 3/s** liegt. Der 80-px-Boden schliesst normales Gedraenge und
Nahkampf aus; normale Orbits verteilen sich auf mehrere Baender.

**Rot gegen den alten Stand** (gleicher Probe, alter Code):

| Typ | Umkehrungen im dichtesten 12-px-Band | Rate |
| --- | ---: | ---: |
| Sirene | 323 in 258,42..261,95 px | **53,83/s** |
| Bomber | 278 in 206,71..211,07 px | **46,33/s** |
| Beschwörer | 263 in 299,30..301,48 px | **43,83/s** |

Das reproduziert die Audit-Befunde als Gate: alle drei liegen zu 100 % im
schmalen Band.

**Umsetzung:** `Enemy` hat jetzt `keepDir` und die gemeinsame Methode
`keepBandDir(d, near, far)`. Sie schaltet erst unter `near` auf Rueckzug und
erst ueber `far` wieder auf Vorruecken; dazwischen bleibt die Richtung stehen.
Die Bänder sind:

- Sirene: 246 .. 274 px (Ziel 260)
- Beschwörer: 286 .. 314 px (Ziel 300)
- Bomber: 196 .. 224 px (Ziel 210), dazwischen seitlich halten

Kein neuer Zustand, keine neuen Stats, keine Save-Migration. Der Gate-Lauf
danach: **121 pass / 0 fail / 0 skip**, Exit 0. Der schlechteste Typ ist der
Bomber mit 15 Umkehrungen in 6 s = **2,50/s** bei 194,95..197,46 px; Sirene und
Beschwörer liegen darunter, kein Typ ueberschreitet 3/s.

### Heiler an allen Waenden

Der zweite Live-Block im selben Leg prueft sechs Faelle: alle vier
Aussenkanten, eine echte Innenwand und eine dichte Welle mit **48 Gegnern**
inklusive Heiler. Gemessen wird der minimale Koerperabstand (`wallGap`) zu
Arenakanten und `allWalls()`; `pinned` zaehlt Frames mit `< 1,5 px` Abstand,
`minGap` ist das Minimum ab Sekunde 1.

- **Aussenkanten:** Die Innenwaende werden fuer diese vier Faelle temporaer
  deaktiviert, damit wirklich die Level-Grenze gemessen wird. Heiler und
  Spieler stehen auf derselben Seite, die Flucht zeigt direkt in die Kante.
- **Innenwand:** Eine vorhandene Wand aus dem Level wird isoliert; der Heiler
  steht 3 px neben einer Seite, der Spieler 283 px weiter auf derselben Seite,
  sodass die Flucht in die Wand zeigt.
- **Dichte Welle:** 48 Gegner werden um den Heiler an der rechten Kante
  gespawnt; der Spieler steht links. Damit wirkt Separation direkt auf die
  Wandflucht.

**Rot vor der Wandflucht:** rechte Kante 4,0 s gepinnt, `minGap 0`, final
`x = w - r` (1087 bei Arena-Breite 1100), y = 63.

**Umsetzung:** `Enemy.wallSafeAngle(ang, dt)` latcht bei Koerperabstand < 60 px
fuer 0,6 s einen Kurs von der naechsten Wand weg. Waehrend dieses Fensters
entfernt `moveTo` den Separationsanteil, der in die aktive Wand zeigt; danach
greift die normale Flucht wieder. Arenakanten und `allWalls()` werden
beruecksichtigt, `wallT`/`wallNx`/`wallNy` beim Spawn zurueckgesetzt.

**Gruen (Full-Gate 121 pass / 0 fail / 0 skip, Exit 0):**

| Fall | Pin-Zeit | min. Wandabstand nach 1 s | final |
| --- | ---: | ---: | ---: |
| rechte Kante | 0,00 s | 59,9 px | 138,6 px |
| linke Kante | 0,00 s | 59,8 px | 130,5 px |
| obere Kante | 0,00 s | 72,7 px | 151,2 px |
| untere Kante | 0,00 s | 59,6 px | 205,1 px |
| echte Innenwand | 0,00 s | 58,7 px | 95,3 px |
| dichte Welle, 48 Gegner | **0,18 s** | 59,8 px | 92,0 px |

Kein Fall ueberschreitet 0,25 s; alle halten nach 1 s mindestens 58,7 px
Abstand. Der bestehende AI-Band-Check bleibt gruen: schlechtester Typ ist der
Bomber mit 2,50 Umkehrungen/s, kein Typ ueberschreitet 3/s.

**Grenzen des Nachweises:** ein Seed, vier Sekunden je Rand-/Innenwandfall,
sechs Sekunden fuer die dichte Welle, stehender Spieler. Die vier
Aussenkanten isolieren die Grenze durch Deaktivieren der Innenwaende; der
Innenwandfall prueft eine echte, aber nur eine Wand; die dichte Welle prueft
die rechte Kante mit 48 einfachen Verfolgern. Nicht abgedeckt sind Boss-/Elite-
Zustaende, alle moeglichen Innenwandgeometrien und menschliche Wahrnehmung.
Headless Chromium, feste Simulationsschritte.

## Ein-Slot-Charakter „Einarm-Willi" (Nachtrag 2026-11-09)

Die Charakter-Riege war die groesste Inhaltsluecke (23/44). Der neue Held
`einarm` schliesst sie als vollstaendige vertikale Scheibe: **ein Waffenslot**
statt sechs, Startwaffe Schraubenschluessel auf **T2** (`startWeaponTier: 1`),
`maxWeapons: 1`, und die neue Faehigkeit `nietenhagel` (360-Grad-Salve,
Betaeubung, Rueckstoss, 0,12 s Cooldown-Rueckerstattung je Treffer).

Der Shop ist kein Fremdkoerper: `ShopSystem.generate()` zieht fuer Ein-Slot-
Helden nur Angebote der getragenen Waffe auf deren aktuellem Tier; jedes
Waffenangebot ist damit ein bezahlbares Upgrade. Ist die Waffe auf T4, fallen
Waffenangebote weg und der Slot wird mit Items gefuellt, statt unkaufbare
Angebote zu zeigen.

**Live-Messung (`node tools/verify.mjs`, echter `Game.startRun()`, Seed 0x51ee,
Danger 0, headless Chromium):**

| Pruefung | Messwert |
| --- | --- |
| Auswahl | Charakterkarte im echten `#charGrid` gerendert, nicht gesperrt |
| Start | 1 Waffe, Schraubenschluessel T2, `weaponSlots() = 1`, atkSpd +140, dmgP +60 % |
| Slot-Vertrag | `Player.addWeapon('pistol')` = false, Arsenal bleibt bei 1 |
| Shop | 6 Angebote; jedes Waffenangebot ist Schraubenschluessel auf dem getragenen Tier |
| Kauf | T2 -> T3 ueber `ShopSystem.buy()` |
| Faehigkeit | 5/5 Walker getroffen; Cooldown 9,00 s -> 8,40 s (5 x 0,12 s) |
| BalanceSim 10k | 51,7 % Siegrate, Ø Welle 13,5 (Zielkorridor 20-80 %) |
| Voller Gate | **121 pass / 0 fail / 0 skip**, Exit 0 |
| Statische Beine | `--no-browser` **75 / 0 / 0** |
| Content / Balance | Content 13/13, Content-Scope 6/6, `STADTGESCHICHTE OK` (alle sieben Linien +4,46 Wellen, Deckel 4,5) |

Unveraendert gruen: AI-Band (schlechtester Typ Bomber 2,50 Umkehrungen/s,
Grenze 3/s) und die sechs Heiler-Wandfaelle (0,00 s Pin an vier Kanten und der
Innenwand, 0,18 s in der dichten 48er-Welle).

**Grenzen:** Das Run-Modell bildet den Ein-Slot-Nachteil nur als
`sqrt(Slots/6)`-Faktor auf die Offensive ab; Flaechenabdeckung, Zielwechsel und
das echte Spielgefuehl misst es nicht. Der Shop kann pro Tier nur ein Angebot
sinnvoll verkaufen (nach dem Kauf sind weitere Angebote desselben Tiers tot);
auf T4 werden Waffenangebote zu Items. Koop mit zwei Ein-Slot-Helden wurde
nicht gemessen (der Shop ist geteilt und folgt Spieler 1). Es gibt keine eigene
Stimme/Portraetzeichnung, nur die bestehende Skin-Schicht; menschlicher
20-Wellen-Playtest fehlt. Die damals 11/24 Charaktere im 20-80-%-Korridor sind ein
beobachteter BalanceSim-Wert, kein Gate; gated ist die Einarm-Siegrate selbst.
Nach der Charakter-Riege vom 2026-11-09 sind es 19/32; alle fünf neuen Helden
liegen im Korridor (siehe unten).

## Charakter-Riege 32 (Nachtrag 2026-11-09)

Die zuvor groesste Inhaltsluecke (23/44) ist auf **32/44** geschlossen. Fuenf
neue Helden sind live und ueber die echte Figurenauswahl spielbar:
Ampel-Anna (`gruenphase`: Team-Tempo/Angriffstempo, Slow), Dampf-Dieter
(`dampfwalze`: Dash-Kegel, Stun, Brand, Ruestung), Nachtwaechter Nils
(`scheinwerfer`: langer Lichtkegel, Markierung, Slow), Wein-Wanda
(`rebenhieb`: Radialschaden, Brand, Heilung je Treffer) und Frost-Fritz
(`kaeltewelle`: Frost-Nova, Freeze/Slow, Ruestung). Nils ist ab 20
abgeschlossenen Wellen (`wavesCleared`) frei, Wanda ab 3 Bossen (`bosses`).

BalanceSim 10k (Danger 2, 312 Laeufe/Charakter): Anna 41,0 %, Dieter 52,9 %,
Nils 24,7 %, Wanda 42,9 %, Fritz 44,6 % — alle im 20-80-%-Korridor. Der
dokumentierte Vierer-Korridor verschiebt sich nur durch die kuerzere
Stichprobe (370 -> 312 Laeufe/Charakter, gleiche Seeds): Einarm 50,0,
Schrottschorsch 48,4, Ventil-Vera 36,9, Kurier-Kai 28,2 %. Keine Stat- oder
Waffenwerte dieser vier Helden wurden geaendert.

Gate: **203 pass / 0 fail / 0 skip**, statisch **83/0/0**, `data-regression`
22/22, `content-scope` 6/6, Screen-Stack-Rig 22/22 ohne Konsolenfehler. Der
Roster-Leg startet alle fuenf durch `#scTitle -> #charGrid -> #charConfirm ->
#scControls` und feuert `Input.key('skill1')`; er misst 5/5 Treffer und die
jeweilige Statuswirkung. Grenze: Das ist ein Engine-/Datenbeweis, kein
menschlicher 20-Wellen-Playtest; die Faehigkeitsstaerke im echten Gefecht
bleibt Spielgefuehl-Messung.

## Item-Pool 120 (Nachtrag 2026-11-09)

Die dokumentierte Item-Lücke ist geschlossen: **73 → 120** (+47), verteilt auf
30/30/30/30 je Rarity, davon 12 verflucht; jedes Viertel trägt 24 Items. Alle
120 bleiben im normalen Rarity-Pool, die 47 neuen IDs sind in
`ITEM_FAMILY_MEMBERS` registriert. Kein paralleles System: Stats laufen über
`Player.recalc()`, Fluch über `addItem()`, Turm über den bestehenden Spawn,
Dornen über `applyPlayerHit()`.

**Shop-/Wirkungsnachweis:** Ein natürlicher Wave-20-Shop rollte
**Kontaktlinse** und kaufte sie über den echten `#shopItems .item`-Klick.
Danach wurden alle 47 Items einzeln als echtes Angebot gerendert und über
denselben Handler gekauft. **47/47** zeigten `itemCounts=1` und die exakten
Stat-, Curse-, Turm- und Dornen-Deltas. Zusätzlich erzeugten 3.000 echte
`ShopSystem.generate()`-Shops (Welle 1/10/20) alle 47 IDs mindestens einmal.
Der Leg läuft in `node tools/verify.mjs`; die Solo- sowie Koop-Auswahl-/Stack-
Legs blieben grün (ein vollständiger Online-Koop-Lauf war nicht Teil des
Passes).

**Neu (Namen):**

**R1 (15):** Feldflasche, Griffhandschuhe, Rettungsfolie, Kurpark-Eichel, Parkuhr-Münze, Gießkanne, Vogelhäuschen, Uferkiesel, Rollschuhe, Kanu-Paddel, Neoprenanzug, Akkuzelle, Kabelbinder, Lesebrille, Wurfmesser.

**R2 (8):** Hitzeschutzanzug, Brandmelder, Picknickkorb, Ententeich, Fahrradpumpe, Treibgut, Lötstation, Kontaktlinse.

**R3 (8):** Hydrantenschlüssel, Rettungsweste, Rosengarten, Brunnenwasser, Rheinsegler, Strandkorb, Fluch der Schwerkraft, Fluch des Hungers.

**R4 (16):** Fluch des Rostes, Fluch des Wuchers, Fluch der Zeit, Fluch des Lärms, Einsatzleitwagen, Kurhausgarten, Jahrhundertbaum, Kurpark-Denkmal, Rheinregatta, Rheinfähre, Fusionator, Kernspintomograph, Ballistikcomputer, Präzisionszirkel, Stadtarchiv, Goldene Krawatte.

**Balance:** 10.000 Läufe, Danger 2, 312 Läufe je Charakter: Einarm 50,0 %,
Schrott-Schorsch 48,4 %, Ventil-Vera 36,9 %, Kurier-Kai 28,2 %; 19/32 im
20–80-%-Korridor. Unverändert, weil `BalanceSim.simulateRun()` nur `chr.stats`
und optionale Stadtgeschichte-Boni liest, keine Items. Kein Tuning, kein
Drift.

**Gates:** voll **212/0/0**, statisch **87/0/0**, `data-regression` 22/22,
`content-scope` 6/6, Screen-Stack-Rig 22/22. **Darstellung:** Das bestehende
Item-Schema/UI hat kein Icon-Feld; die neuen Karten bleiben textbasiert wie
die 73 alten. **Grenze:** kein menschlicher 20-Wellen-Playtest und keine
Pickrate-Messung; Items sind im BalanceSim nicht modelliert.

## Grenzen

- Headless Chromium, 51 fps. Richtungswechsel werden pro Frame gezaehlt, die
  Rate haengt also an der Bildrate; belastbar ist der Bandanteil (100 %), nicht
  die absolute Zahl pro Sekunde.
- Ein Seed, `danger 0`, `qaGod` an, Spieler skriptgesteuert (still + 8 s
  N/S/W/O), sechs injizierte Elite-Walker. Keine menschliche Wahrnehmung, keine
  Screenshots: gemessen wurde Zustand und Position, nicht wie es sich anfuehlt.
- `retreat` der Eliten und der Boss-Kampf in anderen Phasen sind nicht abgedeckt.
