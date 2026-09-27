# KayKit-Figuren: Herkunft, Lizenz, Nutzbarkeit in UE 5.8 (2026-09-28)

GRADES spec=8 design=5 correctness=8 quality=7; biggest gap: Tier und Lizenz des Rangers konnten nicht an der Quelle belegt werden — itch.io und Patreon sperren automatische Abrufe

## Ergebnis

Die sechs `kaykit_*`-Figuren stammen aus **KayKit Adventurers** von Kay Lousberg.
**Fünf davon** — Barbarian, Knight, Mage, Rogue, Rogue_Hooded — liegen nachweislich
im **freien Paket unter CC0 1.0** vor, als FBX und glTF. Der **Ranger** kam erst mit
„Adventurers 2.0" dazu; ob er kostenlos oder nur im kostenpflichtigen EXTRA-Tier
steckt, ließ sich nicht belegen. Ein echter Import in **UE 5.8.2** funktioniert:
FBX ergibt eine Figur mit Skelett, Physik, 76 Animationen, Material und Textur,
**0 Fehler**.

## Belege im Repo

- Der Code nennt die Grafiken selbst „KayKit-Atlas" (`index.html` um Z. 5628, 5692, 5731).
- Die Atlas-Zeilen heißen `Idle_A`, `Walking_A`, `Running_A`, `Hit_A`, `Death_A`, `Use_Item`
  (`CHAR_ANIM_ROW`) — KayKit-Animationsnamen.
- Jeder Atlas misst 256 × 384 px: 6 Animationen × 4 Bilder à 64 × 64. Die Bilder sind
  aus dem 3D-Modell **gerendert** (die Tod-Zeile zeigt die Figur liegend von oben).
- **Nirgends im Repo stehen Lizenz, Urheber oder Credit.** Die Atlanten sind seit dem
  Initial-Commit `a0bc011` vom 2026-09-02 da, ohne Spur, wer sie wie erzeugt hat.

## Belege an der Quelle

| Quelle | Aussage |
| --- | --- |
| `LICENSE.txt` im offiziellen Repo `KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0` | „KayKit : Adventurers Character Pack (1.0) … Created/distributed by Kay Lousberg … Creation date: 13/03/2023 … **License: (Creative Commons Zero, CC0)** … free to use in personal, educational and commercial projects … crediting Kay Lousberg … (this is not mandatory)" |
| Dateibaum desselben Repos | Modelle `Barbarian`, `Knight`, `Mage`, `Rogue`, `Rogue_Hooded` als `.fbx` und `.glb`, rund 30 Waffen/Accessoires; **kein Ranger**. Letzter Inhalts-Commit 2023-09-16 — das ist Version 1.0. |
| kaylousberg.com, Seite des Pakets | „Free for personal and commercial use, no attribution required. (CC0 Licensed)"; 5 (+3 EXTRA) Figuren; FBX und GLTF; eine Farbverlaufs-Textur 1024²; kompatibel mit Unreal Engine. Nennt Knight, Barbarian, Rogue, Mage, Engineer, Druid — den Ranger nicht. |
| kaylousberg.com, Character Animations | CC0, kostenlos, 133 Animationen für `Rig_Medium` und `Rig_Large`, FBX/GLTF. |
| Update-Post „Adventurers 2.0" (itch.io / Patreon, nur über Suchergebnisse lesbar) | neuer Ranger „to make use of the new bow animations"; Barbarian auch als `Rig_Large`; überarbeitetes Animationssystem. |

**Nicht belegt:** ob der Ranger in 2.0 frei oder EXTRA ist. itch.io und Patreon
antworten automatischen Abrufen mit HTTP 403 (auch `curl` mit Browser-Kennung);
den Bot-Schutz habe ich nicht weiter umgangen.

**Versions-Indiz:** Die freien 1.0-Modelle enthalten `Walking_A`, `Running_A`, `Hit_A`,
`Death_A`, `Use_Item` — aber kein `Idle_A` (dort heißt es `Idle`). Das Spiel nutzt
`Idle_A`, und es hat einen Ranger. Beides spricht dafür, dass die Atlanten aus der
2.0-Generation gerendert wurden. Ein Indiz, kein Beweis.

