# Godot-Parität: Werkstatt-Aufträge (2026-11-10)

## Lücke und Auswahl

Der Browser hat mit `RUN_UPGRADES` sechs dauerhafte **Werkstatt-Aufträge** für
den Zwischenwellen-Shop. Der Godot-Port hatte bisher nur Waffen-Merging,
Item-Recycling, Rerolls und Locks; damit fehlte die zweite, langfristige
Materialsenke neben den sechs normalen Angeboten.

Die Aufträge sind bewusst **keine weiteren Items**: Ein Item wandert einmalig
ins Inventar, ein Auftrag wird im laufenden Run gestapelt und verändert über
denselben `recalc()`-Pfad die Spielerstats. Jeder Auftrag trägt Auf- und
Abschwächung, damit keiner strikt dominiert.

## Daten und Regeln

`node tools/export-godot-data.mjs` exportiert die sechs Browser-Aufträge als
`runUpgrades`. Der Export übernimmt die portierten Felder
`id`, `name`, `col`, `desc`, `basePrice`, `priceStep`, `maxStacks` und `stats`;
das browser-only `extras`-Feld wird nicht übernommen.

| Auftrag | Wirkung pro Stapel | Basispreis | Preisstufe | Max. Stapel |
|---|---|---:|---:|---:|
| Schweißgerät | Rüstung +2, Max-HP +6, Tempo −3 | 24 | 0,55 | 4 |
| Kurierfahrt | Tempo +8, Ausweichen +4, Fernkampf −4 | 20 | 0,50 | 4 |
| Messstation | Technik +6, Reichweite +3, Nahkampf −2 | 26 | 0,50 | 3 |
| Trinkgeldkasse | Ernte +3, Glück +4, Schaden −2 % | 18 | 0,60 | 5 |
| Druckventil | Technik +4, Elementar +4, Tempo −2 | 30 | 0,55 | 3 |
| Probelauf | Angriffstempo +5, Krit +3 %, Max-HP −2 | 28 | 0,50 | 4 |

**Preis:**

```text
max(3, round(basePrice × (1 + Welle × 0,045)
                × (1 + bereitsGekaufteStapel × priceStep)
                × Danger-Preisfaktor))
```

Damit steigt der Preis sowohl mit der Welle als auch mit jedem Stapel. Ein
Auftrag kann im selben Shop mehrfach gekauft werden, bis `maxStacks` erreicht
ist; danach sind Button und direkter Handler ein No-Op.

**Shop-Angebot:** Pro Shop werden zwei unterschiedliche, noch nicht
ausgebaute Aufträge gezogen. Sie stehen getrennt von den sechs normalen
Angeboten, überleben einen Reroll und werden erst beim nächsten Wellen-Shop
neu gezogen. Das entspricht dem Browser-Pfad `refreshUpgrades()`; der
Reroll-Vertrag der sechs normalen Angebote bleibt unberührt.

**Stat-Pfad:** `Player.recalc()` addiert für jeden Auftrag
`stats × Stapel` auf dieselben Summen wie Items, Boni und Charaktersynergien.
Kauf, Stapeln, Recycling anderer Items und Save/Resume laufen deshalb durch
eine einzige Neuberechnung; es gibt keinen zweiten Stat-Cache.

**Run-Persistenz:** Der Save enthält `run_upgrades` und die aktuellen
`workshop`-Angebote. Alte Saves ohne diese Felder starten mit leeren
Aufträgen und rollen beim Resume neue Angebote. Die Save-Version bleibt
`v2`, weil die Felder additiv und rückwärtskompatibel sind.

**Getrennter RNG:** Werkstatt-Angebote nutzen `workshop_rng` mit
`seed ^ 0x5f3759df`. Dadurch verschiebt die neue Shop-Rotation weder den
Kampf-RNG noch bestehende Seed-Balances.

## Prüfung

Eigenes Headless-Gate:

```bash
/tmp/godot/Godot_v4.4.1-stable_linux.x86_64 --headless --path godot \
  res://tests/Workshop.tscn
```

`WORKSHOP` ist vollständig grün:

- `catalog_ok` — alle sechs Aufträge mit Stats und Max-Stapeln geladen.
- `natural_ok` — zwei unterschiedliche, gültige Angebote im echten Shop.
- `formula_ok` — Preisformel bei Welle 6, Danger 0.
- `ui_ok`, `after_buy_ui_ok` — echter Button mit `0/4`/`1/4`, Preis und
  steigendem Folgepreis (30 → 47).
