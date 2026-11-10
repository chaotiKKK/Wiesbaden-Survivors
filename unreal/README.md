# WbnData — UE-5.8-Plugin

Dieses Plugin enthält die typisierten DataAssets und den Import-Automator für
Wiesbaden Survivors. Es bildet die **neun Register aus `data.js`** plus die
**32 Kampagnengegner aus `content/fuenf-viertel.json`** ab: **272 Datensätze,
10 DataAsset-Klassen**. Der Portierungsplan nannte 207; das ist nur noch der
historische Planungsstand.

## Installation

1. Ordner `unreal/WbnData` nach `<UEProjekt>/Plugins/WbnData` kopieren.
2. `content/ue/data-records.json` nach `<UEProjekt>/content/ue/` kopieren.
3. `assets/` nach `<UEProjekt>/assets/` kopieren.
4. Projekt öffnen, Plugin **Wiesbaden Survivors Data** aktivieren, Runtime-Modul
   `WbnData` kompilieren.

## Ausführen

Headless:

```bat
UnrealEditor-Cmd.exe "<UEProjekt>\WiesbadenSurvivors.uproject" ^
  -run=pythonscript ^
  -script="<UEProjekt>\Plugins\WbnData\Content\Python\wbn_ue_import.py" ^
  -unattended -nullrhi -nosplash -stdout
```

Im Editor:

```python
py "<UEProjekt>/Plugins/WbnData/Content/Python/wbn_ue_import.py"
```

Der Import legt DataAssets unter `/Game/Wbn/Data/...` und Meshes unter
`/Game/Wbn/Art/...` an. Der Report landet standardmäßig in
`Saved/WbnImportReport.json`. Kampagnengegner lassen sich mit `--only campaign`
(oder `campaign_enemies`, `campaign-enemies`, `kampagne`, `kampagnengegner`)
isolieren; `--dry-run`, `--validate-only` und der JSON-Report decken sie mit ab.

## Vor dem Editorlauf

```bash
node tools/export-ue-data.mjs
node tools/export-ue-data.mjs --check
python3 unreal/WbnData/Content/Python/wbn_mapping.py --check
node tools/verify-ue-import.mjs
node tools/verify.mjs --no-browser
```

## Klassen

`UWbnCharacterData`, `UWbnWeaponData`, `UWbnItemData`, `UWbnEnemyData`,
`UWbnCampaignEnemyData`, `UWbnArenaData`, `UWbnBossData`, `UWbnDangerData`,
`UWbnModData`, `UWbnAchievementData` — alle erben von `UWbnRecordDataAsset`
(`UPrimaryDataAsset`). `UWbnCampaignEnemyData` erbt zusätzlich von
`UWbnEnemyData` und trägt Archetyp/AI-Familie, Viertel, globale Wellen,
`DistrictWaveCounts`, `StandaloneCampaignEnemy` und `VariantOf`.
`PayloadJson` bewahrt das vollständige Quellobjekt.

Die Kampagnengegner sind eigenständige Live-Einträge: eigene IDs, Namen, Stats
und Verhalten, keine exakten Dubletten der 28 Basisgegner. Deshalb bekommen sie
ein eigenes Asset; `VariantOf` bleibt leer, weil die Quelle keine belegte
Basisvariante nennt. Die Begründung steht auch maschinenlesbar im Export und im
Import-Report (`campaign.mappingDecision`).

## Grenzen

- Der FBX-Interchange-Import ist in 5.8 experimentell. Das Skript setzt
  `Interchange.FeatureFlags.Import.FBX 1`; bei einem Fehler fällt der Charakter
  mit einer Warnung auf GLB zurück.
- Die 10 Kampagnen-Bosse stehen bereits in `data.js/BOSSES` und werden dort als
  `UWbnBossData` exportiert, nicht doppelt als Kampagnengegner. Kampagnen-Mods,
  Viertel- und Wellenmetadaten bleiben vorerst Metadaten; die gegnerbezogenen
  Ausschnitte sind in den Kampagnen-Records enthalten.
- Die Kampagnengegner haben noch keine eigenen Mesh-Einträge im
  `assets/manifest.json`; ihre DataAssets sind vollständig, die Darstellung ist
  noch nicht an eigene Meshes gebunden.
- In dieser Arbeitsumgebung ist keine Unreal Engine installiert. Der
  C++-Code und der Interchange-Lauf wurden hier nicht ausgeführt.

Details: `docs/ue-import-automator-2026-11-09.md`.
