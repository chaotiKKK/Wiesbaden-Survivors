# Hybrid-Waffen: 20-Wellen-Playtest und Balance-Pass

**Stand:** 9. November 2026

**Auftrag:** Die 15 neuen Hybrid-Waffen in vollständigen 20-Wellen-Läufen spielen und auffällige Balance-Werte justieren.

**Ergebnis:** 15/15 Läufe abgeschlossen, vier gezielte Damage-Anpassungen, ein Engine-Crashfix, Gate 212/0/0. Keine Commits.

## Kurzfazit

- Alle 15 Hybrid-Waffen wurden als Startwaffe in einem vollständigen Kurpark-Lauf über die lokalen Wellen 1–20 gespielt, mit den Bossen bei Welle 10 und 20. Alle 15 beendeten Welle 20, keiner erreichte das Overtime-Limit, keiner scheiterte.
- Vier Waffen lagen in der build-unabhängigen Referenz-DPS klar außerhalb des Typbands: Kältekompresse, Runenstab und Blitzspeer unten, Ballistenarm oben. Angepasst wurde ausschließlich das Damage-Feld der vier Tier-Zeilen; Angriffsgeschwindigkeit, Reichweite, Krit, Preis und Spezialeffekte blieben unverändert.
- Die Referenz-DPS bewegten sich in die erwartete Richtung: Kältekompresse +28,6 % / +30,5 %, Runenstab +13,9 % / +16,2 %, Blitzspeer +14,1 % / +8,5 %, Ballistenarm −9,7 % / −10,3 % (T2 / T3).
- Kältekompresse bleibt die niedrigste Referenz-DPS. Das ist bei einer Kontrollwaffe mit 40 % Slow und Regen-Skalierung beabsichtigt: Sie hatte im Lauf nur 414 Schaden genommen (deutlich unter dem Sample-Mittel von 723) und beendete Welle 20 im regulären 34-s-Fenster. Ein weiterer Rohschaden-Buff würde ihr Utility-Profil überziehen; der nächste Hebel wäre Slow-Uptime, nicht Damage.
- Elf Waffen blieben unangetastet. Hohe Lauf-Schadensanteile bei Klingenbrecher, Mammutkeule und Bollwerkbanner sind Build-Konzentration bzw. Doppelkopien, keine belegten Stat-Ausreißer (siehe unten).
- Ein echter Engine-Crash im Charm-Pfad wurde gefunden und behoben: Ein charmierter Burrower, der ein anderes Enemy als Ziel wählt, rief `tgt.damage()` auf; diese Methode gibt es nur für Player. Der Fallback auf `tgt.hurt()` steht in `index.html` bei 7500–7501.

## Methode

### Harness und Ablauf

Die Messungen laufen über `tools/hybrid-weapons-20waves.mjs`:

```bash
node tools/hybrid-weapons-20waves.mjs \
  --tag after \
  --out docs/pw/hybrid-weapons-20w-after.json
```

Pro Waffe wird ein echter Lauf gestartet, nicht ein Shop-Scan und nicht ein einzelner Treffer:

- Kurpark, lokale Wellen 1–20; Bosse bei Welle 10 (`kurparkhueter`) und 20 (`thermalquelle`).
- Leonidas, Danger 2, Seed `0x5eedc0de` für alle fünfzehn Läufe.
- Die getestete Hybrid-Waffe ersetzt die Startwaffe auf T0; die Startprogression wird zurückgesetzt, damit alle Läufe denselben Anfang haben.
- Bewegung über den echten Eingabekanal (`Input.touch.p1`), Schießen über das ausgelieferte Auto-Aim, Schritte über `Game.update(1/60)`.
- Level-ups über `Game.chooseUpgrade()`, Käufe über `ShopSystem.buy()` und `ShopSystem.priceOf()`, Wellenwechsel über `Game.nextWave()` / `startWave()` / `endWave()`.
- Nur Präsentation ist für den Headless-Betrieb stillgelegt: `UI.renderHud`, `renderShop`, `renderLevelUp`, `renderEnd`, `toast`, `banner`. `UI.show` und alle State-/Queue-Pfade laufen weiter.

### Identisches Support-Baseline

Jeder Lauf erhält dieselben echten Buffs: **+120 maxHp, +8 armor, +2.5 hpRegen, +6 dodge**. Das ist eine Test-Fixture, keine Spieländerung. Ohne sie würden frühe Tode den Waffenvergleich dominieren; mit ihr misst der Lauf die Waffe im selben survivability-Kontext. Die Start-HP liegt damit bei 255.

### Fester Pilot

