# UE-Import-Automator — 2026-11-09

## Ergebnis

Der Automator liest die **lebende `data.js`** und den **Live-Kampagnenkatalog
`content/fuenf-viertel.json`** und erzeugt daraus:

- **272 typisierte DataAssets** (10 C++-Klassen, 10 Zielordner),
- **15 Mesh-Importe über Interchange** (14 GLB, 1 FBX-Charakter mit GLB-Fallback),
- einen reproduzierbaren JSON-Export, einen Validierungsbericht und einen Import-Report.

Der Auftrag nannte **207 Datensätze**. Das ist der Stand des
Portierungsplans vom 2026-09-16. Die aktuelle `data.js` enthält **240**
Datensätze; dazu kommen **32 Kampagnengegner** aus `content/fuenf-viertel.json`.
Der Automator schneidet nicht auf 207 ab und hartkodiert auch nicht die 32: er
liest beide Quellen, leitet die Anzahl aus den Dateien ab und weist sie im
Report aus. Die Differenz zu 207 sind 29 zusätzliche Waffen, 2 zusätzliche
Items, 2 zusätzliche Bosse und 32 Kampagnengegner.

| Kategorie | Tabelle/Quelle | Anzahl | DataAsset-Klasse | Zielordner |
|---|---|---:|---|---|
| Charaktere | `CHARS` | 23 | `UWbnCharacterData` | `/Game/Wbn/Data/Characters` |
| Waffen | `WEAPONS` | 71 | `UWbnWeaponData` | `/Game/Wbn/Data/Weapons` |
| Items | `ITEMS` | 46 | `UWbnItemData` | `/Game/Wbn/Data/Items` |
| Gegner | `ENEMIES` | 28 | `UWbnEnemyData` | `/Game/Wbn/Data/Enemies` |
| Arenen | `ARENAS` | 8 | `UWbnArenaData` | `/Game/Wbn/Data/Arenas` |
| Bosse | `BOSSES` | 10 | `UWbnBossData` | `/Game/Wbn/Data/Bosses` |
| Gefahrenstufen | `DANGERS` | 9 | `UWbnDangerData` | `/Game/Wbn/Data/Dangers` |
| Modifikatoren | `MODS` | 9 | `UWbnModData` | `/Game/Wbn/Data/Mods` |
| Erfolge | `ACHIEVEMENTS` | 36 | `UWbnAchievementData` | `/Game/Wbn/Data/Achievements` |
| Kampagnengegner | `FUENF_VIERTEL.enemies` | 32 | `UWbnCampaignEnemyData` | `/Game/Wbn/Data/CampaignEnemies` |
| **Summe** | | **272** | **10 Klassen** | |

`Data.validate()` liefert 0 Fehler; alle Querverweise (Startwaffe, Boss-Arena,
Beschwörungen, Gegner-Splits, Gefahrenstufen) werden zusätzlich geprüft. Der
Kampagnenkatalog wird gegen die tatsächlich geladenen Laufzeitdaten validiert:
32 Gegner, 5 Viertel, 20 Wellen pro Viertel, 100 globale Wellen, 10 Bosse und
10 Modifikatoren. Jeder der 32 Gegner kommt im Wellenplan vor; die
Kampagnen-IDs und -Namen kollidieren nicht mit den 28 Basisgegnern.

## Kampagnengegner: eigenständig, keine Dubletten

Vor der Abbildung wurde der Katalog mit `data.js/ENEMIES` und dem
zusammengeführten Runtime-Katalog `CAMPAIGN_ENEMIES` verglichen. Ergebnis:

- Die 32 Einträge haben **eigene IDs, Namen, Stats und Verhalten**. Es gibt
  **keine exakte normalisierte Dublette** eines der 28 `data.js`-Gegner.
- Die Laufzeit führt Basis- und Kampagnengegner zu **60 eindeutigen Gegnern**
  zusammen (`ENEMIES` + `FUENF_VIERTEL.enemies`, ohne Mutation der Quellen).
