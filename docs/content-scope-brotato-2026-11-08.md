# Inhalt, Umfang und Funktionen gegen Brotato (2026-11-08)

Auftrag: das Spiel in Inhalt, Umfang und Funktionen an **Brotato (neueste
Fassung, alle Addons)** heranführen oder mit eigenen Innovationen übertreffen.
Dieser Schritt liefert dafür drei Dinge: eine **gemessene Bestandsaufnahme**,
ein **Zielbild mit Abnahmekriterien** und eine **getestete Innovation**
(„Stadtgeschichte"). Der P0-Patch und die Paritäts-Erweiterung haben den zuvor eingefrorenen
HTML-Umfang gezielt erweitert; die neuen Inhalte sind in `data.js` und der
Engine spielbar. Die Stadtgeschichte ist inzwischen im HTML-Regelkern aktiv
und gegen die Waffenmeta gemessen (Abschnitt 6).

**Nachtrag 2026-11-09 — Gegnerparität:** Die Basisriege wuchs von 28 auf 51
Typen; live stehen **83** (51 + 32 Kampagne), exakt der Brotato-Referenzwert.
23 neue Typen sind über die echten Basis- und Kampagnen-Spawnpfade erreichbar.
Nachweis: `docs/pw/enemy-roster-playtest.json` (echter `Game.startRun()`,
Welle 20, 131 neue Gegner in der Queue, 8 neue Typen auf dem Feld, Kill/XP/Loot).

Kurzfassung: 405 Datensätze, 81 Waffen, 125 Items, 44 Charaktere, 51 Basisgegner
(83 live inkl. 32 Kampagnengegner), 8 Arenen, 10 Bosse, 9 Gefahrenstufen, Gegner-Deckel 100. Alle elf Waffenklassen tragen einen 6-Slot-Mono-Build,
55 von 55 Klassenpaaren sind abgedeckt, jede Arena hat einen Boss. Der Item-Pool
liegt bei 125 (31/31/32/31, 12 verflucht) und deckt alle 24 Stats ab. Alle sechs
Abnahme-Gates sind grün (siehe 5.); 0 gebrochene Verweise.

## 1. Ist-Messung

Quelle ist `data.js`, gemessen mit `tools/content-scope.mjs`; der
maschinenlesbare Report liegt in `docs/pw/content-scope.json`.

| Größe | Wert |
| --- | ---: |
| Charaktere | 44 (4 gesperrt, 40 sofort wählbar) |
| Waffen | 81 (65 sofort freigeschaltet, 16 gesperrt), 4 Tiers je Waffe |
| Items | 125 |
| Gegner | 51 Basis / 83 live (mit Kampagne) |
| Arenen | 8 |
| Bosse | 10 |
| Gefahrenstufen | 9 (0–8) |
| Mods | 9 |
| Erfolge | 36 |
| **Datensätze gesamt** | **405** |

### Waffen und Build-Raum

| Klasse | Waffen | sofort verfügbar | 6-Slot-Mono-Build |
| --- | ---: | ---: | --- |
| gun | 19 | 12 | ja |
| support | 20 | 16 | ja |
| heavy | 18 | 14 | ja |
| elemental | 16 | 12 | ja |
| precise | 14 | 10 | ja |
| explosive | 12 | 7 | ja |
| blade | 11 | 11 | ja |
| blunt | 12 | 12 | ja |
| medieval | 10 | 8 | ja |
| primitive | 10 | 9 | ja |
| medical | 9 | 8 | ja |

- **11 Klassen**, 81 Waffen (65 sofort freigeschaltet, 16 gesperrt), keine Tier-Auffälligkeit (jede Waffe hat vier
  Stufen mit steigendem Preis).
- **208.287** Mono-Klasse-6er-Kombinationen (Summe von C(n,6) je Klasse). Das ist
  eine Kombinationszahl, keine Aussage über Spielbarkeit.
- **55 von 55** möglichen Klassenpaaren sind vertreten; alle 15 zuvor offenen
  Paare haben jetzt mindestens eine Waffe.
- Keine Charakter-Synergie liegt noch unter sechs Waffen; alle 44 Charaktere
  können ihre 2×-Synergie bis zum 6-Slot-Bonus ausbauen.
- Die 15 neuen Zwei-Klassen-Waffen sind `unlockDefault: true`; der
  Shop-Pool (`weaponPool()`) liefert alle nicht-legendären Waffen mit diesem
  Flag, damit sind sie im normalen Shop erreichbar: Klingenbrecher (blade+blunt), Splitterklinge
  (blade+explosive), Granatkolben (blunt+explosive), Pistolenkolben
  (blunt+gun), Kältekompresse (elemental+medical), Runenstab
  (elemental+medieval), Blitzspeer (elemental+primitive), Belagerungsbombe
  (explosive+medieval), Knochenflinte (gun+primitive), Sanitätsramme
  (heavy+medical), Streitkolben (heavy+medieval), Ballistenarm
  (heavy+precise), Mammutkeule (heavy+primitive), Bollwerkbanner
  (heavy+support), Knochenbogen (precise+primitive). Jede Waffe nutzt
  ausschließlich bestehende Schemafelder und trägt zwei echte Klassen. Die Tags
  laufen über `classCounts()` in die vorhandenen `CLASS_BONUS`-Tabellen und
  werden dort auf die Stats angewendet; die Dual-Tags sind damit nicht nur
  Metadaten. Die Skalierung ist an die jeweilige Waffenrolle und die
  Nachbarwaffen der beiden Klassen kalibriert.

### Items

- Rarity 1: 31, Rarity 2: 31, Rarity 3: 32, Rarity 4: 31.
- 12 verfluchte Items, 4 Turm-Items, 4 Dornen-Items.
- **24 von 24 Stats** werden von Items berührt; `abilityRank` (+1 Rang) und
  `abilityCdMod` (−12 %) sind über die neuen Items `rangliste` und `taktgeber`
  abgedeckt und wirken im Spiel.
- **125 Items, 25 je Veedel**: Feuerwehr, Kurpark, Rheinufer, Labor und
  Innenstadt tragen nach der Erweiterung je 24 Einträge. Die 47 neuen IDs sind
  in `ITEM_FAMILY_MEMBERS` registriert; die Familie bleibt damit eine echte
  Zuordnung und nicht nur Anzeigetext.
- **Shop-erreichbar**: `ShopSystem.generate()` filtert `ITEMS` nach `r` und
  Preis; eine separate Item-Pool-Registrierung gibt es nicht. Jedes Item läuft
  damit durch dieselben Rarity-, Preis- und Reroll-Regeln wie die 73 alten.
- **Darstellung**: Das bestehende Item-Schema und die Shop-/Codex-Karten haben
  kein Icon-Feld; sie zeigen Name, Rarity, Stats, Flavor und Familie als Text.
  Die neuen Items folgen diesem Stil; ein paralleles Icon-System wurde nicht
  eingeführt.

### Charaktere

- 44 Charaktere, davon 4 gesperrt und 40 sofort wählbar; die vier alten
  Schwellen (20 Wellen, 3 Bosse, 100 Kills, 10 Siege) sind unverändert.
- Keine Synergieklasse liegt unter 6 Waffen.
- Keine Fähigkeits-ID ist doppelt vergeben. Die fünf Paare `phasendash`,
  `markierung`, `walla`, `festnahme` und `kralle` wurden aufgelöst; `kralle`
  bleibt für den Ritter (Schildwall), der Barbar nutzt `barbarenwut`.

### Gegner, Arenen, Bosse

- **19 KI-Familien** für 51 Basisgegner. Basis-Typen pro Welle: 3 (Welle 1), 18 (Welle 5),
  43 (Welle 10), 50 (Welle 20); live kommen 32 Kampagnengegner hinzu (83 gesamt). `shardling` erscheint nur als Split-Spawn von
  `spliter` (minW 999) und ist deshalb kein toter Inhalt.
- 8 Arenen. Jede Arena hat mindestens einen Boss: Kurpark und Rheingau je
  einen, Innenstadt und Neroberg je zwei, die übrigen je einen.
- 10 Bosse mit durchschnittlich 3 Phasen und 16 verschiedenen Phasenmustern.

## 2. Brotato-Maßstab

Brotato, aktueller Patch mit beiden Addons, laut angegebenen Quellen:

| Größe | Wert |
| --- | ---: |
| Waffen | 62 |
| Charaktere | 44 (Komplettlösung, inkl. DLC) |
| Gegner | 83 wellenbenannte Gegner |
| Zonen | 3 (Crash Zone, The Abyss, The Jungle) |
| Wellen pro Lauf | 20 (20–90 s) |
| Waffenslots | 6 |
| Gefahrenstufen | Danger 0–5 |
| Gegner gleichzeitig | 100 |
| Koop | 2 lokal (Switch 2: 4) |
| Items | „Hunderte" (keine belastbare Einzelzahl) |

DLC 1 *Abyssal Terrors* brachte die Zone *The Abyss* und die **Curse**-Stat;
DLC 2 *Primal Dread* (2026) eine 20-Wellen-Dschungelkarte, 3 Charaktere,
17 Waffen, über 30 Items, 3 Pets und die **Evolution**-Stat.

Quellen: [Fextralife-FAQ](https://brotato.wiki.fextralife.com/FAQ) (62 Waffen,
6 Slots, Danger 0–5), [PSN-Komplettlösung](https://psnprofiles.com/guide/18933-brotato-trophy-guide)
(44 Charaktere), [Fandom-Gegnerliste](https://brotato.fandom.com/wiki/Enemies)
(83 Gegner), [Wiki Enemies](https://brotato.wiki.spellsandguns.com/Enemies)
(100 gleichzeitig), [Nintendo](https://www.nintendo.com/au/games/nintendo-switch/brotato)
(6 Slots, 20–90 s, 2P, Barrierefreiheit), [Nintendo Switch 2](https://www.nintendo.com/au/games/nintendo-switch-2/brotato-nintendo-switch-2-edition)
(4P), [Primal Dread](https://store.steampowered.com/app/4498220/Brotato_Primal_Dread) (DLC 2).

Die Zahlen sind Vergleichsmaßstab, keine Qualitätsaussage: 71 gute Waffen
können mehr Builds tragen als 62 schlechte. Die Messung zeigt nur, wo der
**Rohstoff** für Builds fehlt.

## 3. Lücken

| Größe | Wiesbaden Survivors | Brotato | Delta / Ziel |
| --- | ---: | ---: | --- |
| Waffen | 81 | 62 | **Parität übertroffen (+19)** |
| Klassen unter 6 Waffen | 0 | — | erreicht |
| Klassenpaare | 55/55 | — | **55/55 erreicht** |
| Charaktere | 44 | 44 | **Parität erreicht (44/44, 0 offen)** |
| Gegner | 51 Basis / 83 live | 83 | **Parität erreicht (83 = 51 + 32)** |
| Gegner gleichzeitig | **100** | 100 | **Parität erreicht (100/100; vorher 50 klassisch / 70 Kampagne)** |
| Bosse | 10 | pro Zone | 10 (Ziel) |
| Arenen ohne Boss | 0 | 0 | 0 |
| Items | 125 | hunderte | 125 erreicht (31/31/32/31, 12 verflucht) |
| Stats mit Item-Abdeckung | 24/24 | — | erreicht |
| Wellen | 20 | 20 pro Zone | 5 × 20 = 100 |
| Elite-/Hordenwellen | **4/4 live** (11/12/14/15 ab Danger 3) | 4 (hohe Danger) | erreicht; Plan 77/35/100/40 gegen Kontrolle 43/46/50/53, Event-Material 59/79/73/106 |
| Slots | 6 | 6 | 6 |
| Gefahrenstufen | 9 | 6 | 9 behalten |
| Koop | 2 lokal + online | 2 lokal (4 auf Switch 2) | 2, 4 nur mit Nachweis |

Der größte inhaltliche Hebel ist nicht die Gesamtzahl, sondern die **Verteilung**:
alle elf Klassen tragen einen vollen 6-Slot-Build, und alle 55 Klassenpaare
sind vertreten. Die Waffenparität ist damit übertroffen; die Gegnerparität ist
mit **83 live** (51 Basis + 32 Kampagne) erreicht. Der nächste Ausbauschritt
liegt bei Item-Tiefe und Meta, nicht beim Aufblähen der Waffenliste: Die
Charakterparität ist mit **44/44** erreicht.
Die Fünf-Viertel-Live-Kampagne (Abschnitt 5.1) enthält 83 Gegner und ist in
`data.js`/`index.html` verdrahtet; 23 neue Basisgegner und die 32 Kampagnengegner
teilen sich dieselben 19 KI-Familien.

## 4. Funktionsmatrix

| Funktion | Wiesbaden Survivors | Brotato | Ziel Nachfolger |
| --- | --- | --- | --- |
| 6 Waffenslots | vorhanden (`BROTATO_RULES.maxWeapons = 6`) | vorhanden | 6 |
| Shop mit 6 Angeboten + Rerolls | vorhanden | vorhanden | vorhanden |
| Auto-Fire | vorhanden | vorhanden | vorhanden |
| 20 Wellen + Endlos | vorhanden | vorhanden | 20 + Endlos |
| Gefahrenstufen | 9 (0–8) | 6 (0–5) | 9 behalten |
| Koop | 2, lokal + online | 2 lokal (4 Switch 2) | 2; 4 nur nach Messung |
| Gegner-Deckel | **100** (`BROTATO_RULES.maxEnemiesOnScreen`) | 100 | 100 |
| Seed / Tages-Seed | vorhanden | — | beibehalten |
| Screenreader-Kontrakt | vorhanden | — | in UMG erhalten |
| Barrierefreiheits-Regler (HP/DMG/Speed) | **3 live**: HP 50–150 %, DMG 50–150 % (je 10 %), Speed 1–10; persistent | vorhanden | 3 Regler |
| Curse | 6 verfluchte Items | Curse-Stat (DLC 1) | Item-Flüche ausbauen |
| Evolution | **ja** — Stadtgeschichte: 7 Linien, 14 Teile, Stufen 5/10/15 | Evolution-Stat (DLC 2) | Stadtgeschichte |
| Pets | **vorhanden** (4 Pets, Drops, Stats, Angriffe) | 3 Pets (DLC 2) | vorhanden |
| Zonenstruktur | 8 Arenen, **eine** 20-Wellen-Kampagne | 3 Zonen × 20 Wellen | 5 Viertel × 20 Wellen |
| Eliten/Horden | **4 eigene Wellen** (11/12/14/15, ab Danger 3; Horden ×1,8/×2,0, Eliten ×0,75 mit Elite-Rate 0,18/0,20, Material 45/60/55/80), live gemessen | Wellen 11/12/14/15 (hohe Danger) | 4 Elite-/Hordenwellen |
| Leaderboard | **fehlt** | — | optional |
| Erfolge / Mods | 36 / 9 | Freischaltungen | beibehalten |

## 5. Zielbild: fünf Viertel × 20 Wellen

| Viertel | Arena | Modifikatoren | Signaturklassen | Bosse im Entwurf (Welle) |
| --- | --- | --- | --- | --- |
| Kurpark | `kurpark` | `offene_flaechen`, `giftfelder` | primitive, medical | kurparkhueter@10, thermalquelle@20 (Gast) |
| Innenstadt | `innenstadt` | `enge_gassen`, `sichtlinien` | gun, precise | kurhaus@10, marktturm@20 |
| Rheinufer | `rheinufer` | `weite_sicht`, `treibende_pontons` | elemental, support | nerobahn@10, sirenkollektiv@20 (Gast) |
| Neroberg | `neroberg` | `engstellen`, `hoehenwind` | heavy, blunt | rogueki@10, bergbahn@20 |
| Rheingau | `rheingau` | `weinberg_terrassen`, `weinfelder` | blade, medieval | rheingaurebe@10, kochbrunnen@20 (Gast) |

Die Boss-Spalte ist die Live-Zuordnung; die drei Gastbosse behalten ihre
Heimatarena außerhalb der fünf Viertel und treten in der jeweiligen
Viertelarena auf.

**Ausbauziele** (Design-Ziele, keine Behauptung, dass Brotato-Parität damit
erreicht ist):

- **Waffen 62**: übertroffen mit 81 (65 sofort freigeschaltet). Die 15 neuen
  Zwei-Klassen-Waffen schließen alle 55 Paare; die früheren 14 Lücken-Waffen
  bleiben erhalten.
- **Items 125**: **erreicht**; 73 → 125 (+52), 31/31/32/31 je Rarity, davon
  12 verflucht, 25 je Veedel. Brotato nennt „hunderte"; 125 ist die erste
  produzierbare Stufe, nicht das Endziel.
- **Charaktere 44**: **erreicht** (24 → 32 → 44; zuletzt +12 am 2026-11-09).
  Jeder Held hat eine eigene Fähigkeits-ID, eine vorhandene Startwaffe, ein
  eigenes Profil und einen echten Ability-Switch-Zweig; 40/44 sind sofort
  wählbar. Die zuvor 6 unterversorgten Synergien sind geschlossen.
- **Gegner 83**: **erreicht** (51 Basis + 32 Kampagne; +23 neue Basisgegner);
  **24 KI-Familien** statt 19. Das Live-Paket liegt in
  `content/fuenf-viertel.json` (`status: live`, `engineWired: true`) und ist
  mit 14 Tests, 19 Audit-Gates und einem 100-Wellen-Playtest prüfbar.
- **Gegner-Deckel 100**: **erreicht**; `BROTATO_RULES.maxEnemiesOnScreen = 100`
  gilt für klassische und Kampagnen-Spawnpläne sowie den Spawn-Loop. Gemessen:
  W11 70→77, W14 70→100, klassisch W3 50→84; Queue-Reste 7/30/34→0;
  Logik-p99 0,5–1,4 ms. Vorher/Nachher in Abschnitt 13.
- **Bosse 10**: erreicht; jede Arena hat mindestens einen, Innenstadt und Neroberg je zwei.
- **100 Wellen**: 5 × 20, dazu vier Elite-/Hordenwellen (11/12/14/15) auf hohen
  Gefahrenstufen — **umgesetzt und live gemessen**. Ab Danger 3 tragen sie
  eigene Events: Horden ×1,8/×2,0, Elitewellen ×0,75 mit Elite-Rate 0,18/0,20,
  Abschlussmaterial 45/60/55/80 (mit Danger-3-Preisfaktor 1,32 gemessen:
  59/79/73/106). Die Live-Kampagne übernimmt Mult und Elite-Rate in
  `buildCampaignSpawnPlan()`; Welle 15 ist bewusst **keine** Bosswelle.
  Rohwerte: Plan 77/35/100/40 gegen Kontrolle 43/46/50/53 (Abschnitt 8).
- **Wellen 1**: mindestens 5 Gegnertypen statt 3.
- **Stats 24/24**: erreicht; Items für `abilityRank` und `abilityCdMod` sind vorhanden.
- **Klassenpaare 55/55**, alle 11 Klassen ≥ 6 Waffen: erreicht.

**Abnahmekriterien** (maschinell geprüft):

1. `tools/content-scope.mjs` endet mit **6/6 Gates** und 0 gebrochenen
   Verweisen. Heute: **6/6** (0 gebrochene Verweise).
2. Jede Klasse hat ≥ 6 Waffen; das Klassenpaar-Ziel ist vollständig erreicht:
   blade 11, blunt 11, elemental 16, explosive 12, gun 18, heavy 17, medical 9,
   medieval 10, precise 14, primitive 10, support 17; Klassenpaare 55/55.
3. Jede Arena hat einen Boss; jede Fähigkeits-ID ist eindeutig: erreicht.
4. Alle 24 Stats kommen in Items vor: erreicht (24/24).
5. Balance-Simulation: je Klasse mindestens ein Build innerhalb von 5 % der
   besten Siegquote. Stadtgeschichte: stärkste Linie ≤ ein Waffentier +25 %
   DPS (gemessen 0,82–1,21 gegen Tier-Ref 49,5 %); jede Linie +0,5 bis
   +4,46 Wellen, alle sieben zusammen +4,46 (Run-Modell-Deckel 16,88).
6. 4-Spieler-Koop erst, wenn die Simulation vier Spieler trägt und die
   Frame-Zeit unter Last hält — vorher nicht.
7. Fünf-Viertel-Live-Kampagne: `node tools/fuenf-viertel-audit.mjs` = **19/19
   Gates**, 0 Failures; `node --test tools/content-fuenf-viertel.test.mjs` =
   **14/14**; `node tools/fuenf-viertel-playtest.mjs` = **PASS** (100 Wellen,
   10 Bosse, 3 Gastbosse, 32 Entwurfsgegner, 5 KI-Familien).

8. Elite-/Hordenwellen: `node tools/elite-waves-playtest.mjs` endet grün mit
   **4/4 Events** und **8/8 Prüfungen je Welle** plus Shop-Übergang. Danger 0–2
   liefern `null`, Danger 3 `horde/elite/horde/elite`, Welle 13 bleibt normal.
   Die gemessenen Rohwerte (Plan/Kontrolle, Live-Eliten, Bedrohung, Material)
   stehen in Abschnitt 8.

### 5.1 Live-Kampagne Fünf Viertel (Stand 2026-11-08)

Die Fünf-Viertel-Kampagne ist kein separater Entwurf mehr, sondern läuft im
Spiel. `content/fuenf-viertel.json` (`schema: wbn-fuenf-viertel/1`,
`status: live`, `engineWired: true`, `pending: []`) ist die Autorenquelle.
`node tools/build-fuenf-viertel.mjs` erzeugt daraus den klassischen
Browser-Mirror `content/fuenf-viertel.data.js`; `index.html` lädt ihn vor
`data.js`. `data.js` exportiert `FUENF_VIERTEL`, `CAMPAIGN_ENEMIES` und
`CAMPAIGN_ENEMY_BY_ID`. Die 51 `ENEMIES` sind der live erweiterte Basiskatalog;
23 neue Typen teilen sich die bestehenden 19 KI-Familien, die 32 Kampagnengegner
bleiben ein separater, testgesicherter Katalog.

| Prüfpunkt | Wert |
| --- | --- |
| Viertel | 5 (`kurpark`, `innenstadt`, `rheinufer`, `neroberg`, `rheingau`) |
| Wellen | 100 = 5 × 20, global 1–100; `Game.wave` bleibt lokal 1–20 |
| Gegner | 83 = 51 aus `data.js` + 32 Kampagnengegner; 82 spawnbar, 1 split-only (`shardling`) |
| Bosse | 10, zwei pro Viertel auf Welle 10/20; 3 Gastauftritte |
| Modifikatoren | 10, zwei pro Viertel, alle mit Engine-Wirkung |
| KI-Familien | 24 = 19 bestehende + 5 live (`burrower`, `trapper`, `tether`, `commander`, `sniper`) |
| Wellenform | Wellen 1–4: 5 Gegnertypen; ab Welle 5: 6; jede Welle mit Count/Elite |

**Kampagnenschleife:** `Game.startRun()` startet in Viertel 1. `Game.startWave(n)`
nimmt global 1–100 an, setzt bei Bedarf das Viertel und rechnet intern auf die
lokale Welle 1–20 herunter. `Game.nextWave()` schreibt immer
`campaign.globalWave + 1` fort: nach lokaler Welle 20 wechselt das Viertel,
nach global 100 endet der Run mit Sieg. Bosswellen sind ausschließlich lokal
10 (`d.bosses[0]`) und 20 (`d.bosses[1]`); die fünf Viertelarenen bleiben die
Kampfarenen. Die drei Gastbosse `thermalquelle`, `sirenkollektiv` und
`kochbrunnen` behalten ihre Heimatarena als Datenfeld, werden aber in der
Viertelarena gespawnt und über den normalen Boss-Tod aufgelöst.

**Modifikatoren (echte Wirkung, nicht HUD):** `Player.recalc()` verrechnet
Range/Speed/Crit/Dodge als Prozentpunkte sowie Harvest/HP-Regen als konkrete
Statpunkte; `Enemy.spawn()` wendet Enemy-Speed/Damage an, der Kampagnenplan
Enemy-Count; `spawnProjectile`/`spawnEnemyBullet` skalieren Projektilgeschwindigkeit;
`applyCampaignWorld()` erzeugt Deckung über Fässer, Gift-/Wasserfelder über
`hazObjs`, bewegt Wände schneller, setzt Sichtlinien für Fernkampf und
Höhen-/Ernte-Flags. `Game.endWave()` multipliziert die Ernte bei aktivem
Harvest-Flag. Die zehn Mods sind damit an Spieler-, Gegner- und Weltzustand
angebunden.

**Neue KI:** `Enemy.update()` besitzt echte Fälle für `burrower` (Graben und
Neuauftauchen mit Vorwarnung), `trapper` (Fallenfeld mit Slow/Schaden),
`tether` (Bindung, Slow und Lebensentzug), `commander` (Verbündeten-Buff) und
`sniper` (lange Zielphase, Sichtlinienprüfung, harter Schuss). Alle fünf werden
im Kampagnenplan gespawnt und im Playtest über ihre Zähler belegt.

**Maschineller Nachweis (frisch gelaufen):**

- `node --test tools/content-fuenf-viertel.test.mjs` = **14/14**.
- `node tools/fuenf-viertel-audit.mjs` = **19/19 Gates**, 0 Failures,
  Report `docs/pw/fuenf-viertel.json`.
- `node tools/fuenf-viertel-playtest.mjs` = **PASS**; Report
  `docs/pw/fuenf-viertel-playtest.json` belegt 100/100 Wellen, 10/10 Bosse
  (Welle 10/20 je Viertel), 3/3 Gastbosse, 32/32 Entwurfsgegner und alle fünf
  KI-Familien mit Zählern. Der Lauf nutzt `Game.startRun`, `startWave`,
  `nextWave`, `endWave`, `spawnAtPoint`, `Enemy.update` und `Enemy.die`.
- Der Browser startet über `index.html` ohne Console-/Page-Fehler; das HUD
  zeigt `VIERTEL 1/5 · Kurpark · WELLE 1/20 · GESAMT 1/100` und wechselt mit
  dem Viertel.

**Grenze:** Der Headless-Lauf ist ein deterministischer Engine-/Ablaufnachweis,
kein menschlicher 20-Wellen-Kampf und keine Balance-Messung. Er belegt
Übergänge, Bossplatzierung, Mod-Wirkung, Spawns und KI-Verhalten, nicht
Spielgefühl oder Langzeitbalance.

## 6. Innovation „Stadtgeschichte"

Ein deterministisches Item-Fusionssystem, kein Kopie-Versuch der
Brotato-Evolution: Zwei Items einer Linie verschmelzen bei Welle 5, 10 und 15
zu einer stärkeren Stufe. Die Regeln liegen als reiner, testbarer Kern vor und
sind im HTML-Spiel aktiv: `data.js` hält die Tabelle (`STADTGESCHICHTE`), die
Engine spiegelt den Kern als `Stadtgeschichte`-Objekt, `Player.evolveStadtgeschichte()`
läuft in `Game.endWave()` vor dem Shop, `Player.recalc()` addiert die
Stufen-Stats, und die Basisteile werden beim Aufstieg verbraucht.

| Linie | Teile | Ergebnis |
| --- | --- | --- |
| Kurhaus-Frühstück | Kaffee + Verband | Kurhaus-Menü (Leben, Tempo, Regeneration) |
| Feuerwehr-Ausrüstung | Helm + Handschuhe | Einsatzausrüstung (Rüstung, Leben, Nahkampf) |
| Präzisions-Optik | Zielfernrohr + Lupe | Präzisionsoptik (Reichweite, Krit, Tempo) |
| Wartungsrig | Multitool + Drohne | Wartungsrig (Technik, Angriffstempo, Rüstung) |
| Kurpark-Glück | Kleeblatt + Nerobergluft | Kurpark-Glück (Glück, Ernte, XP) |
| Rheinufer-Set | Rheinkiesel + Sprungfeder | Rheinufer-Set (Rüstung, Rückstoß, Tempo) |
| Klinik-Set | Sanitätskoffer + Blutkonserve | Klinik-Set (Lifesteal, Regeneration, Leben) |

**Regeln:**

- Meilensteine 5/10/15. Stufe 1 verbraucht beide Basisteile; Stufe 2 und 3
  verbrauchen das Evolutions-Item der Vorstufe.
- Aufholregel: Wer bei Welle 5 nicht beide Teile hat, startet bei Welle 10 mit
  Stufe 1 und erreicht bei Welle 15 nur Stufe 2. Ein versäumter Meilenstein
  kostet eine Stufe, nicht die Linie.
- Stats der Evolutionsstufe = Summe der Basisteile + Stufenbonus; Preis =
  Summe der Basisteile + Aufpreis.
- Deterministisch: Linien werden nach ID sortiert abgearbeitet, kein RNG, keine
  Reihenfolgeabhängigkeit. Ein Item darf nur in einer Linie vorkommen; die
  Validierung erzwingt das.
- Ein Exemplar je Zutat wird verbraucht; Duplikate im Inventar bleiben erhalten.

**Umsetzung und Prüfung:**

- `content/stadtgeschichte.json` — Quelle: 7 Linien, 14 Basisteile, 3 Stufen.
- `data.js` — `STADTGESCHICHTE` wird aus der Quelle erzeugt (kein
  `Data.register`, damit die Content-Zählung unverändert bleibt).
- `core/stadtgeschichte.mjs` — Validierung, Stufen-Stats, Preis, reine
  `evolve()`-Funktion.
- `index.html` — `Stadtgeschichte`-Regelobjekt, `Player.evolutions`,
  `Player.evolveStadtgeschichte(wave)`, `recalc()`-Einbindung und
  `endWave()`-Hook vor `nextLevelOrShop()`; Toast/Banner beim Aufstieg.
- `tools/content-stadtgeschichte.test.mjs` — **13 Tests, 13 grün**: Daten
  gültig, Meilensteine, Verbrauch, Stufenaufstieg, Stufenobergrenze,
  Aufholregel, Reihenfolgeunabhängigkeit, Determinismus, Stats/Preis,
  Fehlerfälle, IDs.
- `tools/stadtgeschichte-balance.mjs` — **grün**: 7/7 Kern-/Engine-Paritätsfälle,
  21/21 Stufen-Stats/Preise, echter Wellenfluss 5/10/15 (Teile 0/0, Shop 6/6),
  Klassen-DPS und gepaarte Run-Simulation; Report
  `docs/pw/stadtgeschichte-balance.json`.

**Balance gegen die Waffenmeta** (Danger 2, Seed `0x57ad7`, `BalanceSim`):

- **DPS je Klasse:** Die stärkste abgeschlossene Linie liegt je Klasse bei
  40,5–60,1 % über dem Waffen-T3; der Median eines ganzen Waffentiers ist
  49,5 %. Das ergibt einen Ratio-Korridor von **0,82–1,21** (Grenze 1,25).
  Stärkste Linie ist Optik (reine Offensive), bei support Technik (52,7 %).
- **Gepaarte Läufe:** Basis 48,2 % Sieg / 12,42 Wellen. Die Linien liegen bei
  +4,5 bis +32,7 Siegpunkten und +0,53 bis +4,46 Wellen; alle sieben zusammen
  erreichen +4,46 Wellen / +32,7 Punkte. Das Run-Modell sättigt bei 16,88
  Wellen (Deckel), deshalb prüft das Tool den Korridor 0,4–4,5 Wellen statt
  einer engen Siegquote.
- **Balance-Pass:** fruehstueck, feuerwehr und klinik verlieren defensive
  Boni (maxHp/armor/lifesteal), optik verliert Krit/Kritschaden und gewinnt
  Angriffstempo/Schaden, technik gewinnt Rüstung/maxHp und etwas
  Angriffstempo. Rohwerte und Delta-Tests stehen im Report; die 21
  Stufen-Paritäten sind danach grün.

**Warum das eine eigene Innovation ist:** Brotato führt mit *Primal Dread* eine
Evolution-Stat ein; die genauen Regeln wurden hier nicht geprüft und nicht
übernommen. Die Stadtgeschichte ist eine Item-Linien-Fusion mit
Meilenstein-Fenster und Aufholregel — ein anderes Ökonomie- und
Entscheidungsmodell. Der Kern bleibt engine-neutral; die HTML-Engine spiegelt
ihn byte-gleich (Parität im Tool geprüft), damit der UE-Regelkern ihn als
C++-Port übernehmen kann.

## 7. Optimierungen

1. **Content-Gate in CI.** `tools/content-scope.mjs` läuft in unter einer
   Sekunde und bricht nur bei gebrochenen Verweisen ab; die sechs Gates sind
   der Ausbau-Fahrplan. Damit kann kein Datenedit die Klasslücken unbemerkt
   vergrößern.
2. **Klassenlücken zuerst (erledigt).** Die 14 Lücken-Waffen und die 15
   Zwei-Klassen-Waffen schließen alle fünf Startlücken und alle 55 Paare;
   gleichzeitig sind alle Charakter-Synergien abgedeckt. Das ist der größte
   Build-Raum-Gewinn pro Content-Einheit.
3. **Fähigkeiten entdoppeln (erledigt).** Die fünf geteilten IDs wurden
   aufgelöst; der Ritter behält `kralle`, der Barbar erhält `barbarenwut`.
   Das erhöht die wahrgenommene Charakterzahl ohne neue Modelle.
4. **Stats abdecken (erledigt).** Zwei Items für `abilityRank`/`abilityCdMod`
   heben die Abdeckung auf 24/24 und öffnen Fähigkeits-Builds.
5. **Boss-Lücken schließen (erledigt).** Kurpark und Rheingau haben je einen
   Boss; damit hat jede Arena ein Ziel.
6. **Frühe Wellen vielfältiger.** Welle 1 hat 3 Typen; fünf machen den
   Einstieg lesbarer und die erste Kaufentscheidung relevanter.
7. **KI wiederverwenden.** 19 Familien für 83 Gegner statt 83 Einzel-KIs:
   weniger Code, mehr Wiedererkennbarkeit; Ziel 24 Familien.
8. **Freischaltkurve prüfen.** 16/81 Waffen, aber nur 4/44 Charaktere sind
   gesperrt. Für den Nachfolger sollten Zonen- und Danger-Siege beide Achsen
   öffnen, nicht nur Waffen.
9. **Gegner-Deckel messen (erledigt 2026-11-09).** Der Plan deckelt nicht mehr
   auf 50/70: `BROTATO_RULES.maxEnemiesOnScreen = 100` ist in beiden
   Spawnplänen und im Spawn-Loop aktiv. Gemessen mit `Game.startRun()` +
   `startWave`: W11 70→77, W14 70→100, klassisch W3 50→84, Queue-Reste
   7/30/34→0, p99 ≤1,4 ms. Kampfpfad: Kills 69→71, XP 199→213,
   Material 104→115. Report `docs/pw/horde-cap-playtest.json`.
10. **Asset-Budget.** Das erste Paket liegt bei 8.372 Tris für 8 Assets, ohne
    Texturen; das trägt die 83-Gegner-Zone nur mit Pooling und LOD0.

## 8. Prioritäten

**P0 — Gates geschlossen (2026-11-08):**

- 14 Waffen für blade/blunt/medical/medieval/primitive: umgesetzt.
- 15 Zwei-Klassen-Waffen gegen die 15 offenen Paare: umgesetzt; 74 Waffen,
  55/55 Paare, 55 sofort freigeschaltet.
- 2 Bosse für Kurpark und Rheingau: umgesetzt.
- 5 Fähigkeits-IDs entdoppelt: umgesetzt.
- 2 Items für abilityRank/abilityCdMod: umgesetzt (24/24).
- Item-Pool 120: 47 neue Items (73 → 120), 30/30/30/30, 12 verflucht,
  24 je Veedel; alle über den echten Shop kaufbar und im Browser-Leg
  stats-/extra-genau geprüft. Details in Abschnitt 11.
- Content-Gate: **6/6 Gates**, 0 gebrochene Verweise.
- 4 Elite-/Hordenwellen (11/12/14/15 ab Danger 3): umgesetzt und live
  gemessen (8/8 Prüfungen je Welle plus Shop-Übergang grün).
- Gegner-Deckel 100: umgesetzt; Details und Vorher/Nachher in Abschnitt 13.

### Live-Nachweis: 15 Zwei-Klassen-Waffen (2026-11-08)

`node tools/hybrid-weapons-playtest.mjs` startet mit Seed `0x5eedc0de` einen
normalen `Game.startRun()` (Leonidas, Rheingau) und prüft die neuen Waffen im
laufenden Browser-Spiel, nicht nur in `data.js`:

- **Shop:** 62 echte `ShopSystem.generate()`-Shops; alle **15/15** Waffen
  erschienen in mindestens einem Angebot. 13 `UI.renderShop()`-Renderings
  wurden geprüft, weil mehrere Treffer in demselben Shop lagen; jedes geprüfte
  Angebot stand mit Name, Preis, Tier und beiden Klassen-Tags im echten
  `#shopItems`-Markup.
- **Schaden im Wellenlauf:** alle **15/15** Waffen trafen in echten
  `Game.update()`-Schritten der Welle 1 einen gespawnten Gegner. Die Messung
  lief über `WeaponSystem`/`Enemy.hurt` und protokolliert
  `p.stats.byWeapon[id]`, `Game.run.dmg` und den HP-Verlust des Ziels; der
  direkte Waffenschaden reichte von 7 bis 32,55.
- **Dual-Klassen-Recalc:** zwei Klingenbrecher ergeben
  `classCounts() = {blade:2, blunt:2}`. Gegen zwei Taschenmesser
  (blade+precise, präzise wirkt nur auf Krit) steigen **Melee +8** und
  **Armor +1** durch den Blunt-Bonus. Gegen zwei Schmiedehämmer
  (blunt+heavy, heavy wirkt nur auf Schaden) steigen **Melee +6** und
  **Crit +2** durch den Blade-Bonus. Alle fünf Checks sind grün; die
  Kontrollwaffen tragen ihre Zweitklasse so, dass sie die geprüften Stats
  nicht verfälschen.
- **Ergebnis:** keine Erreichbarkeits- oder Wirkungslücke gefunden; die
  Dual-Tags sind im laufenden Spiel wirksam. Keine Spielcodeänderung war für
  diesen Nachweis nötig. Rohprotokoll: `docs/pw/hybrid-weapons-playtest.json`.

### Live-Nachweis: 14 Lücken-Waffen (neu gemessen 2026-11-09)

`node tools/gap-weapons-playtest.mjs` startet mit Seed `0x6a9c0de` **einen**
normalen `Game.startRun()` (Leonidas, Kurpark) und prüft die 14 Waffen, die
die Klasslücken vor den 15 Hybriden geschlossen haben, im laufenden Spiel.
Ohne sie fällt `medical` auf 4 Waffen; mit ihnen hat jede Klasse mindestens 6.

- **Shop:** 64 echte `ShopSystem.generate()`-Shops; alle **14/14** Waffen
  erschienen in mindestens einem Angebot. 12 `UI.renderShop()`-Renderings
  wurden geprüft (mehrere Treffer lagen im selben Shop); jedes Angebot wurde
  über seinen Namen im echten `#shopItems`-Markup gefunden. Preis, Tier und
  Klassen-Tags stammen aus dem echten Angebotsobjekt.
- **Schaden im Wellenlauf:** alle **14/14** Waffen trafen in echten
  `Game.update()`-Schritten der Welle 1 einen gespawnten Gegner. Die Messung
  lief über `WeaponSystem`/`Enemy.hurt` und protokolliert
  `p.stats.byWeapon[id]`, `Game.run.dmg` und den HP-Verlust des Ziels; der
  direkte Waffenschaden reichte von **7,65 bis 53**.
- **Eine Session:** ein einziger `Game.startRun()`; alle 64 Shop-Generierungen
  und 14 Schadenstrials liefen auf demselben `Game`/`Player`-Objekt, ohne
  zweiten Run oder Reset.
- **Ergebnis:** 14/14 Shop-Angebote und 14/14 echte Treffer, 0 Failures; keine
  Spielcodeänderung war für diesen Nachweis nötig. Rohprotokoll:
  `docs/pw/gap-weapons-playtest.json`.

| Waffe | Klassen | Shop (Welle/Tier/Preis) | Schaden | Ticks |
| --- | --- | --- | ---: | ---: |
| `skalpell` | blade+medical | 3 / T0 / 16 | 7,65 | 1 |
| `rettungssaege` | blade+support | 20 / T3 / 242 | 14 | 1 |
| `flammenklinge` | blade+elemental | 10 / T1 / 58 | 9 | 1 |
| `klingenpistole` | blade+gun | 4 / T0 / 19 | 12 | 4 |
| `notfallhammer` | blunt+medical | 6 / T1 / 46 | 12,8 | 1 |
| `steinhammer` | blunt+primitive | 19 / T1 / 74 | 20 | 1 |
| `frosthammer` | blunt+elemental | 4 / T1 / 47 | 11 | 1 |
| `schmiedehammer` | blunt+heavy | 6 / T1 / 61 | 30 | 1 |
| `feldscher` | medical+medieval | 4 / T0 / 19 | 8,7 | 1 |
| `kraeuterkessel` | medical+primitive | 5 / T0 / 22 | 11,65 | 4 |
| `desinfektionsgranate` | medical+explosive | 7 / T0 / 26 | 23,80 | 5 |
| `wurfbeil` | blade+medieval+primitive | 4 / T0 / 21 | 17 | 4 |
| `bannerlanze` | medieval+support | 3 / T0 / 23 | 17 | 1 |
| `armbrust` | medieval+precise | 3 / T0 / 27 | 53 | 4 |

### Live-Nachweis: Barrierefreiheits-Skalierung (neu gemessen 2026-11-09)

`node tools/accessibility-scaling-playtest.mjs` startet mit Seed `0xacc355`
einen normalen `Game.startRun()` (Leonidas, Kurpark) und stellt die beiden
neuen Regler über den echten Klickpfad `UI.cycleOpt()` um. Gemessen wird in
echten `Game.update()`-Schritten gegen einen kontrollierten Gegner.

| Regler | 100 % | Umgestellt | Wirkung |
| --- | ---: | ---: | --- |
| Max. Leben | 135 HP | 130 % / 3 Klicks | 176 HP; `Player.recalc()` auf dem laufenden Spieler |
| Ausgeteilter Schaden | 32,70 | 120 % / 2 Klicks | 39,24; ×1,20 in `Combat.applyHit()` |
| Speed (bestand) | Stufe 5 / ×1,00 | — | `Game.speedBase` live, dritter Regler bereits vorhanden |

- **UI:** `UI.renderOptions()` rendert beide Labels und die Werte `130 %`/
  `120 %`; Definitionsbereich 50–150 %, Schritt 10.
- **Persistenz:** `Save.save()` schreibt `hpScale: 130` und `dmgScale: 120`
  unter `wiesbaden_survivors_v1`; alte Saves bekommen die Defaults 100 über
  den bestehenden Options-Merge.
- **Skalierungspfad:** `Player.recalc()` multipliziert die Max-HP-Summe
  (Items/Relikte/Stufen bleiben in derselben Basis), `Combat.applyHit()`
  multipliziert den finalen Treffer genau einmal; Waffen, Fähigkeiten und
  Dornen laufen durch diesen Pfad, `WeaponSystem.damage()` bleibt unverändert.
- **Messgröße:** der Report weist den HP-Verlust und `Game.run.dmg` als
  tatsächlich ausgeteilten Schaden aus; `p.stats.byWeapon` bleibt der
  Waffenrohwert vor der Barrierefreiheits-Skalierung.
- **Session:** 1 `startRun`, 2 echte `Game.update()`-Treffer-Trials, 5
  Optionsklicks, 0 Failures. Rohreport:
  `docs/pw/accessibility-scaling-playtest.json`.
- **Grenze:** Headless-Engine-/DOM-Nachweis, kein menschlicher
  Barrierefreiheits-Test; die wahrgenommene Lesbarkeit und Langzeitbalance
  der 50–150-%-Bereiche sind nicht gemessen.

### Live-Nachweis: Elite-/Hordenwellen (neu gemessen 2026-11-09)

`node tools/elite-waves-playtest.mjs` startet mit Seed `0x3e11e7e5` einen
normalen `Game.startRun()` auf Danger 3 und prüft die vier Wellen über die
echten Einstiegspunkte `Game.startWave()`, `Game.buildSpawnPlan()`,
`Game.update()` und `Game.endWave()`. Der Lauf ist die **Live-Kampagne**
(`Game.campaignActive()`); Plan und Kontrolle laufen deshalb durch
`buildCampaignSpawnPlan()`, das Mult und Elite-Rate der Events anwendet.
Bosse liegen in der Kampagne nur auf lokal 10/20, nicht auf Welle 15.

| Welle | Event | Plan (Gegner/Elites/Bosse) | Kontrolle | Live (Gegner/Elites, Event) | Bedrohung HP Plan/Kontrolle | Bedrohung DMG Plan/Kontrolle | Event-Material | Shop |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | Horde ×1,8 · Elite-Rate 0 · 45 Mat | 77 / 1 / 0 | 43 / 1 / 0 | 36 / 1, horde | 31.035 / 17.488 | 763 / 439 | +59 | 6 Angebote |
| 12 | Elite ×0,75 · 0,18 · 60 Mat | 35 / 7 / 0 | 46 / 1 / 0 | 21 / 7, elite | 21.965 / 23.159 | 429 / 531 | +79 | 6 Angebote |
| 14 | Horde ×2,0 · Elite-Rate 0 · 55 Mat | 100 / 3 / 0 | 50 / 3 / 0 | 47 / 3, horde | 56.566 / 28.838 | 1.460 / 753 | +73 | 6 Angebote |
| 15 | Elite ×0,75 · 0,20 · 80 Mat | 40 / 8 / 0 | 53 / 4 / 0 | 16 / 8, elite | 22.763 / 26.619 | 411 / 512 | +106 | 6 Angebote |

- **Vorher:** Derselbe Lauf mit `--before` ergab für alle vier Wellen
  `event=none`; Plan und Kontrolle lagen bei 276/308/364/392 Gegnern
  (Eliten 24/27/27/47 gegen 23/25/36/42), `eventMat=0`. Live erreichten
  4/5/6/4 Eliten die Gegnerliste. Rohprotokoll:
  `docs/pw/elite-waves-before.json`.
- **Danger-Gate:** Danger 0, 1 und 2 liefern für 11/12/14/15 `null`; Danger 3
  liefert `horde/elite/horde/elite`; Welle 13 bleibt auf Danger 3 normal. Alle
  zwanzig `startWave()`-Aufrufe liefen echt.
- **Hordenwellen** heben die Gegnerdichte: 77 statt 43 (+79,1 %) und 100 statt
  50 (+100 %). Die Plan-Bedrohung steigt von 17.488 auf 31.035 HP (+77,5 %)
  bzw. von 28.838 auf 56.566 HP (+96,2 %).
- **Elitewellen** tauschen Trash gegen Eliten: 7 statt 1 bzw. 8 statt 4 Eliten,
  bei 35 statt 46 bzw. 40 statt 53 Gegnern. Die Gesamt-HP bleibt vergleichbar
  bis leicht niedriger (21.965 gegen 23.159, −5,2 %; 22.763 gegen 26.619,
  −14,5 %) — Profilwechsel statt reiner HP-Wand.
- **Live-Verhalten:** In 600 echten `Game.update()`-Schritten bleiben die Events
  aktiv (`liveEvent` = horde/elite); die Live-Eliten 1/7/3/8 erreichen die
  Gegnerliste. `Game.endWave()` zahlt 59/79/73/106 Material (= 45/60/55/80 ×
  Danger-3-Preisfaktor 1,32) und öffnet den normalen Shop mit 6 Angeboten; der
  Wellen-/Shop-Fluss wird nicht umgangen.
- **Ergebnis:** 4/4 Events, 8/8 Prüfungen je Welle plus Shop-Übergang grün.
  Rohprotokoll: `docs/pw/elite-waves-playtest.json` (2026-11-09 neu erzeugt).
  Die frühere Tabelle maß den klassischen Spawnplan und ist durch diese
  Rohwerte ersetzt; insbesondere ist Welle 15 keine Bosswelle mehr.

### Live-Nachweis: Stadtgeschichte im Regelkern (2026-11-08)

`node tools/stadtgeschichte-balance.mjs` startet mit Seed `0x57ad7` einen
normalen `Game.startRun()` auf Danger 2, kauft die beiden Kurhaus-Teile und
lässt `Game.endWave()` bei Welle 5, 10 und 15 durch den echten Wellen-/Shop-
Übergang laufen:

| Welle | Stufe | Verbrauchte Teile | Shop |
| --- | --- | --- | --- |
| 5 | Kurhaus-Menü (T1) | Kaffee 0, Verband 0 | 6 Angebote |
| 10 | Kurhaus-Menü Plus (T2) | Kaffee 0, Verband 0 | 6 Angebote |
| 15 | Kurhaus-Menü Deluxe (T3) | Kaffee 0, Verband 0 | 6 Angebote |

- **Parität:** 7/7 Kern-/Engine-Fälle und 21/21 Stufen-Stats/Preise
  byte-gleich; die Stat-Deltas der drei Stufen entsprechen exakt dem Kern.
- **Balance:** Klassen-Ratio 0,82–1,21 gegen den Median-Waffentier (49,5 %);
  Linien +0,53 bis +4,46 Wellen, alle sieben +4,46 (Modell-Deckel 16,88).
- **Ergebnis:** Regelkern, Verbrauch, Aufstieg und normaler Shop-Fluss sind
  live belegt; Rohprotokoll `docs/pw/stadtgeschichte-balance.json`.

**P1 — Viertel-Kampagne:**

- 5 Viertel × 20 Wellen, Modifikatoren, 10 Bosse, 83 Gegner, 32 Charaktere.
  **Live:** `content/fuenf-viertel.json`, 19/19 Audit-Gates, 14/14 Tests,
  100-Wellen-Playtest; Engine-Verdrahtung in `data.js`/`index.html`
  (Abschnitt 5.1).
- 125 Items (erreicht), 24 KI-Familien; die Waffenparität ist bereits
  übertroffen.
- Stadtgeschichte ist im HTML-Regelkern integriert und gegen die Waffenmeta
  gemessen (Abschnitt 6); offen bleiben UE-Portierung und Pickrate-Messung im
  echten Spiel.

**P2 — Koop und Meta:**

- 4-Spieler-Koop nur nach Simulations- und Frame-Zeit-Nachweis.
- **Barrierefreiheits-Regler:** erledigt — HP/DMG/Speed live und persistent (Nachweis: `docs/pw/accessibility-scaling-playtest.json`). Leaderboard, Pets.
- optional: Curse-Ausbau.

## 9. Grenzen

- Der Audit misst **deklarierte Daten**, nicht Balance, Spielgefühl oder
  tatsächliche Build-Vielfalt. 81 Waffen sind nicht automatisch 81 gute Waffen.
- Das Fünf-Viertel-Paket ist **live verdrahtet**: Kampagnenschleife,
  Modifikatoren, fünf neue KI-Familien, Gastbosse und 32 Kampagnengegner sind
  in `data.js`/`index.html`. Die 19 Gates prüfen Schema, Vollständigkeit und
  Referenzen; der Playtest prüft den Engine-Ablauf. Beide messen keine
  menschliche Balance oder Spielgefühl.
- Brotato-Zahlen sind community-gepflegt und patchabhängig; 62/44/83 sind
  Momentaufnahmen, Items nur als „hunderte" belegt.
- Die Stadtgeschichte ist im HTML-Spiel **aktiv** (Regelkern, `recalc`,
  `endWave`); 13 Kern-Tests, 7/7 Engine-Paritätsfälle und 21/21
  Stufen-Paritäten belegen die Regellogik. Die Balance-Aussage stützt sich auf
  das abstrakte `BalanceSim`-Modell (DPS je Klasse, gepaarte Läufe), nicht auf
  menschliche 20-Wellen-Läufe; das Run-Modell sättigt bei ~16,88 Wellen. In UE
  ist sie noch nicht portiert.
- Die P0- und Paritäts-Waffen (14 + 15) sowie 2 Bosse und 2 Items sind **im
  HTML-Spiel** (`data.js` + Engine) eingebaut; alle 15 neuen Waffen sind über
  `unlockDefault` im normalen Shop-Pool, die Bosse über den Boss-Pool erreichbar.
- Der Elite-/Horden-Nachweis (neu gemessen 2026-11-09) deckt 600
  Update-Schritte je Welle, die Kampagnen-Planung und den normalen
  Wellen-/Shop-Übergang ab, keinen vollständigen menschlichen 20-Wellen-Lauf;
  die Balance-Aussage stützt sich auf Plan-HP/DMG aus der Engine, nicht auf
  Spielgefühl.
- Kein UE-Test in dieser Umgebung (kein Windows, keine GPU, 3 GB RAM).
- Stadtgeschichte-Balance: `node tools/stadtgeschichte-balance.mjs` grün
  (7/7 Parität, 21/21 Stufen, Klassen-Ratio 0,82–1,21, Linien +0,53..+4,46
  Wellen); Report `docs/pw/stadtgeschichte-balance.json`.
- Fünf-Viertel-Live-Kampagne: 14/14 Tests, Audit 19/19 und 100-Wellen-Playtest;
  die bestehenden
  Prüfungen blieben grün (content-scope 6/6 mit 0 gebrochenen Verweisen,
  data-regression 22/22, Stadtgeschichte 13/13, `verify` 93/0/0).
- Item-Pool 120 (2026-11-09): 47 neue Items live; voller Gate **212/0/0**,
  statisch **87/0/0**, `data-regression` **22/22**, `content-scope` **6/6**,
  Stack-Rig **22/22**. Die Item-Definitionen fließen nicht in
  `BalanceSim.simulateRun()` ein; die Vierer-Korridorwerte bleiben deshalb
  gemessen bei 50,0 / 48,4 / 36,9 / 28,2 %. Kein menschlicher
  20-Wellen-Playtest, keine Pickrate-Messung und kein separater Online-Koop-
  Lauf; die Koop-Auswahl-/Stack-Legs des Gates blieben grün.
- Verifikation: `node tools/verify.mjs` lief nach der Stadtgeschichte-
  Integration und dem Balance-Pass auf **93/0/0**; zuvor lief er nach dem
  Hybrid-Nachweis zweimal
  auf **93/0/0** (0 fail, 0 skip). Letzter Lauf: Border-Lift 16,6, Mitte 0,5,
  critVis 0,765; unmittelbar davor: Border-Lift 17,6, Mitte 0,3, critVis
  0,766. Beide Läufe waren grün; der frühere Vergleichslauf lag bei 18,8 / 0,6.
  Audio -15,3 LUFS / -4 dBFS; BalanceSim 10.000 Läufe in 76 ms (vorher 87 ms,
  68 Waffen, ohne die 3 legendären); ?selftest 193/193. Die früheren
  Vignetten-Ausreißer (10,8 bzw. 0,0) traten nicht erneut auf; es wurde nichts
  an der Vignette geändert.
- Nichts ist committet.

## 10. Nachtrag 2026-11-09 — Charakter-Riege 32

Die in Abschnitt 3 und P1 geforderte Zielmarke **32 Charaktere** ist erreicht:
fünf neue Helden erweitern das Roster von 27 auf 32. Alle fünf sind über die
echte Figurenauswahl (`#scTitle` → `#charGrid` → `#charConfirm` →
`#scControls`) startbar und tragen eine eigene Fähigkeits-ID, Figur, Animation
und Move-Set; keine Fähigkeit teilt sich einen Switch-Zweig mit einer anderen.

| Charakter | Startwaffe | Fähigkeit | Wirkung | Freischaltung |
| --- | --- | --- | --- | --- |
| Ampel-Anna | Schrottkanone | `gruenphase` | Team +18 % Tempo und +15 % Angriffstempo (5 s); Slow und Rückstoß im Umkreis | frei |
| Dampf-Dieter | Schmiedehammer | `dampfwalze` | Dash-Kegel, 0,8 s Betäubung, Brand, +Rüstung | frei |
| Nachtwächter Nils | Armbrust | `scheinwerfer` | 520 px Lichtkegel, Markierung, Slow | 20 Wellen (`wavesCleared`) |
| Wein-Wanda | Wurfbeil | `rebenhieb` | Radialschaden, Brand, Heilung je getroffenem Gegner | 3 Bosse (`bosses`) |
| Frost-Fritz | Kältekompresse | `kaeltewelle` | Frost-Nova, Freeze/Slow, +Rüstung | frei |

Die drei freien Helden sind sofort wählbar; die zwei gesperrten nutzen
bestehende Fortschrittszähler. Damit sind **4/32** Charaktere gesperrt (vorher
2/24).

**BalanceSim 10.000 Läufe, Danger 2, 312 Läufe je Charakter:**

| Charakter | Siegrate | Ø Welle | Korridor |
| --- | ---: | ---: | --- |
| Ampel-Anna | 41,0 % | 11,44 | 20–80 % ✔ |
| Dampf-Dieter | 52,9 % | 13,55 | 20–80 % ✔ |
| Nachtwächter Nils | 24,7 % | 9,66 | 20–80 % ✔ |
| Wein-Wanda | 42,9 % | 12,14 | 20–80 % ✔ |
| Frost-Fritz | 44,6 % | 12,49 | 20–80 % ✔ |

Der dokumentierte Vierer-Korridor bleibt innerhalb der Sampling-Toleranz:
Einarm 50,0 % (vorher 50,0), Schrottschorsch 48,4 % (50,5),
Ventil-Vera 36,9 % (38,1), Kurier-Kai 28,2 % (27,8). Die Abweichung ist
**keine Stat- oder Waffenänderung** an diesen vier Helden, sondern die
Stichprobenlänge: `runsPerChar = floor(10000 / CHARS.length)` sinkt mit 32
Helden von 370 auf 312 Läufe; die Seeds je Charakter bleiben gleich, der
RNG-Stream ist nur kürzer. Insgesamt liegen 19/32 Helden im Korridor; die
übrigen Ausreißer sind Bestand (u. a. Nova 1 %, Sylvia 100 %) und nicht Teil
dieses Passes.

**Verifikation:** Voller Gate **203 pass / 0 fail / 0 skip**, statisch
**83 / 0 / 0**, `data-regression` **22/22**, `content-scope` **6/6** mit
0 gebrochenen Verweisen und ohne geteilte Fähigkeiten, Screen-Stack-Rig
**22/22** ohne Konsolenfehler. Der neue Browser-Leg startet jede der fünf
Figuren durch die echte UI und feuert die Fähigkeit über die reale
`skill1`-Taste; er prüft 5/5 Treffer sowie die jeweils eigene Wirkung
(Tempo-Buffs, Stun/Brand, Markierung, Heilung, Freeze/Slow). Nichts ist
committet.

Diese 32er-Stufe ist inzwischen auf **44 Charaktere** erweitert
(Abschnitt 12).

## 11. Nachtrag 2026-11-09 — Item-Pool 120 (historischer Messstand)

> Dieser Abschnitt dokumentiert den 120er-Ausbau. Der aktuelle Pool umfasst
> 125 Items (31/31/32/31, 25 je Veedel); die Zahlen unten sind der damalige
> Nachweis.

Die in Abschnitt 3 und 5 geforderte erste Item-Ausbaustufe ist erreicht:
**73 → 120 Items** (+47). Die Verteilung ist 30/30/30/30 je Rarity, davon
12 verflucht; jedes Viertel trägt genau 24 Items. Die 47 neuen Einträge nutzen
ausschließlich das bestehende Schema (`I(id,name,r,price,stats,fl,extra)`) und
die vorhandenen Wirkpfade: Stats über `Player.recalc()`, `cursed/curse` über
`addItem()`/`recalc()`, `turret` über den Turm-Spawn und `thorns` über
`applyPlayerHit()`. Es gibt kein paralleles Item-System und keine neue Engine.

**Shop-Erreichbarkeit:** `ShopSystem.generate()` zieht Kandidaten aus
`ITEMS.filter(it => it.r === rar)`; eine separate Pool-Registrierung existiert
nicht. Alle 47 IDs sind zusätzlich in `ITEM_FAMILY_MEMBERS` eingetragen, damit
die Veedel-Zuordnung (24 je Familie) vollständig bleibt. Die Karten laufen über
`UI.renderShop()` und den normalen `#shopItems .item`-Klick auf
`ShopSystem.buy()`; Reroll, Preis, Rarity und `bought`-Sperre bleiben die
bestehenden Regeln.

**Browser-Nachweis (`node tools/verify.mjs`, headless Chromium):**

- Ein natürlicher Wave-20-Shop (`ShopSystem.generate(20,[p])`, 12 Versuche)
  rollte **Kontaktlinse**; der echte Kartenklick in `#shopItems` kaufte das
  Item, und die deklarierten Stats änderten sich exakt.
- Für die natürliche Erreichbarkeit wurden **3.000 echte
  `ShopSystem.generate()`-Shops** ohne manuell gesetzte Angebote erzeugt
  (Welle 1/10/20, je 1.000). Alle **47/47** neuen IDs erschienen mindestens
  einmal; keine ID blieb ungesehen.
- Zusätzlich wurde jedes der 47 Items einzeln in ein echtes Shop-Angebot
  gelegt, über `UI.renderShop()` gerendert und über denselben DOM-Kartenklick
  gekauft. Geprüft wurden `p.itemCounts[id] === 1`, jedes deklarierte
  Stat-Delta, `curse`/`cursed`, der Turm-Spawn und die Dornen-Summe.
  Ergebnis: **47/47** ohne Abweichung.
- Der Test läuft im vollen Gate; die bestehenden Solo-Legs und die
  Koop-Auswahl-/Stack-Legs blieben grün. Ein vollständiger Online-Koop-Lauf
  war nicht Teil dieses Daten-/UI-Passes.

**Katalog der 47 neuen Items** (Stats und Extras; `+`/`-` wie im Datensatz):

| Item | Viertel | R | Preis | Stats / Effekt |
| --- | --- | ---: | ---: | --- |
| Feldflasche | Feuerwehr | 1 | 20 | maxHp +10, hpRegen +1 |
| Griffhandschuhe | Feuerwehr | 1 | 19 | melee +5, armor +1 |
| Rettungsfolie | Feuerwehr | 1 | 20 | maxHp +8, dodge +2, speed -1 |
| Kurpark-Eichel | Kurpark | 1 | 18 | harvest +2, luck +6 |
| Parkuhr-Münze | Kurpark | 1 | 20 | luck +8, xpGain +4, maxHp -3 |
| Gießkanne | Kurpark | 1 | 19 | harvest +3, hpRegen +1 |
| Vogelhäuschen | Kurpark | 1 | 21 | luck +6, hpRegen +1, speed -1 |
| Uferkiesel | Rheinufer | 1 | 18 | armor +1, knock +10 |
| Rollschuhe | Rheinufer | 1 | 19 | speed +8, dodge +2, armor -1 |
| Kanu-Paddel | Rheinufer | 1 | 20 | speed +5, knock +12 |
| Neoprenanzug | Rheinufer | 1 | 22 | maxHp +8, speed +3, armor -1 |
| Akkuzelle | Labor | 1 | 20 | eng +6, elem +3 |
| Kabelbinder | Labor | 1 | 18 | eng +4, atkSpd +3 |
| Lesebrille | Innenstadt | 1 | 19 | crit +3, range +5 |
| Wurfmesser | Innenstadt | 1 | 21 | ranged +5, crit +2, melee -2 |
| Hitzeschutzanzug | Feuerwehr | 2 | 38 | armor +4, maxHp +16, speed -3 |
| Brandmelder | Feuerwehr | 2 | 36 | armor +2, hpRegen +2, luck +4 |
| Picknickkorb | Kurpark | 2 | 38 | harvest +5, maxHp +12, speed -2 |
| Ententeich | Kurpark | 2 | 36 | luck +12, harvest +3, dodge -2 |
| Fahrradpumpe | Rheinufer | 2 | 35 | speed +9, atkSpd +4, maxHp -4 |
| Treibgut | Rheinufer | 2 | 38 | harvest +4, knock +20, luck +6 |
| Lötstation | Labor | 2 | 42 | eng +10, elem +6, speed -2 |
| Kontaktlinse | Innenstadt | 2 | 37 | crit +5, range +8, hpRegen -1 |
| Hydrantenschlüssel | Feuerwehr | 3 | 74 | eng +10, knock +25 · Dornen 6 |
| Rettungsweste | Feuerwehr | 3 | 76 | maxHp +28, armor +4, speed -4 |
| Rosengarten | Kurpark | 3 | 78 | luck +22, harvest +6, xpGain +8 |
| Brunnenwasser | Kurpark | 3 | 74 | hpRegen +3, maxHp +20, luck +10 |
| Fluch des Hungers | Kurpark | 3 | 58 | harvest +25, lifesteal -10, hpRegen -2, maxHp -20 · verflucht, Curse +5 |
| Rheinsegler | Rheinufer | 3 | 76 | speed +14, dodge +6, knock +20 |
| Strandkorb | Rheinufer | 3 | 72 | maxHp +24, armor +3, dodge +4, speed -5 |
| Fluch der Schwerkraft | Innenstadt | 3 | 60 | dmgP +35, armor +5, speed -20, dodge -8 · verflucht, Curse +5 |
| Fluch des Rostes | Feuerwehr | 4 | 92 | armor +14, maxHp +30, atkSpd -18, speed -10 · verflucht, Curse +6, Dornen 12 |
| Einsatzleitwagen | Feuerwehr | 4 | 128 | maxHp +50, armor +12, hpRegen +4, speed -8 |
| Fluch des Wuchers | Kurpark | 4 | 94 | harvest +35, luck +30, maxHp -40, lifesteal -12 · verflucht, Curse +6 |
| Kurhausgarten | Kurpark | 4 | 132 | luck +45, harvest +12, xpGain +20, maxHp -10 |
| Jahrhundertbaum | Kurpark | 4 | 130 | maxHp +35, hpRegen +5, harvest +10, speed -6 |
| Kurpark-Denkmal | Kurpark | 4 | 134 | armor +6, luck +25, harvest +15, dodge -5 |
| Fluch der Zeit | Rheinufer | 4 | 95 | atkSpd +30, speed +10, maxHp -35, hpRegen -2 · verflucht, Curse +6 |
| Rheinregatta | Rheinufer | 4 | 136 | speed +25, dodge +10, knock +35, maxHp -10 |
| Rheinfähre | Rheinufer | 4 | 140 | maxHp +40, armor +8, speed +12, dodge +5 |
| Fusionator | Labor | 4 | 142 | eng +30, elem +30, dmgP +15, maxHp -15 |
| Kernspintomograph | Labor | 4 | 138 | eng +35, atkSpd +12, range +15, speed -5 · Turm |
| Fluch des Lärms | Innenstadt | 4 | 96 | ranged +30, crit +15, dodge -12, armor -4 · verflucht, Curse +6 |
| Ballistikcomputer | Innenstadt | 4 | 140 | crit +15, critDmg +45, range +20, atkSpd -6 |
| Präzisionszirkel | Innenstadt | 4 | 138 | crit +12, ranged +30, dmgP +12, melee -12 |
| Stadtarchiv | Innenstadt | 4 | 132 | xpGain +30, luck +25, crit +8 |
| Goldene Krawatte | Innenstadt | 4 | 145 | dmgP +28, crit +12, speed +5, maxHp -12 |

**Darstellung:** Das bestehende Item-Schema und die Shop-/Codex-Karten haben
kein Icon-Feld; sie zeigen Name, Rarity, Stats, Flavor und Familie als Text.
Die neuen Items folgen genau diesem Stil. Ein separates Icon-System wurde
nicht eingeführt, weil es nur für die neuen Einträge inkonsistent wäre.

**Balance (10.000 Läufe, Danger 2, 312 Läufe je Charakter):**

| Charakter | Siegrate | Ø Welle | Korridor |
| --- | ---: | ---: | --- |
| Einarm-Willi | 50,0 % | 13,3 | 20–80 % ✔ |
| Schrott-Schorsch | 48,4 % | 13,1 | 20–80 % ✔ |
| Ventil-Vera | 36,9 % | 11,1 | 20–80 % ✔ |
| Kurier-Kai | 28,2 % | 9,6 | 20–80 % ✔ |

Die Werte sind **unverändert** gegenüber dem Charakter-Pass. Ursache ist keine
Tuning-Entscheidung, sondern das Modell: `BalanceSim.simulateRun(chr, danger,
evo)` liest nur `chr.stats` und optionale Stadtgeschichte-Boni; `ITEMS`,
`itemCounts` und `recalc()` kommen darin nicht vor. Items wirken im Live-Run
über `Player.recalc()`/`applyPlayerHit()`, nicht in der Run-Simulation. Es gibt
daher keinen Item-induzierten Drift und keinen zusätzlichen Balance-Eingriff.
19/32 Charaktere liegen im 20–80-%-Korridor (unverändert).

**Gates nach dem Pass:** `node tools/verify.mjs` **212/0/0** (vorher 203),
`node tools/verify.mjs --no-browser` **87/0/0** (vorher 83),
`node tools/data-regression.mjs` **22/22**, `node tools/content-scope.mjs`
**6/6** mit 0 gebrochenen Verweisen, Screen-Stack-Rig **22/22** ohne
Konsolenfehler. `content-scope` meldet 120 Items, 30 je Rarity, 12 verflucht,
4 Türme, 4 Dornen, 24/24 Stats und 24 Items je Veedel.

**Grenze:** Der Nachweis ist ein Engine-/DOM-Beweis, kein menschlicher
20-Wellen-Playtest. Die Pickrate und das Spielgefühl der 47 Items im echten
Run sind nicht gemessen; das Modell `BalanceSim` bildet Items gar nicht ab.


## 12. Nachtrag 2026-11-09 — Charakter-Riege 44 (Brotato-Parität)

Die in Abschnitt 2/3 geforderte Zielmarke **44 Charaktere** ist erreicht:
zwölf neue Helden erweitern das Roster von 32 auf 44. **40/44** sind sofort
wählbar; die vier alten Schwellen (20 Wellen, 3 Bosse, 100 Kills, 10 Siege)
bleiben unverändert. Jeder neue Held nutzt eine **vorhandene, bisher freie**
Startwaffe — es wurde keine Waffe neu erfunden — und besitzt eine **eigene**
Fähigkeits-ID mit eigenem `case` im bestehenden `useAbility`-Switch. Keine
Waffe und keine Fähigkeit ist doppelt vergeben.

| Charakter | Startwaffe | Fähigkeit | Live-Wirkung (5/5 Treffer) |
| --- | --- | --- | --- |
| Speer-Sophie | `spear` | `speerwurf` | Linie durchbohrt, Stun, Rückstoß, +Reichweite |
| Axt-Achim | `chopper` | `holzhack` | breiter Hieb, Stun, Rückstoß, +Nahkampf |
| Nagel-Nadja | `nagler` | `nagelregen` | radialer Regen, Stun, Slow, Markierung, +Angriffstempo |
| Bier-Bernd | `bierwerfer` | `fassrolle` | Fass-Explosion, Brand, Rückstoß, +Rüstung |
| Minen-Marie | `magnetmine` | `magnetfeld` | Sog zum Zentrum, Slow, Stun, +Technik |
| Tauben-Toni | `taubenschwarm` | `taubensturm` | Schwarm, Slow, Material + Power-up, +Glück |
| Säge-Svenja | `kettensaege` | `kettenschnitt` | Dash, Brand, Stun, Rückstoß, +Angriffstempo |
| Laser-Lars | `laserzirkel` | `laserfokus` | langer Strahl, Markierung, Slow, +Krit/+Reichweite |
| Blitz-Britta | `blitzableiter` | `kettenblitz` | Kette über 5 Ziele, Schock, Stun, +Elementar |
| Skalpell-Sina | `skalpell` | `notoperation` | Gift, Stun, Heilung je Treffer, +Lebensraub |
| Rettungs-Ralf | `rettungssaege` | `rettungsgriff` | Team-Heilung, Statusreinigung, Stun, +Rüstung |
| Flammen-Felix | `flammenklinge` | `brandschneise` | breite Feuerlinie, Brand, Stun, +Tempo/+Elementar |

**Live-Nachweis:** `node tools/characters-44-playtest.mjs` spielt alle zwölf
Helden mit festem Seed `0x4a17` (18967) durch den echten UI-Flow
(`#scTitle` → `#charGrid` → `#scChar` → `#scControls`) und feuert die
Fähigkeit über die reale `skill1`-Taste gegen fünf stehende Testgegner.
Ergebnis: **12/12** starten mit der deklarierten Startwaffe, **5/5 Treffer**,
`abilityCd` 8–12 s, jeweils messbarer Status/Buff (Stun, Slow, Brand, Gift,
Schock, Markierung, Heilung oder Beute). Die Wiederholung von Speer-Sophie
liefert mit demselben Seed exakt dieselben Gegner-HP
(445/445/445/445/445) und `abilityCd` 8 — der Lauf ist deterministisch.
Report: `docs/pw/characters-44-playtest.json`.

**Balance:** `BalanceSim` mit 10.000 Läufen (Danger 2, 227 Läufe je
Charakter) hält alle **17** in dieser Welle geprüften Helden im 20–80-%-Korridor.
Die zwölf neuen liegen bei 28,2–64,3 % Siegrate:

| Charakter | Siegrate | Charakter | Siegrate |
| --- | ---: | --- | ---: |
| Speer-Sophie | 32,2 % | Minen-Marie | 30,4 % |
| Axt-Achim | 43,6 % | Tauben-Toni | 37,4 % |
| Nagel-Nadja | 42,3 % | Säge-Svenja | 38,3 % |
| Bier-Bernd | 47,1 % | Laser-Lars | 33,0 % |
| Blitz-Britta | 41,4 % | Skalpell-Sina | 64,3 % |
| Rettungs-Ralf | 38,8 % | Flammen-Felix | 28,2 % |

Acht Helden wurden dafür nach dem ersten Messlauf getunt (vor allem
Max-HP-/Rüstungs-/Dodge-Budget); die Fähigkeiten selbst blieben unverändert.

**Gates nach dem Pass:** `node tools/content-scope.mjs` meldet **44
Charaktere**, Lücke **Charaktere +0**, **6/6 Gates**, 0 gebrochene Verweise.
`node tools/verify.mjs` läuft **250/0/0** (statisch **91/0/0**),
`node tools/data-regression.mjs` **22/22**,
`node --test tools/content-fuenf-viertel.test.mjs` **14/14**,
`node tools/gap-weapons-playtest.mjs` **14/14**,
`node tools/hybrid-weapons-playtest.mjs` **15/15**.
Der volle Browser-Leg prüft zusätzlich alle zwölf neuen Helden durch
`#charGrid` samt Status/Buff; das frühere 32er-Label ist ersetzt.

**Grenze:** Der Nachweis ist ein Headless-Engine-/DOM-Beweis mit fünf
stehenden Gegnern, kein menschlicher 20-Wellen-Lauf und keine Pickrate- oder
Spielgefühl-Messung. BalanceSim modelliert nur `chr.stats`, nicht die
Fähigkeiten; die Korridorwerte belegen die Stat-Balance, nicht die
wahrgenommene Stärke der Fähigkeiten im echten Kampf.


## 13. Nachtrag 2026-11-09 — Gegner-Deckel 100 (Brotato-Parität)

Der letzte offene Kernloop-Punkt aus §7.9 ist geschlossen. Bisher deckelten die
Spawnpläne auf **50** (klassisch) bzw. **70** (Kampagne); Brotato stemmt **100**
gleichzeitig. Die neue zentrale Regel `BROTATO_RULES.maxEnemiesOnScreen = 100`
(data.js:440) wird an allen vier Stellen benutzt: im initialen Game-Objekt, in
`buildCampaignSpawnPlan()`, in `buildSpawnPlan()` und im Spawn-Loop
(index.html:14869/15658/15934/17660). Das HUD zählt die lebenden Gegner bereits
über `GEGNER <n>`; die Hordenwellen zeigen den Unterschied direkt auf dem Feld.

**Live-Vorher/Nachher** (Seed `0xc0ffee`, Danger 3, `Game.startRun()`,
`Game.startWave()`, 1800 Ticks, ohne Waffen; Report
`docs/pw/horde-cap-playtest.json`):

| Szenario | Queue | max. lebend alt | max. lebend 100 | Queue-Rest alt → 100 | p99 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Kampagne Horde W11 | 77 | 70 | **77** | 7 → 0 | 1,2 ms |
| Kampagne Horde W14 | 100 | 70 | **100** | 30 → 0 | 1,2 ms |
| Klassisch W3 | 84 | 50 | **84** | 34 → 0 | 0,6 ms |

**Kampf-/XP-/Drop-Pfad** (klassisch W3, echte T1-`loeschwasser`-Waffe,
2400 Ticks, gleicher Seed): max. lebend **50 → 58**, Kills **69 → 71**,
XP **199 → 213**, Material **104 → 115**, Schaden **2877 → 2951**,
p99 **1,4 → 1,2 ms**. Die Waffe räumt die Queue weiter ab; der größere
Startdruck erhöht Treffer, XP und Material, ohne die Frame-Grenze zu reißen.

**Determinismus:** Derselbe Seed und derselbe Cap liefern identische
Spawn-/Queue-Werte; der Combat-Zweig nutzt zusätzlich einen festen
`Math.random`-LCG (wie `gap-weapons-playtest`), damit auch Waffen-/
Statuszufall reproduzierbar ist. Zwei direkt aufeinanderfolgende Läufe liefern
dieselben Werte; der Report enthält beide Messungen und den
Determinismus-Vergleich.

**Grenze:** Headless-Engine-Nachweis, kein menschlicher 20-Wellen-Lauf. Der
Deckel begrenzt die **Queue-Spawns**; bestehende Splitter-/Beschwörer-Mechaniken
können die Zahl kurzzeitig überschreiten (im Kampagnen-Kampfpfad gemessen:
111 lebende bei Cap 70 durch Splits). Das ist dieselbe Semantik wie vorher und
keine neue Regel — der Audit-Punkt betraf den Plan-/Queue-Deckel.
