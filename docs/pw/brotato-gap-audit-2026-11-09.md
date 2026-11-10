# Brotato-Gap-Audit + Item-Recycling (2026-11-09)

## Auftrag und Methode

Ziel war **genau eine** neue, im echten Spiel auslösbare Brotato-Paritäts-/Optimierungsfunktion.
Grundlage waren die vorhandenen Audits (`docs/content-scope-brotato-2026-11-08.md`,
`docs/pw/content-scope.json`, `docs/playtest-wave20-2026-11-08.md`) sowie ein
Quellabgleich der tatsächlich geladenen Tabellen und Pfade. Die Content-Matrix wurde
an einer Stelle korrigiert: **Pets sind vorhanden**, nicht offen (`PETS` in
`index.html:5097`, `class Pet` in `index.html:5108`).

**Nachtrag 2026-11-09:** Der zuvor als größter Rohinhalt markierte Gegner-Gap
ist geschlossen; die Charakterriege steht mit demselben Datum bei **44/44**
(vorher 32, +12 neue Helden mit eigener Ability und vorhandener Startwaffe,
40 sofort wählbar). Die 23 neuen Basisgegner stehen in `data.js`, in den echten
Kampagnenwellen und im Live-Spawnpool; der Beweis läuft über
`Game.startRun()` + `Game.startWave(20)` + `Game.update`. Der Gegner-Deckel ist
mit demselben Datum von 50/70 auf **100** angehoben und live gemessen
(`docs/pw/horde-cap-playtest.json`): W11 70→77, W14 70→100, klassisch W3
50→84, Queue-Reste 7/30/34→0; Kampfpfad Kills 69→71, XP 199→213.

## Systemmatrix: vorhanden vs. größte Lücke

| Brotato-Kernsystem | Stand im Spiel | Belege | Bewertung / Lücke |
|---|---|---|---|
| Waffenvielfalt | 81 Waffen, T1–T4, Fusionen, Aufsätze | `data.js:453`, `index.html:5433` | stark; keine neue Content-Welle in diesem Pass |
| Item-Vielfalt | 125 Items, 31/31/32/31, 5 Veedel, 12 verflucht | `data.js:1181`; Gate 125/125 | stark; Rückweg über 25-%-Recycling vorhanden |
| Shop-/Upgrade-Tiefe | 6 Angebote, Rerolls, Locks, Waffen-Upgrades, Fusionen, Aufsätze, 6 Werkstatt-Aufträge, Item-Recycling | `data.js:333`, `index.html:11946`, `index.html:14050` | sehr tief; **Item-Recycling vorhanden (25 %)** |
| Gegner-/Wellen-Varianz | **83 live** (51 Basis + 32 Kampagne), **Deckel 100**, 10 Bosse, 8 Arenen, 5 Viertel/100 Wellen | `data.js:1022`, `data.js:440`, `docs/pw/enemy-roster-playtest.json` | **2026-11-09 geschlossen:** Brotato-Parität 83/83 und Gegner-Deckel 100/100 |
| Charakter-/Build-Entscheidungen | **44 Charaktere**, Startwaffen, Fähigkeiten, Synergien, Stat-Trade-offs | `data.js:93` | **2026-11-09 geschlossen:** 44/44, 40 sofort wählbar, je eigene Ability |
| Pets | 4 Pets, Drops, Stats, Angriffe | `index.html:5097`, `index.html:5108` | **vorhanden**; alte Matrix war hier veraltet |
| Meta-Progression | 36 Erfolge, 9 Mods, Unlocks, Mastery, Ruhm, Prestige, Daily Seed | `data.js:1089`, `data.js:1360` | stark; kein akuter Bedarf |
| Stat-Skalierung | zentraler `recalc()`-Pfad für Items/Werkstatt/Relikte/Buffs | `index.html` `Player.recalc()` | intakt; neue Funktion muss ihn nur korrekt aufrufen |
| UI/Feedback | Nav-Ring, Gamepad, Toasts, SFX, Co-op-Menü | `index.html:12983`, `index.html:19129` | vorhanden; neue Aktion muss alle Pfade mitnehmen |

## Gewählte Lücke: Item-Recycling im Shop