- Deshalb ist jeder Kampagnengegner ein **eigenständiges Live-Objekt** und
  erhält ein eigenes `UWbnCampaignEnemyData`-Asset. Es werden keine 32
  Dubletten von Basisgegnern und keine künstlichen Varianten erzeugt.
- Die AI-Familie wird als **Archetyp** gespeichert (`Archetype`, plus
  Familienname/-beschreibung/-konter/-parameter). Eine `VariantOf`-Verknüpfung
  ist in der Quelle nicht belegt und wird **nicht erfunden**:
  `VariantOf` bleibt leer, `StandaloneCampaignEnemy=true`, im JSON steht
  `variantOf: null`.

Die Entscheidung steht maschinenlesbar in `payload.campaign.mappingDecision`
und wiederholt sich pro Kampagnenrecord unter `campaign.mappingDecision`. Der
Export-Report weist `campaign.enemies`, `campaign.records`,
`campaign.exactDuplicates` und `campaign.standalone` aus.

## Pipeline

```text
data.js ─────────────────────────────┐
content/fuenf-viertel.json ──────────┤
                                     └─ tools/export-ue-data.mjs
                                          └─ content/ue/data-records.json
                                               (wbn-ue-data/1, 272 Records)
                                               ├─ unreal/.../wbn_mapping.py   (unreal-frei, testbar)
                                               └─ unreal/.../wbn_ue_import.py (Editor)
                                                    ├─ InterchangeManager.import_asset() -> Meshes
                                                    └─ DataAssetFactory.create_asset()   -> DataAssets
```

Der Exporter schreibt die neun `data.js`-Register und die Kampagnengegner in
**einen** Datensatz. Die Reihenfolge ist stabil: zuerst die neun Register, dann
die Kampagnengegner in Quellenreihenfolge. Jeder Record hat einen global
eindeutigen `assetName`; der Kampagnen-Prefix `DA_CAMPAIGN_ENEMY_` schützt auch
bei gleichen Slugs vor Kollisionen mit `DA_ENEMY_`.

Die Meshes kommen aus `assets/manifest.json`. Der Importer nutzt
`unreal.InterchangeManager.get_interchange_manager_scripted()`,
`create_source_data()` und `ImportAssetParameters` mit `is_automated`,
`replace_existing` und `destination_name`. Es gibt **keinen** Legacy-
`AssetImportTask`-Pfad. Für FBX wird das 5.8-Feature-Flag
`Interchange.FeatureFlags.Import.FBX 1` gesetzt; schlägt der FBX-Import fehl,
fällt der Charakter im Report sichtbar auf GLB zurück. Die Kampagnengegner sind
Datenassets; der Mesh-Bestand des Manifests wird durch sie nicht verändert.

## Dateien

| Datei | Zweck |
|---|---|
| `tools/export-ue-data.mjs` | beide Quellen laden, 272 Records exportieren, Kampagne und Referenzen prüfen, `--check` |
| `content/ue/data-records.json` | generierter, UE-neutraler Datensatz (ca. 332 KB) |
| `unreal/WbnData/WbnData.uplugin` | Runtime-Plugin, `CanContainContent` |
| `unreal/WbnData/Source/WbnData/Public/WbnDataAssets.h` | 10 DataAsset-Klassen, `FWbnWeaponTier`, `FWbnBossPhase` |
| `unreal/WbnData/Source/WbnData/Private/WbnDataAssets.cpp` | `GetPrimaryAssetId()` |
| `unreal/WbnData/Content/Python/wbn_mapping.py` | Feldabbildung und Validierung ohne Unreal |
| `unreal/WbnData/Content/Python/wbn_ue_import.py` | Interchange- und DataAsset-Import |
| `tools/verify-ue-import.mjs` | statische Ende-zu-Ende-Prüfung, inklusive Kampagnenkategorie |
| `unreal/README.md` | Installation und Ausführung im UE-Projekt |

## DataAsset-Modell

Jedes Asset erbt von `UWbnRecordDataAsset` (`UPrimaryDataAsset`) und trägt:

- `RecordId`, `DisplayName`, `Category`, `SourceIndex`,
- `PayloadJson` mit dem **vollständigen** Quellobjekt (verlustfrei),
- `Tags`,
- typisierte Felder der jeweiligen Kategorie.

