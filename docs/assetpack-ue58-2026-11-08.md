# Asset-Paket 1 für den UE-5.8-Nachfolger (2026-11-08)

Referenz ist **Brotato in der neuesten Fassung mit allen Addons**, nicht CK3 —
so am 2026-11-08 klargestellt. Gebaut wurde der erste lieferbare Schritt: eine
reproduzierbare Blender-Pipeline plus acht Assets (6 Arena-Props, 1 Gegner,
1 Figur) mit GLB/FBX, Vorschau-Renders und Import-Spezifikation für UE 5.8.

Paket 2 (2026-11-08): [assetpack-2-2026-11-08.md](assetpack-2-2026-11-08.md) —
vier weitere Wiesbaden-Props, zwei Fernkämpfer und ein Boss-Blockout.

Alles hier ist **original und prozedural** entstanden (`tools/blender/build_assetpack.py`),
es wurde keine fremde Geometrie übernommen. Nur die Farbpalette orientiert sich
an `data.js` (Figuren, Gegner, Arenen).

## 1. Was im Paket liegt

| Asset | Typ | Maße (m, B×T×H) | Tris | Verts | Materialien |
| --- | --- | --- | ---: | ---: | ---: |
| `SK_Sebbo` | Figur, geriggt | 0,68 × 0,29 × 1,64 | 2.572 | 1.336 | 7 |
| `SM_Schlurfer` | Gegner (walker) | 1,24 × 0,67 × 1,67 | 1.634 | 855 | 4 |
| `SM_KurhausSaeule` | Prop | 1,00 × 1,00 × 3,37 | 620 | 320 | 2 |
| `SM_NerobergbahnWagen` | Prop | 4,22 × 2,02 × 1,92 | 932 | 488 | 5 |
| `SM_MarktkircheSpitze` | Prop | 3,20 × 3,23 × 4,37 | 526 | 285 | 4 |
| `SM_KochbrunnenBecken` | Prop | 3,44 × 3,44 × 1,72 | 904 | 462 | 3 |
| `SM_KurgartenHecke` | Prop | 2,80 × 1,40 × 1,26 | 576 | 298 | 3 |
| `SM_Litfasssaeule` | Prop | 1,32 × 1,32 × 2,99 | 608 | 318 | 3 |

Summe: **8.372 Tris**, 4.362 Verts, 8 Assets. Dateien:

- `assets/glb/*.glb` (8, zusammen 736.116 B) — Props und Gegner
- `assets/fbx/*.fbx` (8, zusammen 409.104 B) — inklusive geriggter Figur
- `assets/blender/*.blend` (8, 8,2 MB) — Quelldateien
- `assets/renders/*.png` (8 + `_overview.png`, 2,1 MB) — Cycles-Vorschauen
- `assets/manifest.json` — Schema `wbn-assetpack/1`, Maße, Tris, Materialien, Pfade

Die Figur trägt ein 13-Knochen-Rig (root, hips, spine, chest, head, je Arm 2,
je Bein 2) mit starrem Skin pro Bauteil und einer 61-Frame-Idle-Animation bei
24 fps (2,5 s, loopbar). Der Gegner ist ein Static Mesh ohne Animation.

## 2. Pipeline

Blender **4.5.15 LTS**, headless, ohne GPU. Der Build läuft auf 2 Kernen in
wenigen Sekunden; ein Vorschau-Render mit Cycles CPU (420 × 420, 20 Samples,
OIDN) dauert etwa 5 s.

```bash
B=$HOME/tools/blender-4.5.15-linux-x64/blender
export LD_LIBRARY_PATH=$HOME/tools/blender-libs/usr/lib/x86_64-linux-gnu

# alles bauen, inklusive Renders
"$B" -b --factory-startup --python tools/blender/build_assetpack.py

# nur Exporte, ohne Renders (schnell)
"$B" -b --factory-startup --python tools/blender/build_assetpack.py -- --skip-render

# einzelne Assets
"$B" -b --factory-startup --python tools/blender/build_assetpack.py -- --only SK_Sebbo

# Rückimport prüfen (16 Dateien)
"$B" -b --factory-startup --python-exit-code 1 --python tools/blender/verify_assetpack.py
```

Die sechs fehlenden X11-Bibliotheken (`libICE`, `libSM`, `libXfixes`, `libXi`,
`libXrender`, `libxkbcommon`) lagen auf dieser VM nicht vor und wurden ohne Root
aus den Ubuntu-24.04-Paketen nach `$HOME/tools/blender-libs` entpackt. Details
stehen in `tools/blender/README.md`.

