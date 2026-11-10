# Godot-Parität: Curse-Mechanik (2026-11-10)

## Ausgangslage

Der Brotato-Gap-Audit (`docs/pw/brotato-gap-audit-2026-11-09.md`) führte Curse
als fehlende Browser-Mechanik: `BROTATO_RULES.curse` und zwölf verfluchte Items
waren in `data.js` vorhanden, der Godot-Port las sie aber nirgends. Pets und der
Fünf-Viertel-Stadtfortschritt wären größere, balancekritischere Systeme gewesen;
Curse ist vollständig datengetrieben und im normalen Run erlebbar. Diese eine
Lücke ist jetzt geschlossen.

## Datenquelle

Alle Zahlen kommen aus `data.js`, exportiert nach
`godot/data/game_data.json`; es gibt keine parallele Curse-Tabelle im Godot-Code.

| Feld | Wert | Wirkung pro Fluch-Punkt |
|---|---:|---|
| `hpPctPerPoint` | 1,5 | Gegner-LP +1,5 %, Deckel `hpMultCap` 2,0 |
| `dmgPctPerPoint` | 1,0 | eingehender Schaden +1 %, Deckel `dmgMultCap` 1,6 |
| `luckPerPoint` | 1,5 | Glück +1,5, Deckel `luckCap` 60 |
| `matFlatPer` | 5 | +1 Material pro Kill je 5 Punkte, Deckel `matFlatCap` 3 |

Die zwölf Items `c_gier`, `c_raserei`, `c_zorn`, `c_stille`, `c_eisen`,
`c_echo`, `c_schwerkraft`, `c_hunger`, `c_rost`, `c_wucher`, `c_zeit` und
`c_laerm` tragen `cursed: true` und `curse: 5` oder `6`. Ihre normalen Stats
werden wie bei jedem Item angewendet; der Fluch ist die zusätzliche Risk-/Beute-
Komponente.

## Umsetzung

- **Ein Meter, keine Zweitkopie:** `Player.curse` wird in `recalc()` aus den
  `curse`-Werten der getragenen Items abgeleitet. Dadurch funktionieren
  Save/Load und Recycling ohne separaten Zähler, der driften könnte.
  `curse_changed` aktualisiert HUD und Shop.
- **Gegner:** `Enemy.setup()` multipliziert die Daten-LP mit
  `min(2,0, 1 + curse * 1,5 / 100)` und addiert
  `min(3, floor(curse / 5))` Material pro Kill.
- **Eingehender Schaden:** `main._incoming_damage_mult()` kombiniert die
  Danger-Spätkurve mit `min(1,6, 1 + curse * 1,0 / 100)`. Der Pfad wird von
  Kontakt, Projektilen und `damage_player()` genutzt, also nicht nur von einer
  Schadensart.
- **Glück:** `recalc()` addiert `min(60, curse * 1,5)` auf `stats.luck`; im Port
  wirkt das auf den Pickup-Radius. Der Browser nutzt Glück zusätzlich für die
  Shop-Seltenheit (siehe Grenzen).
- **UI:** HUD-Label, Shop-Kopfzeile mit Tooltip, Fluch-Suffix an Angeboten und
  Level-Up-Karten sowie `☠ -N` in der Recycling-Zeile. Der Fluch-Abbau ist damit
  vor dem Verkauf sichtbar.
- **Onboarding-Garantie:** `_roll_shop()` ruft nach der normalen Rotation
  `_ensure_curse_offer()`. Ist `wave >= 4`, `player.curse == 0` und kein
  verfluchtes Item im Angebot, ersetzt es einen Item-Slot (oder einen von
  mindestens zwei Waffen-Slots) durch ein verfluchtes Item mit
  `r <= min(4, 2 + floor(wave / 4))`. Preis und Beschreibung laufen über
  denselben `_make_item_offer()`-Pfad wie normale Items. Die Garantie greift
  auch nach einem Reroll: `_on_shop_reroll()` ruft sie erneut auf und übergibt
  nur die entsperrten Indizes; gesperrte Angebote bleiben unangetastet.