Alle fünfzehn Läufe nutzen denselben Piloten:

- Rückzug unter 60 % HP, prädiktives Ausweichen vor Geschossen und Gefahren/Telegraphen.
- Heil-Pickups werden bevorzugt, wenn die Fläche sicher ist.
- Stand-off: etwa 64 px im Nahkampf, etwa 265 px bei Fernkampf.
- Boss-Fokus in Bosswellen über einen gepatchten `Game.nearestEnemy`-Pfad; der Originalpfad wird im `finally` wiederhergestellt.
- Fähigkeit wird bei Bedrängung ausgelöst. Der Pilot liest nur Live-Engine-State.

### Shop-Politik

Die Politik ist für alle Läufe gleich: zuerst die Fokuswaffe, dann bis zu fünf Waffenslots füllen, danach bis zu drei bis vier nützliche, nicht verfluchte Items, Attachments und zuletzt der letzte Slot bzw. Upgrades. Kopien derselben Waffe sind erlaubt, weil das Spiel sie erlaubt; dadurch kann ein Waffen-ID-Anteil über mehrere Kopien laufen.

### Overtime-Limit

Das Limit liegt bei 240 s zusätzlich zur normalen Wellenzeit. Es fängt nur extrem langsame Boss-Builds ab, damit ein Lauf nicht vorzeitig als Fehlschlag endet. Im finalen Nachher-Report hat **kein Lauf** das Limit erreicht.

### Referenz-DPS

Die Referenz kommt aus dem ausgelieferten `BalanceSim.weaponDPS` bei Level 14, T2 und T3 – dasselbe Modell, das der Balance-Bildschirm im Spiel verwendet. Verglichen wird gegen den Median aller 71 nicht-legendären Waffen desselben Typs; das Perzentil bezieht sich auf alle 71 nicht-legendären Waffen. Die Referenz ist eine **Modellmessung** (Einzelziel); Slow, Burn-Uptime und Überlebensnutzen werden nicht bepreist, und Flächenschaden wird nicht mit der realen Gegnerdichte gewichtet. Sie ist die kontrollierte Messung; die Läufe validieren Vollständigkeit und Größenordnung.

### Was `mainShare` nicht ist

`mainShare` ist `p.stats.byWeapon[ID] / Game.run.dmg`. Bei mehreren Kopien derselben Waffe wird der Schaden aller Kopien unter derselben ID summiert. Deshalb wird in diesem Report zusätzlich **Anteil je Kopie** ausgewiesen (`mainShare / mainCopies`). Ein hoher aggregierter Anteil ist ohne diese Normalisierung kein Waffen-Outlier.

## Vorher: die vier belegten Ausreißer

| Waffe | T2-DPS | × Typ-Median | Perzentil | T3-DPS | × Typ-Median | Perzentil |
|---|---:|---:|---:|---:|---:|---:|
| Kältekompresse | 117,2 | 0,45 | P1 | 167,3 | 0,39 | P1 |
| Runenstab | 156,5 | 0,60 | P6 | 213,6 | 0,50 | P3 |
| Blitzspeer | 154,4 | 0,59 | P4 | 327,7 | 0,77 | P16 |
| Ballistenarm | 353,4 | 1,36 | P56 | 727,3 | 1,71 | P79 |

P1 heißt: nur 1 % der nicht-legendären Waffen liegen auf oder unter diesem Wert. Die drei Buff-Kandidaten waren die klarsten unteren Ausreißer im Projektilspektrum; Ballistenarm war der klarste obere.

## Anpassungen

Geändert wurde ausschließlich `tiers[i][0]` (Damage). Die Tier-Reihenfolge im Datensatz ist `[damage, attackSpeed, range, critC, critM, price, x]`; `tierData()` liest `a[0]` als Damage und `a[2]` als Range.

| Waffe | T1–T4 Damage alt | T1–T4 Damage neu | Änderung | Referenz T2/T3 vorher → nachher |
|---|---|---|---:|---|
| Kältekompresse | 7 / 12 / 20 / 32 | 11 / 20 / 31 / 45 | +57 % / +67 % / +55 % / +41 % | 117,2/167,3 → 150,7/218,3 (+28,6 % / +30,5 %) |
| Runenstab | 10 / 16 / 27 / 44 | 14 / 22 / 36 / 58 | +40 % / +37,5 % / +33,3 % / +31,8 % | 156,5/213,6 → 178,3/248,2 (+13,9 % / +16,2 %) |
| Blitzspeer | 12 / 20 / 32 / 52 | 14 / 25 / 36 / 58 | +16,7 % / +25 % / +12,5 % / +11,5 % | 154,4/327,7 → 176,2/355,4 (+14,1 % / +8,5 %) |
| Ballistenarm | 24 / 40 / 66 / 108 | 20 / 34 / 57 / 93 | −16,7 % / −15 % / −13,6 % / −13,9 % | 353,4/727,3 → 319,0/652,6 (−9,7 % / −10,3 %) |