`GetPrimaryAssetId()` verwendet die Kategorie als PrimaryAssetType und die
`RecordId` als Namen, sodass der AssetManager die zehn Typen getrennt scannen
kann.

Wichtige Abbildungen:

- Charaktere: Stats, Startwaffe, Ability, Synergie, Unlock/Skin/Profil als JSON.
- Waffen: Klassen, Typ, Scaling, vier `FWbnWeaponTier`-Stufen, Legendary/Unlock.
- Items: Rarität, Preis, Stats, Flavor, Cursed/Turret/Thorns.
- Gegner: HP, Tempo, Rüstung, AI, Familie, Flug/Phasing, Wellen, BehaviorJson.
- Kampagnengegner: erbt alle Gegnerfelder und ergänzt `CatalogSource`,
  `Archetype`, `AiFamilyName`, `AiFamilyDescription`, `AiFamilyCounter`,
  `AiFamilyParams`, `CampaignDistricts`, `CampaignWaves` (global 1–100),
  `DistrictWaveCounts`, `FirstGlobalWave`, `LastGlobalWave`, `WaveCount`,
  `StandaloneCampaignEnemy` und `VariantOf`.
- Arenen: Größe, Farben, Theme, Gebäude/Cover, Poison-/Speed-Felder, bewegliche Wände.
- Bosse: Arena, Werte und `FWbnBossPhase`-Array inklusive Beschwörungen.
- Gefahren: Level und fünf Multiplikatoren.
- Mods: Farbe und Beschreibung.
- Erfolge: Progress-Key, Ziel und Beschreibung.

`TMap<FName,float>` kann keine booleschen Tier-Modifikatoren speichern. Der
`elemental: true`-Fall wird dort zu `1.0`; der exakte boolesche Wert bleibt in
`PayloadJson` erhalten. Nicht-numerische Felder werden nie stillschweigend
verworfen. Kampagnen-Wellen sind aus dem Plan abgeleitet, nicht aus einer
separaten Gegnerliste erfunden: `CampaignWaves` enthält die globalen Wellen,
`DistrictWaveCounts` die Verteilung auf die Viertel. Belohnungen stehen in der
Quelle nur als `xp` und `mat` und werden über `XpReward`/`MaterialReward`
abgebildet; separate Freischaltungsfelder enthält der Kampagnenkatalog nicht.
Solche Felder werden nicht erfunden, der vollständige Quellpayload bleibt
jederzeit in `PayloadJson` erhalten.

## Ausführen

### 1. Daten erzeugen und prüfen

```bash
node tools/export-ue-data.mjs
node tools/export-ue-data.mjs --check
python3 unreal/WbnData/Content/Python/wbn_mapping.py --check
node tools/verify-ue-import.mjs
python3 -m py_compile \
  unreal/WbnData/Content/Python/wbn_mapping.py \
  unreal/WbnData/Content/Python/wbn_ue_import.py
```

### 2. In das UE-Projekt kopieren

```bash
cp -r unreal/WbnData <UEProjekt>/Plugins/WbnData
cp content/ue/data-records.json <UEProjekt>/content/ue/
cp -r assets <UEProjekt>/assets
```

Plugin aktivieren und das Runtime-Modul kompilieren. Das Plugin hat
`CanContainContent: true`; die Python-Skripte liegen unter
`Plugins/WbnData/Content/Python/`.

### 3. Import headless starten

```bat
UnrealEditor-Cmd.exe "<UEProjekt>\WiesbadenSurvivors.uproject" ^
  -run=pythonscript ^
  -script="<UEProjekt>\Plugins\WbnData\Content\Python\wbn_ue_import.py" ^
  -unattended -nullrhi -nosplash -stdout
```

Im Editor alternativ in der Python-Konsole:

```python
py "<UEProjekt>/Plugins/WbnData/Content/Python/wbn_ue_import.py"
```

Nützliche Optionen:

```text
--dry-run                        nur planen, nichts schreiben
--validate-only                  Daten prüfen, keine Assets anfassen
--skip-assets                    nur DataAssets
--skip-data                      nur Meshes
--only chars,weapons             Kategorien, IDs oder Asset-Namen filtern
--only campaign                  Kampagnengegner (Alias: campaign_enemies,
                                 campaign-enemies, kampagne, kampagnengegner)
--character-format glb           GLB statt FBX für den Charakter
--report PFAD                    JSON-Report (Default: <Projekt>/Saved/WbnImportReport.json)
```

Der Lauf ist idempotent:

- DataAssets werden geladen und aktualisiert; eine falsche Klasse ist ein
  Fehler und wird nicht überschrieben oder gelöscht.
- Meshes werden mit `replace_existing=True` neu importiert.
- Fremde Assets werden nicht gelöscht.
- Der Report zählt `created`, `updated`, `skipped`, `planned`, `imported`,
  `fallback` und listet jeden Fehler; der Kampagnenblock enthält Quelle,
  Anzahl, Mappingentscheidung und die Kampagnen-Metadaten.

## Was geprüft wurde — und was nicht

In dieser Umgebung geprüft:

- Export aus `data.js` und `content/fuenf-viertel.json`: **272** Records,
  272 eindeutige Asset-Namen, 10 Klassen, 0 Exportfehler.
- Kampagnenvalidierung: 32 Gegner, 5 Viertel, 100 Wellen, 10 Bosse, 0 exakte
  Dubletten, keine ID-/Namenskollisionen, jeder Gegner im Wellenplan.
- `Data.validate()`: 0 Fehler; zusätzliche Querverweisprüfung: 0 Fehler.
- Python-Mapping für alle zehn Kategorien; `--check` meldet 272 Datensätze,
  272 eindeutige Namen und 0 Fehler.
- `py_compile` für beide Python-Dateien.
- Statische Prüfung von JSON, C++-Klassen/Feldern, Plugin-Descriptor,
  Interchange-Aufrufen und Abwesenheit des Legacy-Importers:
  **3187 Prüfungen, 0 Fehler**.
- Bestehende Spielsuite `node tools/verify.mjs --no-browser`: **67/0**.

**Nicht geprüft:** Es gibt in dieser Umgebung keine Unreal-Engine-Installation.
Der C++-Code wurde nicht kompiliert, und Interchange/DataAssetFactory wurden
nicht im Editor ausgeführt. Die Behauptung „Assets wurden importiert“ wäre daher
unbelegt. Der erste Editorlauf muss den Import-Report erzeugen; erst dann ist
die Interchange-Seite praktisch verifiziert. Auch UHT/Blueprint-Sichtbarkeit
der neuen Klasse ist erst mit einem echten Modulbuild belegt.

## Abgrenzung und verbleibende Lücken

- **Kampagnengegner:** vollständig als DataAssets abgebildet. Die 10
  Kampagnen-Bosse stehen bereits in `data.js/BOSSES` und werden dort als
  `UWbnBossData` exportiert, nicht doppelt als Kampagnengegner.
- **Kampagnen-Modifikatoren, Viertel- und Wellenmetadaten:** Die 10 Mods und
  die Viertelstruktur bleiben vorerst Kampagnen-Metadaten. Sie sind keine
  eigenständigen Gameplay-Entitäten und erhalten keine eigenen DataAssets.
  Die pro Gegner relevanten Ausschnitte (Vorkommen, Wellen, Archetyp) sind
  jedoch im Kampagnenrecord enthalten.
- **Kampagnen-Meshes:** Der Mesh-Import bleibt der vorhandene
  `assets/manifest.json`-Bestand. Die Kampagnengegner bringen keine eigenen
  Mesh-Einträge mit; ihre Datenassets sind vollständig, ihre Darstellung ist
  noch nicht an eigene Meshes gebunden.
- **Stats:** `STAT_DEF` (24 Definitionen) wird exportiert, aber nicht als
  DataAsset angelegt; Stats sind keine eigenständigen Spielobjekte.
- **207/272:** 207 war der Planungsstand. Der Automator ist datengetrieben und
  bildet den aktuellen Ist-Stand ab; bei weiterem Content-Wachstum ändert sich
  nur die Eingabe, nicht der Importcode.