Brotato recycelt **Waffen und Items**; der Wiki-Standardwert für Items ist **25 %**
des aktuellen Werts (`https://brotato.wiki.spellsandguns.com/Shop`). Das Spiel hatte
bereits den Waffenverkauf mit 55 % (`index.html:5433`), aber Items waren im Shop
endgültig: Ein Fehlkauf oder ein nicht mehr passendes Fundstück blockierte Material
und Inventar ohne Rückweg. Das ist eine kleine, klar abgegrenzte Lücke mit hohem
Build-Agency-Gewinn und ohne Eingriff in Kampf-, Gegner- oder Wellenlogik.

**Sonderfall gegenüber Brotato:** Dort gilt Recycling vor allem für Kisten-Items.
Hier wird der gleiche 25-%-Gedanke bewusst auf das Shop-Inventar angewendet, weil
das Spiel keine Kistenquelle besitzt und Items unbegrenzt sind. Das ist eine
Optimierung des bestehenden Shops, keine Behauptung eines identischen Regeltexts.

### Verworfene Alternativen

- **Mehr Waffen/Items/Charaktere:** Rohcontent ist bereits über/nahe Brotato
  (81/125/44); eine weitere Content-Welle wäre breit, schwer zu tunen und keine
  einzelne Funktion.
- **Pets:** bereits vorhanden (4 Pets, Drops, Stats, Angriffe).
- **Meta-Progression:** bereits tief (Unlocks, Erfolge, Mastery, Ruhm, Prestige,
  tägliche Seeds); kein einzelner fehlender Hebel.
- **Gegner-/Wellen-Ausbau:** **2026-11-09 umgesetzt** — 51 Basis + 32 Kampagne =
  83 live, 23 neue Basisgegner, 19 KI-Familien, Live-Nachweis in
  `docs/pw/enemy-roster-playtest.json`.
- **Shop-Tiefe allgemein:** bereits 6 Angebote, Rerolls, Locks, Fusionen, Aufsätze,
  Werkstatt; nur der Rückweg für Items fehlte.
- **Accessibility:** sinnvoll, aber geringerer Gameplay-Wert als Shop-/Build-Agency
  und nicht die größte inhaltliche Lücke. **2026-11-09 umgesetzt:** HP- und
  DMG-Regler live, Speed bestand bereits; Nachweis in
  `docs/content-scope-brotato-2026-11-08.md` und
  `docs/pw/accessibility-scaling-playtest.json`.
- **Leaderboard:** kein Brotato-Kernsystem und ohne Backend nicht sauber lösbar.

## Implementierung

- **Preislogik zentral:** `BROTATO_RULES.itemRecycleRate = .25` in `data.js:341`.
- **Rückerstattung:** `ShopSystem.itemSellValue()` (`index.html:12164`) nimmt 25 %
  des aktuellen Shop-Preises, abgerundet, mindestens 1 Material.
- **Transaktion:** `ShopSystem.recycleItem()` (`index.html:12168`) prüft Besitz,
  bucht Material, synchronisiert das Run-Ledger, spielt SFX/Toast und rendert den
  Shop neu. Der Kauf→Verkauf-Zyklus kann dadurch niemals Gewinn erzeugen.
- **Exakte Entfernung:** `Player.sellItem()` (`index.html:5357`) entfernt genau ein
  Exemplar, dekrementiert `itemCounts`, senkt `curse`, entfernt ein vom Item
  erzeugtes Turret (`sourceItem`) und ruft `recalc()` auf. `Player.addItem()` übergibt
  die Item-ID an `spawnTurret()` (`index.html:5415`).
- **UI:** `UI.renderShop()` (`index.html:14050`) rendert je Item-Typ eine Zeile in
  `#invItemRows` mit Name, Anzahl und „Recyceln +N“; die Überschrift zeigt
  „Recycling 25 %“. Die Zeilen nutzen `.wrow`, damit der bestehende Nav-Ring
  (`UI._navCandidates`, `index.html:12983`) sie per Tastatur/Gamepad erreicht.
  Button und Zeile tragen `data-sell-item` für den Live-Test.
- **Co-op:** `Net.buildMenu()` (`index.html:19129`) listet `isell:<id>`-Aktionen;
  `Net.applyPick()` (`index.html:19202`) führt sie über denselben
  `ShopSystem.recycleItem()`-Pfad aus.