Die DPS-Prozente sind kleiner als die Damage-Prozente, weil das Referenzmodell auch feste Terme und Kritbeiträge enthält; die Damage-Änderung ist die eigentliche Balance-Änderung.

**Kurzbegründung:**

- **Kältekompresse:** niedrigste Projektilsreferenz, P1/P1. Der Buff hebt die Referenz-DPS um 28,6 % / 30,5 %, ohne den 30–40-%-Slow und die Regen-Skalierung zu verstärken; sie bleibt bewusst unter dem Median. Im Lauf danach: 414 Schaden genommen (deutlich unter dem Sample-Mittel), Welle 20 in 34,02 s.
- **Runenstab:** P6/P3, Burn 6–20. Der Buff adressiert die direkte Trefferbasis; Burn-Uptime bleibt Utility und wird vom Referenzmodell nicht voll bewertet.
- **Blitzspeer:** T2 war mit P4 zu schwach, T3 mit P16 bereits im Rahmen. Der Buff hebt vor allem T2 an, ohne die T3-Skalierung zu übertreiben.
- **Ballistenarm:** höchste Projektilsreferenz (1,36/1,71), P79 bei T3. Die Nerf-Runde senkt sie auf 1,23/1,53 (P44/P73), lässt aber Reichweite 620–780, Pierce 3–4 und Armor-Pierce 25–35 % als Premium-Profil stehen. Kein weiterer Nerf, weil der Lauf mit 42,5 s nicht trivialisiert.

> **Hinweis zur Methodik:** Ein Zwischenstand hatte versehentlich `tiers[i][2]` (Range) statt `[0]` (Damage) geändert. Die Reichweiten wurden auf die Ausgangswerte zurückgesetzt (330/360/395/435, 380/410/445/490, 340/370/405/445, 620/670/720/780). Der finale Diff enthält nur Damage-Änderungen.

## Nachher: alle 15 im Überblick

### Referenz-DPS

| Waffe | Typ | T2 | × Typ | P | T3 | × Typ | P |
|---|---|---:|---:|---:|---:|---:|---:|
| Klingenbrecher | melee | 494 | 1,21 | P81 | 623 | 1,05 | P70 |
| Splitterklinge | projectile | 438 | 1,69 | P76 | 603 | 1,41 | P67 |
| Granatkolben | projectile | 252 | 0,97 | P26 | 361 | 0,85 | P21 |
| Pistolenkolben | projectile | 203 | 0,78 | P10 | 324 | 0,76 | P13 |
| Kältekompresse | projectile | 151 | 0,58 | P3 | 218 | 0,51 | P1 |
| Runenstab | projectile | 178 | 0,69 | P6 | 248 | 0,58 | P4 |
| Blitzspeer | projectile | 176 | 0,68 | P4 | 355 | 0,83 | P20 |
| Belagerungsbombe | projectile | 204 | 0,78 | P11 | 291 | 0,68 | P7 |
| Knochenflinte | projectile | 191 | 0,74 | P7 | 340 | 0,80 | P16 |
| Sanitätsramme | melee | 300 | 0,73 | P34 | 423 | 0,71 | P29 |
| Streitkolben | melee | 335 | 0,82 | P49 | 494 | 0,83 | P39 |
| Ballistenarm | projectile | 319 | 1,23 | P44 | 653 | 1,53 | P73 |
| Mammutkeule | melee | 389 | 0,95 | P63 | 589 | 0,99 | P61 |
| Bollwerkbanner | melee | 277 | 0,68 | P31 | 384 | 0,65 | P24 |
| Knochenbogen | projectile | 260 | 1,00 | P27 | 509 | 1,19 | P43 |

### Laufdaten

`W20-DPS` ist der auf die Waffe entfallende Schaden in Welle 20 pro Sekunde, bei mehreren Kopien über alle Kopien. `W20-s` ist die Spielzeit der Welle; das reguläre Fenster ist 34 s, alles darüber ist Overtime. `genommen` ist der gesamte Laufschaden.