## 3. Prüfung

- **Rückimport:** `tools/blender/verify_assetpack.py` lädt jedes GLB und jedes
  FBX neu in Blender. Ergebnis: **16 Dateien, 0 Fehler.** Die Figur kommt mit
  Armature und einer Aktion zurück, alle Props mit Mesh und Materialien.
- **GLB-Signatur:** alle acht Dateien beginnen mit `glTF`; FBX mit
  `Kaydara FBX Binary`.
- **Sichtprüfung:** alle acht Renders angesehen; drei Korrekturen nach dem
  ersten Durchgang (Wasser im Becken war von einer vollen Scheibe verdeckt →
  Torus-Rand; Kirchturm ohne Zifferblatt → Uhr und Tür ergänzt; Figur ohne
  Werkzeug → Schraubenschlüssel in der rechten Hand, Brille auf die Stirn).
- **Manifest:** 8 Assets, alle Renderpfade vorhanden.

Die GLB-Rückimporte zeigen mehr Vertizes als die Quelle (z. B. Sebbo 5.134 statt
1.336), weil glTF an Normalen-/UV-Kanten aufteilt. Das ist kein Defekt; die
FBX-Zahlen stimmen mit der Quelle überein.

## 4. Import-Spezifikation UE 5.8

Im Editor zu prüfen, weil in dieser Umgebung kein Unreal läuft (kein Windows,
keine GPU, 3 GB RAM). Die Angaben sind Sollwerte, keine gemessenen
Engine-Ergebnisse.

| Punkt | Vorgabe |
| --- | --- |
| Einheiten | Blender in Metern, UE in Zentimetern. Import mit Uniform Scale 1.0; die Figur muss **164 uu** hoch sein (1,64 m). |
| Achsen | Autorichtung Blender −Y, Z oben. FBX-Export −Z forward / Y up, GLB Y-up. UE-Import mit *Convert Scene*; Soll-Ausrichtung im Spiel: **+X vorwärts**. Stimmt sie nicht, im Blueprint um 90° Yaw drehen, nicht am Mesh. |
| Pivot | Grundflächenmitte im Weltursprung; Figur mit Füßen auf 0. Alle Dateien so exportiert. |
| Format | Figur als **FBX** (Skelett, Physik-Asset, Animation), Props und Gegner als **GLB**; FBX liegt überall zusätzlich bei. |
| Kollision | `UCX_<Name>_00`-Boxen sind in GLB/FBX enthalten. UE baut daraus die Simple Collision. Beim Becken ist die Box bewusst grob (8-Eck-Außenmaß). |
| Figur | Skeletal Mesh, Physics Asset automatisch erzeugen. Kapsel **Radius 34, Halbhöhe 82**. Animation `Idle` (61 Frames, 24 fps), Loop, Root Motion aus. |
| Gegner | Static Mesh, Kapsel **Radius 55, Halbhöhe 84** (1,67 m). Poolen, kein Tick pro Instanz — der Plan deckelt auf 100 gleichzeitige Gegner. |
| Materialien | Ein Master `M_Wbn_Master` mit Parametern BaseColor (Vector), Roughness, Metallic, Emissive; pro Material eine Instanz (`MI_…`). Keine Texturen, keine UV-Abhängigkeit. |
| LOD/Nanite | LOD0 genügt (alle Assets < 3.000 Tris), Nanite aus. Props als HISM/ISM, Gegner gepoolt. |
| Ordner | `/Game/Wbn/Art/Props`, `…/Enemies`, `…/Characters`, `/Game/Wbn/Materials`, `/Game/Wbn/Data`, `/Game/Wbn/Maps`. |
| Namen | `SM_` Static Mesh, `SK_` Skeletal Mesh, `M_` Material, `MI_` Instanz, `UCX_` Kollision, `A_` Animation. |

**Abnahmeprüfung im Editor:** Höhe gegen die 1,8-m-Mannequin vergleichen; Pivot
auf dem Boden; Kollision blockt; `Idle` läuft und loopt; keine umgedrehten
Normalen; Materialzahl wie in der Tabelle; Importer ohne Warnungen.

## 5. Inhalt, Umfang, Funktionen gegen Brotato