- `purchase_ok`, `stat_ok` — Materialabzug und exakt +24 Max-HP, +2 Rüstung,
  −27 Tempo nach dem ersten Schweißgerät-Stapel.
- `stack_ok` — zweiter Stapel verdoppelt die Wirkung.
- `max_ui_ok`, `max_noop_ok` — `MAX`, deaktivierter Button und kein
  Materialabzug über den Handler.
- `insufficient_ok` — zu wenig Material ändert weder Stapel noch Wallet.
- `save_ok`, `restored_workshop_ok` — zwei Stapel und das aktive Angebot
  überleben Save/Resume.
- `reroll_ok` — Reroll lässt die Werkstatt-Angebote unverändert.

Regressionslauf am 2026-11-10: `Workshop`, `Shop`, `Ui`, `Persistence`,
`Curse`, `Smoke`, `Systems`, `Pickup`, `Loop` und `Balance` jeweils **Exit 0**.
Die Balance-Werte bleiben exakt beim bisherigen Stand:

| Metrik | Danger 0 | Danger 3 |
|---|---:|---:|
| Sieg | Welle 20 | Welle 20 |
| Erlittener Schaden | 160,85 | 7.028,91 |
| Heil-Orbs | 66 | 140 |
| Kills | 858 | 1.522 |
| Ticks | 34.610 | 42.642 |

`node tools/export-godot-data.mjs --check` ist grün; die Datei umfasst
**264.622 Bytes** mit 44 Charakteren, 81 Waffen, 125 Items, 83 Gegnern,
10 Bossen, 8 Arenen, 6 Werkstatt-Aufträgen, 9 Gefahren und 18 Boss-Eskorten.
`git diff --check` ist sauber.

## Buildstand

Die Artefakte vom **2026-11-10** enthalten den Werkstatt-Block:

| Artefakt | Größe | SHA-256 |
|---|---:|---|
| `godot/build/windows/WiesbadenSurvivors.exe` | 98.003.968 B | `395c7e74abb163e6212a427e5f8ac9fbf5d2b4333ea112fc3a8494c044e460f7` |
| `godot/build/android/WiesbadenSurvivors-debug.apk` | 27.370.690 B | `829465f777e132c7b21b365cb752125451e68a9ec0b5a9190ea4728ae84ecf52` |

- APK: `apksigner` verifiziert v1/v2/v3, `CN=Android Debug`; `zipalign -c -p 4`
  Exit 0; `minSdk 21`, `targetSdk 34`, `arm64-v8a`.
- APK-Daten: `assets/data/game_data.json`, SHA-256
  `f62249b95e7f1052bc783050642c7eb8a2cff06d9b7ed1c17bf478a438e3a7ee`.
- EXE: eingebetteter PCK bei Offset `97.520.128`, Version 2/Godot 4.4.1,
  71 Dateien; `data/game_data.json` hat denselben Hash. `main.gdc`, `ui.gdc`,
  `game_data.gdc` und `tests/workshop.gdc` sind byte-identisch zur APK.
- Die Windows-EXE ist nicht Authenticode-signiert; `rcedit` fehlte, daher
  wurden Icon/Versionsressourcen nicht nachträglich angepasst.

## Grenzen

- Der Browser-Auftrag **Druckventil** trägt zusätzlich `extras.druckDmg`
  (+8 % Druckstoß). Der Godot-Port besitzt keinen Druckstapel/keine
  Druckentladung; deshalb sind nur die vier Kernstats portiert. Das Feld wird
  nicht als toter Datenwert exportiert oder in der UI versprochen.
- Der Test ist ein Headless-Regel-/UI-/Persistenznachweis, kein menschlicher
  Playtest und keine Aussage über die optimale Pickrate der Aufträge.
- Der Balance-Autopilot kauft keine Werkstatt-Aufträge. Die unveränderten
  D0/D3-Werte belegen deshalb nur, dass der getrennte Werkstatt-RNG und die
  neuen Statpfade bestehende Runs nicht verschieben, nicht die Balance der
  Aufträge selbst.
- Browser-Mods und Browser-Meta-Import bleiben außerhalb dieses Passes.
- Kein Gerätetest, kein Commit, kein Push.