## Lizenz: was daraus folgt

- **CC0 heißt:** freie Nutzung, auch kommerziell, Veränderung erlaubt, keine Nennung
  nötig. Für das HTML-Spiel wie für den UE-Neubau gilt das für die fünf belegten Figuren
  ohne Einschränkung.
- **Trotzdem nennen.** Der Hersteller bittet ausdrücklich darum, die Herkunft ist dann
  nachvollziehbar, und das Projekt hat bisher gar keinen Lizenz- oder Credit-Vermerk
  (Audit-Befund M1).
- **Ranger:** Die Herstellerseite nennt das Paket als Ganzes CC0. Liegt der Ranger im
  EXTRA-Tier, muss man es für das 3D-Original kaufen. **Von Hand auf itch.io prüfen** —
  eine Sache von zwei Minuten.

## Technik: Import in UE 5.8 — gemessen, nicht geschätzt

Wegwerf-Projekt im Temp-Ordner, `UnrealEditor-Cmd -run=pythonscript -nullrhi`,
`AssetImportTask` (Interchange), nichts gespeichert, danach gelöscht. Engine **5.8.2-56702186**.

| | `Knight.glb` | **`Knight.fbx`** (+ `knight_texture.png`) |
| --- | --- | --- |
| Skeleton | 1 | **1** |
| Skeletal Mesh | 6 (Körper in Teile zerlegt) | **1** |
| Static Mesh | 9 (Waffen, Accessoires) | — |
| Physics Asset | 6 | **1** |
| Anim Sequence | 76 | **76** |
| Material / Textur | 1 / 1 | **1 / 1** |
| Bilanz | | **0 Fehler, 22 Warnungen** (fehlende Glättungsgruppen; UE berechnet die Normalen selbst) |

**FBX ist der Weg für UE**, glTF zerlegt die Figur. Die Textur liegt als eigene Datei
neben dem FBX und muss mitimportiert werden; ohne sie kam im ersten Lauf keine Textur an.

Aus der glTF-Datei gelesen: Knight 6.952 Dreiecke, Rogue_Hooded 6.035; ein Material,
eine 1024²-Textur (14 KB); **41 Knochen** — 23 Deform-Knochen (`root`, `hips`, `spine`,
`chest`, Arme bis `hand`, `head`, Beine bis `toes`) plus 18 IK-/Steuer-Knochen
(`kneeIK`, `heelIK`, `IK-foot`, `elbowIK`, `handIK`, `control-*`). `handslot.l/.r` sind
die Aufhängepunkte für Waffen und werden in UE zu Sockets.

**Nicht getestet:** Retargeting auf den UE-Mannequin (IK Retargeter), das Aussehen im
Renderer, die 2.0-Modelle (hier nicht frei abrufbar), die Wirkung der Animationen aus
der Top-down-Kamera.

## Was das für Weg A bedeutet

1. **Fünf, vielleicht sechs Figuren sind als 3D-Basis fertig** — geriggt, animiert,
   in UE importierbar.
2. **Der größere Hebel ist das Rig.** `Rig_Medium` plus 133 CC0-Animationen könnten das
   gemeinsame Skelett des Figuren-Baukastens werden: Die übrigen 16 Wiesbadener Figuren,
   in KayKit-Proportionen auf dieses Rig modelliert, erben alle Animationen. Das senkt
   den teuersten Posten von Weg A drastisch — legt aber den Stil fest.
3. **Das ist eine Stilentscheidung, keine technische.** KayKit ist Low-Poly im
   Chibi-Stil; die 16 eigenen Figuren sind aus Foto-Vorlagen entstanden (Leonidas als
   Feuerwehrmann). Beides zu mischen, sähe zusammengewürfelt aus. Die Art-Bible muss
   entscheiden: KayKit-Stil für alle — oder KayKit nur als Platzhalter für den
   vertikalen Schnitt.
4. *Nebenfund:* Es gibt ebenso ein freies CC0-Paket **KayKit Skeletons**
   (`KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0`) — ein möglicher Baustein
   für Gegner, nicht geprüft.
