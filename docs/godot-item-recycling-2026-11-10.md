# Godot-Parität: Item-Recycling im Shop (2026-11-10)

## Ausgangslage

Der Brotato-Gap-Audit (`docs/pw/brotato-gap-audit-2026-11-09.md`) hatte als
kleinste offene Shop-Lücke den **Rückweg für Items** markiert: Der Browser
recycelt Items mit 25 % (`BROTATO_RULES.itemRecycleRate`), der Godot-Port
kannte nur Kaufen, Reroll, Locks und Waffen-Fusionen. Ein Fehlkauf oder ein
nicht mehr passendes Fundstück band damit dauerhaft Material und Inventar.
Diese eine Funktion ist jetzt im Godot-Port umgesetzt; Kampf-, Gegner- und
Wellenlogik bleiben unverändert.

## Umsetzung

- **Regel zentral:** `GameData.rules.itemRecycleRate` (0,25) steuert Preis und
  UI-Text; im Code steht nur der Fallback 0,25.
- **Preisformel identisch zum Kauf:** `round(price * (1 + Welle * 0,025) *
  danger.price)`; die Rückerstattung ist `floor(Preis * Rate)`, mindestens
  1 Material. Dadurch ist die Rückerstattung immer kleiner als der Kaufpreis.
- **Exakte Entfernung:** `Player.sell_item(id)` entfernt genau eine Kopie aus
  `items` und ruft `recalc()`. Da `recalc()` alle Totals neu aus den
  Basiswerten, Items, Boni und der Synergie aufbaut, rollt es jeden Stat
  vollständig zurück; bei sinkendem Max-Leben wird `hp` geklemmt.
- **Gruppierung:** `main._recycle_groups()` fasst gleiche Item-IDs zu einer
  Zeile mit Anzahl und Rückerstattung pro Kopie zusammen.
- **Transaktion:** `main._on_shop_recycle(id)` prüft Shop-Zustand und Besitz,
  bucht Material, rendert den Shop neu, aktualisiert das HUD und speichert den
  Run. Unbekannte IDs werden ohne Materialbuchung abgelehnt.
- **UI:** Der Shop zeigt unter den Angeboten eine eigene, horizontal scrollende
  Inventarzeile „INVENTAR · RECYCLING 25 % RÜCKERSTATTUNG“ mit einem Button je
  Item-Typ („Name ×Anzahl / +N Material“). Ohne Inventar bleibt der Abschnitt
  verborgen. Der Button läuft über das echte Signal `shop_recycle(id)`.

## Tuning und Messwerte

Rückerstattungsmatrix bei Danger 0 (Preis / Rückerstattung, Quelle:
`data.js`-Items und dieselbe Formel wie im Shop):

| Welle | Kurhaus-Kaffee (R1) | Laufschuhe (R1) | Wartungsdrohne (R2) | Mini-Reaktor (R3) |
|---:|---:|---:|---:|---:|
| 1 | 21 / 5 | 18 / 4 | 46 / 11 | 74 / 18 |
| 10 | 25 / 6 | 23 / 5 | 56 / 14 | 90 / 22 |
| 20 | 30 / 7 | 27 / 6 | 68 / 17 | 108 / 27 |

Vollständiger Sweep über **125 Items × 9 Dangers × 5 Wellen (1/5/10/15/20) =
5.625 Preis-/Rückerstattungspaare**: kein Fall mit Rückerstattung ≥ Preis.
Die Quote lag zwischen **21,05 %** (Laufschuhe, Welle 1: 4 von 19) und
**25,00 %** (Preis durch 4 teilbar). Ein Kauf→Recycling-Zyklus verliert damit
immer Material; die 25 % liegen bewusst unter dem 55-%-Waffenverkauf des
Browsers, weil Items keinen der sechs Waffenslots belegen.

## Evidenz und Checks

- `godot/tests/shop.gd` erweitert: Kauf→Recycling eines echten Items,
  Rückerstattung 5 bei Preis 21, exakte Ein-Kopie-Entfernung, vollständiger
  Tempo-Rollback, unverändertes Material bei unbekannter ID, UI-Zeile mit
  „×2“ und echter `Button.pressed`-Pfad, der genau eine Kopie entfernt.
- `SHOP`-Gate: **Exit 0**, alle neuen Flags `true`, `refund: 5`.
- `Ui`, `Smoke`, `Systems`, `Pickup`, `Persistence`, `Loop`: **Exit 0**.
- `Balance` (beide Danger-Stufen, Seed 12648430): **Exit 0**. Die hier
  dokumentierten 694/358 Rest-HP gelten für den Stand vor der aktiven
  Curse-Mechanik; die aktuellen Werte inklusive Onboarding stehen in
  `godot-curse-2026-11-10.md`.
- `node tools/export-godot-data.mjs --check`: **OK** (261.786 B, 44 Charaktere,
  81 Waffen, 125 Items, 83 Gegner, 9 Dangers, 4 Events, 18 Boss-Eskorten).
- `git diff --check`: sauber.

## Grenzen

- Mit dem Build vom 2026-11-10 sind Item-Recycling und Curse-Onboarding in
  APK und EXE gebündelt. Die APK ist debug-signiert (v1/v2/v3), mit
  `zipalign -c -p 4` geprüft und enthält dieselbe `game_data.json` wie die
  Quelle (SHA-256 `f62249b95e7f1052bc783050642c7eb8a2cff06d9b7ed1c17bf478a438e3a7ee`);
  die EXE enthält dasselbe JSON und dieselben kompilierten Shop-/UI-Skripte
  im eingebetteten PCK. Ein Gerätetest war in der Cloud-VM ohne
  USB-Passthrough weiterhin nicht möglich.
- Das Recycling gilt wie im Browser für alle getragenen Items, nicht nur für
  Shop-Käufe; eine Kistenquelle besitzt der Port nicht.