Brotato-Stand laut Wiki und Store (2026-11-08): Hauptversion **1.1.10.9**,
DLC 1 *Abyssal Terrors* (25.10.2024, Patch 1.1.0.0), DLC 2 *Primal Dread*
(02.11.2026, Patch 1.2.0.0). *Primal Dread* bringt eine neue Dschungel-Karte mit
20 Wellen, neue Gegner, Eliten und Bosse, 3 Charaktere (Time Shifter, Veteran,
Archeologist), 17 Waffen, über 30 Items, 3 Pets und die neue **Evolution**-Stat.
*Abyssal Terrors* brachte die Zone *The Abyss* und die **Curse**-Stat. Die Basis
hat 6 Waffenplätze, Wellen von 20–90 s, Danger-Stufen, Endless, lokalen Koop für
zwei und Barrierefreiheits-Regler.

Dieses Projekt, aus `data.js` gezählt (2026-11-08): **23 Charaktere, 42 Waffen,
44 Items, 28 Gegner, 8 Arenen, 8 Bosse, 9 Gefahrenstufen, 9 Mods,
36 Achievements** — 207 Datensätze, 20 Wellen.

| | Brotato (1.1.10.9 + 2 DLC) | Wiesbaden Survivors |
| --- | --- | --- |
| Charaktere | Dutzende über Basis + DLC | 23 |
| Waffen | Hunderte | 42 |
| Items | Hunderte | 44 |
| Gegner | mehrere Zonen | 28 |
| Karten | Crash Site, The Abyss, Primal-Dread-Dschungel (je 20 Wellen) | 8 Arenen, 20 Wellen gesamt |
| Bosse | pro Zone | 8 |
| Schwierigkeit | Danger-Stufen | 9 Gefahrenstufen |
| Koop | lokal 2 (Switch 2: 4) | online und lokal 2 |
| Meta | Freischaltungen, Endless, Curse, Evolution | Freischaltungen, Wetten, Aufträge, Mods |

Der ehrliche Abstand liegt beim **Umfang pro Lauf und pro Zone**, nicht bei den
Systemen: Brotato hat deutlich mehr Waffen- und Item-Kombinationen und eigene
20-Wellen-Zonen; hier liegen alle 20 Wellen in einer Kampagne über acht Arenen.

**Vorschläge für den Nachfolger** (Stand 2026-11-08: Punkt 2 ist im HTML-Spiel gebaut):

1. **Viertel-Karte statt einzelner Arenen.** Fünf Wiesbadener Viertel, jedes mit
   20 Wellen und eigenen Modifikatoren (Kurpark offen, Innenstadt eng, Rheinufer
   weit, Neroberg-Boss, Rheingau-Terrassen). Messbar: 5 × 20 Wellen, je Viertel
   mindestens 3 neue Gegnertypen.
2. **„Stadtgeschichte" als Evolution-Analogon — im HTML-Spiel gebaut.** Zwei
   Items derselben Linie verschmelzen bei Welle 5/10/15 zu einer stärkeren
   Version, deterministisch und in der Balance-Simulation geprüft (7/7
   Parität, 21/21 Stufen, Ratio 0,82–1,21). Das übernimmt Brotatos
   Evolution-Idee, ohne sie zu kopieren; die UE-Portierung steht noch aus.
3. **Koop zu viert nur mit Nachweis.** Die 50-Gegner-Grenze und die Balance sind
   auf zwei Spieler gebaut; erst wenn die Simulation vier Spieler trägt und die
   Frame-Zeit unter Last hält, wird aufgestockt.
4. **Seed und Rangliste.** Der Tages-Seed existiert bereits; im UE-Bau über
   Steam oder EOS mit Replay-fähigem, deterministischem Kern.
5. **Barrierefreiheit als Regler.** Brotatos Health/Damage/Speed-Regler als
   UMG-Einstellungen übernehmen; das HTML-Spiel hat den Screenreader-Kontrakt,
   UE bietet dafür weniger — als bekannten Verlust führen.

## 6. Grenzen

- **Kein Unreal in dieser Umgebung.** Import, Kollision, Animation und
  Materialien sind spezifiziert, nicht in der Engine getestet.
- **Ausrichtung** ist die wahrscheinlichste Stolperstelle: die Figur ist nach
  −Y modelliert; ob nach dem FBX-Import +X vorne ist, muss einmal im Editor
  geprüft werden.
- **Renders sind Cycles-Vorschauen**, keine In-Engine-Screenshots.
- Das Paket ist ein **erster Satz**, keine vollständige Produktion: 6 Props,
  1 Gegner, 1 Figur von geplanten 23 Figuren, 28 Gegnern und 8 Bossen. Die Figur
  hat nur Idle, keine Lauf-/Angriffsanimation; der Gegner ist statisch.
- Nichts davon ist committet (`assets/` ist untracked).
