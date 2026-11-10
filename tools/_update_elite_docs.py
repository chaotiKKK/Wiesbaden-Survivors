from pathlib import Path

p = Path('docs/content-scope-brotato-2026-11-08.md')
s = p.read_text(encoding='utf-8')

def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        raise SystemExit(f'anchor count {n} != {count}: {old[:90]!r}')
    s = s.replace(old, new)

# --- 3. Luecken: elite/horde row ---
rep("| Wellen | 20 | 20 pro Zone | 5 × 20 = 100 |\n| Slots | 6 | 6 | 6 |",
    "| Wellen | 20 | 20 pro Zone | 5 × 20 = 100 |\n"
    "| Elite-/Hordenwellen | **4/4 live** (11/12/14/15 ab Danger 3) | 4 (hohe Danger) | erreicht; Plan 77/35/100/40 gegen Kontrolle 43/46/50/53, Event-Material 59/79/73/106 |\n"
    "| Slots | 6 | 6 | 6 |")

# --- 4. Funktionsmatrix ---
rep("| Eliten/Horden | **4 eigene Wellen** (11/12/14/15, ab Danger 3), live gemessen | Wellen 11/12/14/15 (hohe Danger) | 4 Elite-/Hordenwellen |",
    "| Eliten/Horden | **4 eigene Wellen** (11/12/14/15, ab Danger 3; Horden ×1,8/×2,0, Eliten ×0,75 mit Elite-Rate 0,18/0,20, Material 45/60/55/80), live gemessen | Wellen 11/12/14/15 (hohe Danger) | 4 Elite-/Hordenwellen |")

# --- 5. Zielbild: bullet ---
old_bullet = """- **100 Wellen**: 5 × 20, dazu vier Elite-/Hordenwellen (11/12/14/15) auf hohen
  Gefahrenstufen — **umgesetzt und live gemessen** (Danger-Gate 3, siehe
  Live-Nachweis in Abschnitt 8)."""
new_bullet = """- **100 Wellen**: 5 × 20, dazu vier Elite-/Hordenwellen (11/12/14/15) auf hohen
  Gefahrenstufen — **umgesetzt und live gemessen**. Ab Danger 3 tragen sie
  eigene Events: Horden ×1,8/×2,0, Elitewellen ×0,75 mit Elite-Rate 0,18/0,20,
  Abschlussmaterial 45/60/55/80 (mit Danger-3-Preisfaktor 1,32 gemessen:
  59/79/73/106). Die Live-Kampagne übernimmt Mult und Elite-Rate in
  `buildCampaignSpawnPlan()`; Welle 15 ist bewusst **keine** Bosswelle.
  Rohwerte: Plan 77/35/100/40 gegen Kontrolle 43/46/50/53 (Abschnitt 8)."""
rep(old_bullet, new_bullet)

# --- 5. Abnahmekriterien: add criterion 8 ---
crit = """8. Elite-/Hordenwellen: `node tools/elite-waves-playtest.mjs` endet grün mit
   **4/4 Events** und **8/8 Prüfungen je Welle** plus Shop-Übergang. Danger 0–2
   liefern `null`, Danger 3 `horde/elite/horde/elite`, Welle 13 bleibt normal.
   Die gemessenen Rohwerte (Plan/Kontrolle, Live-Eliten, Bedrohung, Material)
   stehen in Abschnitt 8.

"""
rep("### 5.1 Live-Kampagne Fünf Viertel (Stand 2026-11-08)",
    crit + "### 5.1 Live-Kampagne Fünf Viertel (Stand 2026-11-08)")

# --- 8. Live-Nachweis: replace the whole subsection body with fresh raw values ---
start = "### Live-Nachweis: Elite-/Hordenwellen (2026-11-08)"
end = "### Live-Nachweis: Stadtgeschichte im Regelkern (2026-11-08)"
i = s.index(start)
j = s.index(end)

new_section = """### Live-Nachweis: Elite-/Hordenwellen (neu gemessen 2026-11-09)

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

"""
s = s[:i] + new_section + s[j:]

# --- 9. Grenzen: keep the limit honest for the fresh run ---
rep("""- Der Elite-/Horden-Nachweis deckt 600 Update-Schritte je Welle und den
  normalen Wellen-/Shop-Übergang ab, keinen vollständigen menschlichen
  20-Wellen-Lauf; die Balance-Aussage stützt sich auf Plan-HP/DMG aus der
  Engine, nicht auf Spielgefühl.""",
    """- Der Elite-/Horden-Nachweis (neu gemessen 2026-11-09) deckt 600
  Update-Schritte je Welle, die Kampagnen-Planung und den normalen
  Wellen-/Shop-Übergang ab, keinen vollständigen menschlichen 20-Wellen-Lauf;
  die Balance-Aussage stützt sich auf Plan-HP/DMG aus der Engine, nicht auf
  Spielgefühl.""")

p.write_text(s, encoding='utf-8')
print('updated content-scope doc: elite/horde matrix, spec, acceptance, live proof')