- **Recycling:** `Player.sell_item(id)` entfernt genau eine Kopie und ruft
  `recalc()`; der Fluch sinkt automatisch mit dem Item. Der echte
  `Button.pressed`-Pfad wird im Gate geprüft.
- **Persistenz:** Der Meter steckt nur im Inventar. `save_progress()` und
  `resume_run()` stellen ihn dadurch ohne Sonderfeld wieder her.

## Messwerte und Balance

Seed `12648430`, Autopilot ohne Test-Buffs, beide Danger-Stufen mit voller
Curse-Mechanik:

| Metrik | Danger 0 | Danger 3 |
|---|---:|---:|
| Ergebnis | Sieg, Welle 20 | Sieg, Welle 20 |
| Rest-HP / Max-HP | 1.346 / 1.346 | 1.274 / 1.274 |
| Heil-Orbs | 66 | 140 |
| Kills | 858 | 1.522 |
| Ticks | 34.610 | 42.642 |
| Erlittener Schaden | 160,9 | 7.028,9 |
| Fluch am Ende | 5 | 15 |

Beide Läufe gewinnen; Danger 3 nimmt **43,7-mal** so viel Schaden und erzeugt
mehr Heil-Orbs aus mehr Kills. Beide enden auf ihrem jeweiligen Maximal-HP,
die absolute End-HP hängt aber am Build und ist kein stabiler Gefahrenvergleich.
Das Balance-Gate vergleicht deshalb `damage_taken` (in `Player.take_damage`
akkumuliert) direkt.

Die frühere Referenz 694/358 Rest-HP ist nur mit neutralisierter Curse-Wirkung
reproduzierbar. Die 550/674-Werte stammen aus der Zeit vor dem Onboarding; mit
der Garantie sind 1.346/1.274 die aktuellen, ehrlichen Messwerte. Die
`DANGERS`-Tabelle, `waveClearHealPct` und alle anderen Balance-Regeln wurden
nicht verändert.

## Evidenz und Checks

- `godot/tests/curse.gd` + `Curse.tscn`: Onboarding-Garantie (Welle 4,
  Raritätsdeckel, Waffen-Slot-Fallback, Lock-Schutz, No-Op vor Welle 4 und bei
  aktivem Fluch), echter Shop-Kauf über `Button.pressed`, Erhöhung des Meters,
  Gegner-LP und -Material, zentraler Schadensmultiplikator, Glück, Caps mit
  synthetischen Items, Recycling über den echten Button, ungültige Index-/ID-
  Eingaben als No-Op sowie Save/Load mit erneut skalierendem Gegner. Ausgabe
  `CURSE`, alle Flags `true`, Exit 0.
- `Balance` (beide Stufen): Exit 0, `damage_taken` 160,9 vs. 7.028,9.
- `Shop`, `Ui`, `Smoke`, `Systems`, `Pickup`, `Persistence`, `Loop`: Exit 0.
- `node tools/export-godot-data.mjs --check`: OK; `git diff --check`: sauber.

## Grenzen

- Kein USB-Gerätetest in der Cloud-VM. Der Build vom 2026-11-10 enthält
  Curse und Onboarding in APK und EXE; die Debug-APK ist über v1/v2/v3
  signiert, zipalign-geprüft und die gebündelte `game_data.json` ist
  byte-identisch zur Quelle.
- Glück wirkt im Port nur auf den Pickup-Radius. Die Browser-Fassung verwendet
  es zusätzlich für Shop-Seltenheit; das ist eine bewusste, dokumentierte
  Port-Grenze, keine stille Gleichsetzung.
- Die Onboarding-Garantie greift nur bei Fluch 0; sobald der erste Fluch
  getragen wird, folgt der Shop wieder der normalen Rotation. Das entspricht
  dem Browser.
- `damage_taken` ist eine Diagnose-/Gate-Metrik und wird beim Setup eines Runs
  zurückgesetzt. Sie ist nicht Teil des Save-Schemas.
- Der Autopilot bewertet Items nach Stats und kauft deshalb auch verfluchte
  Items; die gemessenen End-Builds sind keine Aussage über optimale
  menschliche Builds.