| Waffe | Kopien | Anteil ges. | Anteil/Kopie | W20-DPS | W20-s | genommen |
|---|---:|---:|---:|---:|---:|---:|
| Klingenbrecher | 1 | 70,0 % | 70,0 % | 2492,1 | 37,42 | 531 |
| Splitterklinge | 1 | 20,2 % | 20,2 % | 454,7 | 39,62 | 612 |
| Granatkolben | 1 | 11,6 % | 11,6 % | 284,4 | 48,05 | 507 |
| Pistolenkolben | 1 | 15,9 % | 15,9 % | 305,5 | 85,98 | 1306 |
| Kältekompresse | 1 | 9,1 % | 9,1 % | 638,0 | 34,02 | 414 |
| Runenstab | 1 | 14,1 % | 14,1 % | 273,8 | 41,28 | 991 |
| Blitzspeer | 1 | 20,7 % | 20,7 % | 1060,8 | 34,02 | 633 |
| Belagerungsbombe | 1 | 24,9 % | 24,9 % | 555,0 | 93,95 | 896 |
| Knochenflinte | 1 | 17,0 % | 17,0 % | 524,2 | 140,02 | 1390 |
| Sanitätsramme | 1 | 31,9 % | 31,9 % | 1191,9 | 34,02 | 433 |
| Streitkolben | 1 | 42,9 % | 42,9 % | 2199,5 | 34,02 | 341 |
| Ballistenarm | 1 | 46,4 % | 46,4 % | 1339,7 | 42,53 | 937 |
| Mammutkeule | 2 | 96,4 % | 48,2 % | 4876,0 | 38,05 | 371 |
| Bollwerkbanner | 2 | 85,3 % | 42,6 % | 2713,8 | 65,07 | 451 |
| Knochenbogen | 1 | 33,9 % | 33,9 % | 667,1 | 62,60 | 1035 |

**Vollständigkeit:** 15/15 `completed20`, 0 Fehlschläge, 0 Overtime-Caps, beide Bosse besiegt (kein `bossHpFrac > 0` in den finalen Läufen).

### Die vier Anpassungen im Lauf

| Waffe | Anteil vorher → nachher | W20-DPS vorher → nachher | W20-s vorher → nachher | genommen vorher → nachher |
|---|---:|---:|---:|---:|
| Kältekompresse | 8,8 % → 9,1 % | 217,5 → 638,0 | 56,70 → 34,02 | 851 → 414 |
| Runenstab | 11,3 % → 14,1 % | 125,5 → 273,8 | 121,68 → 41,28 | 910 → 991 |
| Blitzspeer | 17,6 % → 20,7 % | 504,6 → 1060,8 | 97,38 → 34,02 | 1401 → 633 |
| Ballistenarm | 49,4 % → 46,4 % | 803,4 → 1339,7 | 71,50 → 42,53 | 1883 → 937 |

**Wichtig:** Die Vorher-/Nachher-Läufe sind keine kontrollierte Paarung. Der Shop baut unterschiedliche Builds, und der Pilot/Harness wurde zwischen den Serien verfeinert; deshalb kann der Ballistenarm trotz Damage-Nerf im Nachher-Lauf mehr W20-DPS zeigen. Die belastbare, gepaarte Messung ist die Referenz-DPS oben. Die Läufe dienen der Vollständigkeits- und Plausibilitätsprüfung.

**Sample-Mittel (nicht kausal):** W20-Waffenschaden/s 871,5 → 1305,1; W20-Zeit 67,9 s → 55,4 s; genommener Schaden 860 → 723; Anteil 33,8 % → 36,0 %. Die Streuung zwischen den Builds ist groß; das sind keine Effektgrößen.

## Was auffällt, aber nicht angepasst wurde