- **Keine Attrappen:** Es gibt keinen toten Schalter und keine neue Datenzeile ohne
  Wirkung; die UI-Zeile, der Preis, der State und der Co-op-Pfad sind verbunden.

## Tuning und Messwerte

**Rückerstattungsmatrix** (echte `ShopSystem.priceOf`/`itemSellValue`-Werte aus dem
Browser, 4 Raritäten × 4 Wellen):

| Welle | Item | Preis | Rückerstattung | Quote | Verlust |
|---:|---|---:|---:|---:|---:|
| 1 | Kurhaus-Kaffee (R1) | 21 | 5 | 23,81 % | 76,19 % |
| 1 | Wartungsdrohne (R2) | 47 | 11 | 23,40 % | 76,60 % |
| 1 | Mini-Reaktor (R3) | 75 | 18 | 24,00 % | 76,00 % |
| 1 | Kernspintomograph (R4) | 144 | 36 | 25,00 % | 75,00 % |
| 20 | Kurhaus-Kaffee | 38 | 9 | 23,68 % | 76,32 % |
| 20 | Wartungsdrohne | 86 | 21 | 24,42 % | 75,58 % |
| 20 | Mini-Reaktor | 137 | 34 | 24,82 % | 75,18 % |
| 20 | Kernspintomograph | 262 | 65 | 24,81 % | 75,19 % |

Alle 16 Messpunkte lagen unter dem Kaufpreis; die Quote lag zwischen 23,40 % und
25,00 %, der Verlust zwischen 75,00 % und 76,60 %. Damit ist kein
Kauf→Verkauf-Profit möglich. Die 25 % sind bewusst niedriger als der bestehende
55-%-Waffenverkauf: Waffen belegen einen der sechs knappen Slots, Items stapeln
sich unbegrenzt und würden bei 55 % zu billigen Stat-Leihgaben.

**Live-Durchlauf (Chromium, echtes Menü → Welle 1 → Shop):**

- Kurhaus-Kaffee: Kauf 21, Verkauf 5; Tempo 8 → 14 → 8, Angriffstempo 0 → 4 → 0;
  Material 500 → 479 → 484 (netto −16).
- Fluch der Gier: Kauf 57, Verkauf 14; Fluch 0 → 5 → 0; max. Leben 135 → 105 → 135.
- Wartungsdrohne: Kauf 47, Verkauf 11; Türme 0 → 1 → 0; `itemCounts` nach dem
  Verkauf leer.
- Co-op-Menü: `isell:kaffee` gefunden (`recyceln: Kurhaus-Kaffee (+5)`), Host-Pfad
  entfernt das Item und bucht 5 Material.
- Nächste Welle: Welle 1 → 2, `state=play`, 3 lebende Gegner, Spieler lebt.
- Konsole/Pageerrors: **0**.

**Starke/schwache Builds:** Der Verkaufspreis hängt nur von Item, Welle und Gefahr
ab, nie von Spieler-Stats; der Stat-Rückbau läuft für jeden Charakter durch
denselben `recalc()`-Pfad. Der Live-Lauf misst den vollständigen Rückbau an einem
Charakter (Tempo, Angriffstempo, max. Leben), der Fluch- und Turret-Sonderfall ist
separat gemessen. Es wurden keine Kampfwerte, Gegnerzahlen oder Wellenparameter
verändert.

## Evidenz und Checks

- `docs/pw/item-recycle-live.json` — vollständige Browser-Messung inkl. Matrix,
  Co-op, nächster Welle und `console_errors: []`.
- `docs/pw/item-recycle-shop.png` — Shop mit Item-Zeile „Kurhaus-Kaffee“,
  „Recyceln +5“ und „Recycling 25 %“.
- `tools/_item-recycle-live.py` — reproduzierbares Live-Rig.
- `node tools/horde-cap-playtest.mjs`: **PASS** — 3/3 Szenarien, Kampfpfad
  Kills 69→71, XP 199→213, Material 104→115, deterministisch; Report
  `docs/pw/horde-cap-playtest.json`.
- `node tools/verify.mjs`: **250 pass / 0 fail / 0 skip** (u. a. Veedel, Curse,
  Werkstatt, Item-Pool, BalanceSim, Co-op-Selftests).
- `git diff --check`: sauber. Inline-JS-`node --check`: beide Skripte OK.
- Kein Commit, kein Push; die Änderungen bleiben im Working Tree.