- **Klingenbrecher:** 70,0 % Anteil mit **einer** Kopie sieht hoch aus, ist aber kein Stat-Ausreißer: T2/T3 1,21/1,05 (P81/P70), Welle 20 in 37,42 s (reguläres Fenster 34 s), 531 Schaden genommen – mehr als Streitkolben (341) und nicht schneller. Der Anteil entsteht aus einem Build, der alle Melee-Upgrades auf diese eine Waffe legt. Kein Nerf ohne Referenz- oder Lauf-Evidenz.
- **Mammutkeule:** 96,4 % aggregiert, aber **zwei** Kopien → 48,2 % je Kopie; T2/T3 0,95/0,99, Welle 20 in 38,05 s. Der aggregierte Anteil ist ein Kopien-Artefakt, kein Beleg für eine überlegene Einzelwaffe.
- **Bollwerkbanner:** 85,3 % aggregiert, **zwei** Kopien → 42,6 % je Kopie; T2/T3 0,68/0,65 (unter dem Median), Welle 20 in 65,07 s. Das Profil ist Utility/CC, nicht Rohschaden. Kein Nerf.
- **Splitterklinge:** T2 1,69 (P76) sieht hoch aus, T3 1,41 (P67) liegt im Band; 20,2 % Anteil, 39,62 s, 612 genommen. Das Explosionsmodell kann den Einzelzielwert überschätzen; ohne Lauf-Evidenz kein Nerf.
- **Kältekompresse (Rest):** bleibt mit P3/P1 die niedrigste Referenz-DPS. Sie ist die Kontrollwaffe des Sets: 40 % Slow für 2,4 s auf T4, Regen-Skalierung, 414 genommener Schaden (deutlich unter dem Sample-Mittel 723), 34,02 s. Ein weiterer Rohdamage-Buff würde die Kontrolle überproportional verstärken; der nächste Hebel wäre Slow-Uptime/Utility, nicht Damage.
- **Runenstab (Rest):** P6/P4, Burn 6–20, 41,28 s, 991 genommen. Burn-Uptime und Flächennutzen sind im Referenzmodell nicht voll abgebildet; ohne Telemetrie kein weiterer Buff.
- Die übrigen Waffen liegen im Typband; keine Änderung.

## Crashfix im Charm-Pfad

Fund während der vollständigen Läufe: Ein charmierter Burrower kann ein anderes Enemy als Ziel wählen. Der Code rief in diesem Fall `tgt.damage()` auf, eine Methode, die nur der Player besitzt. Das beendete den Lauf mit einem `TypeError`.

Fix in `index.html` (7500–7501): Wenn `tgt.damage` vorhanden ist, bleibt der Player-Pfad; sonst fällt der Angriff auf `tgt.hurt(bd, false, this, 'melee')` zurück. Der Fix ändert keine Waffenwerte und keinen normalen Player-Schadenspfad; er verhindert nur den Abbruch bei freundlich gesinnten Enemies.

## Verifikation

- Finaler Nachher-Report: **15/15** vollständig, **0** Fehlschläge, **0** Overtime-Caps, beide Bosse ohne Rest-HP.
- `node tools/verify.mjs`: **212 pass / 0 fail / 0 skip**.
- `node --check tools/hybrid-weapons-20waves.mjs`: sauber.
- `git diff --check`: sauber.
- Der Arbeitsstand ist **uncommitted**; es wurde nichts gepusht oder committet.

## Reproduktion

```bash
# Alle 15 Hybrid-Waffen, vollständiger 20-Wellen-Lauf
node tools/hybrid-weapons-20waves.mjs \
  --tag after \
  --out docs/pw/hybrid-weapons-20w-after.json

# Einzelne Waffe
node tools/hybrid-weapons-20waves.mjs --weapons kaeltekompresse

# Vorher-Report: derselbe Befehl mit dem Datenstand vor den vier Änderungen
# (Datei: docs/pw/hybrid-weapons-20w-before.json, interner Tag "baseline6")
```

## Grenzen

- Ein Seed, ein Charakter (Leonidas), Danger 2 und eine Shop-Politik. Das ist ein reproduzierbarer Vergleich, keine Stichprobe über alle Spielweisen.
- Die Vorher-/Nachher-Läufe sind Einzelläufe mit unterschiedlichen Builds; sie sind keine kontrollierte Effektmessung. Die Referenz-DPS ist die gepaarte, build-unabhängige Messung.
- Der feste Pilot ist nicht für jeden Archetyp gleich gut geeignet; die Spannweite der W20-Zeit (34–140 s) zeigt das. Alle Läufe schließen ab, aber die Zeit ist nicht allein von der Waffe verursacht.
- Kein menschlicher Feel-Test. Besonders Utility-Waffen (Slow, Burn, CC) brauchen Telemetrie aus echten Runs, um ihren Nutzen jenseits der Roh-DPS zu bewerten.
- Der Pass beansprucht keine perfekte Balance; er entfernt die vier klar belegten Ausreißer und dokumentiert die begründeten Nicht-Änderungen.

## Dateien

- `docs/pw/hybrid-weapons-20w-before.json` – Vorher-Report (15/15, Referenz + Läufe)
- `docs/pw/hybrid-weapons-20w-after.json` – Nachher-Report (15/15, Referenz + Läufe)
- `tools/hybrid-weapons-20waves.mjs` – Harness, Support-Baseline, Pilot, Boss-Fokus, 240-s-Cap, Referenz-Export
- `data.js` – vier Hybrid-Tier-Zeilen, nur Damage
- `index.html` – Charm-Crashfix im Burrower-Pfad
- `docs/pw/hybrid-weapons-20w-balance-pass.md` – dieses Dokument
