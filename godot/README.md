# Wiesbaden Survivors — Godot 4

Eigenständiger Godot-4.4.1-Port von Wiesbaden Survivors für **Windows** und
**Android**. Das HTML-Spiel bleibt die Datenquelle; der Godot-Port lädt die
kompletten exportierten Registries und läuft ohne Browser.

## Stand

- 2D-Vektorgrafik, GL-Compatibility-Renderer, 1280×720, `canvas_items`-Stretch.
- 20 Wellen, Bosse alle fünf Wellen, automatisches Feuern, XP/Level-Up, Shop,
  Materialien, Dash, Seed, Speicherstand — danach optional **Endlosmodus**.
- Datengetrieben: **44 Charaktere, 81 Waffen, 125 Items, 83 Gegner, 10 Bosse,
  8 Arenen, 6 Werkstatt-Aufträge** aus `data.js` via `data/game_data.json`.
- **Alle 44 Charakterfähigkeiten** sind aktiv einsetzbar: neun Effekt-Archetypen
  (Kegel, Nova, Dash, Heilung, Buff, Projektil-Salve, Kette, Magnet/Sammeln,
  Geschützturm), Rang-Skalierung ab Level 6/11/… und Abklingzeit-Boni aus Items.
- **Charaktersynergien** zählen die echten Waffenklassen in den Slots und
  schalten den Datenbonus frei; HUD und Charakterauswahl zeigen den Fortschritt.
- **19 Gegner-KI-Familien**: u. a. Schützen, Lader, Heiler, Aura-Schilder,
  Beschwörer, Teleporter, Kreisel, Mörser, Weber, Wächter-Strahlen, Blutsauger,
  Bomber, Spiegel, Kolosse und Sirenen. Gefahrenzonen, Minen, Netze und Strahlen
  sind echte Weltobjekte.
- **Boss-Phasen** nutzen die Datenmuster `radial`, `spiral`, `crossfire`,
  `bulletHell`, `charge`, `shotgunBurst`, `rails`, `waterjet`, `steamCone`,
  `shockwave`, `wailRings`, `bellwave`, `geysers`, `arenaHazard`, `orbitMines`
  und `stoneRain` inklusive Phasen-Beschwörungen.
- **Wellenereignisse** ab Danger 3: Hordenwellen 11/14 mit erhöhter Dichte und
  Elitenwellen 12/15 mit garantierter Elite-Eröffnung, Elite-Chance und
  zusätzlicher Materialbelohnung. HUD zeigt Ereignis und Elitenzahl.
- **Danger-Boss-Eskorten:** ab Danger 3 tragen Bosse zusätzliche Elite-
  Eskorten; auf Danger 3 erscheinen sie ab Welle 15. Anzahl und Startwelle
  kommen aus `bossEscort`/`bossEscortFrom` und skalieren mit der Danger.
- **Shop-Werkstatt mit Waffen-Merging:** zwei identische Waffen desselben
  Tiers (T1–T3) verschmelzen zu einer Waffe der nächsten Stufe; beide Quellen
  werden verbraucht, die Stat-Skalierung kommt aus den Waffendaten.
- **Werkstatt-Aufträge:** sechs dauerhafte Lauf-Upgrades mit Auf- und
  Abschwächung, zwei pro Shop getrennt von den sechs normalen Angeboten. Sie
  stapeln bis zu ihrem Datenlimit, der Preis steigt mit Welle und Stapel, und
  die Wirkung läuft über denselben `recalc()`-Pfad wie Items. Rerolls lassen
  die Aufträge stehen; Stapel und aktive Angebote überleben Save/Resume.
- **Item-Recycling im Shop:** jedes getragene Item lässt sich für
  `BROTATO_RULES.itemRecycleRate` (25 %) des aktuellen Preises zurückgeben —
  eine Kopie pro Klick, exakte Entfernung und vollständiger Stat-Rückbau über
  `recalc()`. Preis und Rückerstattung nutzen dieselbe Wellen-/Danger-Formel,
  ein Kauf→Recycling-Zyklus kann deshalb nie Gewinn erzeugen.
- **Curse-Mechanik aus `BROTATO_RULES.curse`:** verfluchte Items heben den
  Fluch-Meter (abgeleitet aus dem Inventar). Jeder neu gespawnte Gegner erhält
  mehr LP und Material pro Kill, eingehender Schaden steigt, und Glück wächst
  (Pickup-Radius). Alle Prozente und Caps kommen aus dem `curse`-Block; HUD
  und Shop zeigen Fluch, Wirkung und den Fluch-Abbau beim Recycling. Ab Welle 4
  garantiert der Shop ein verfluchtes Angebot, solange der Spieler fluchfrei
  ist; der Raritätsdeckel folgt dem Browser.
- **Shop-Reroll und Angebots-Locks:** Reroll kostet `5 + Welle + 4 pro Reroll
  + 4 pro gesperrtem Angebot` (wie `BROTATO_RULES.rerollCost`); gesperrte
  Angebote überleben den Reroll, der Preis steigt mit jedem Reroll.
- **Meta- und Run-Persistenz:** `user://`-Save (Schema v2) mit Freischaltungen,
  Bestwerten, Achievements und laufendem Run; Resume im Titel, Quarantäne bei
  defekten Saves statt Absturz.
- **Pickups:** XP, Material und Heilung mit Magnet-/Pickup-Radius; Material
  landet direkt in der Shop-Währung, Heilung skaliert mit den Max-HP und ist
  pro Gegnertyp gestaffelt (normal/Elite/Boss). Die Basis-Heil-Orb-Chance
  bleibt pro Kill bei 8 % und ist nicht danger-abhängig; höhere Danger liefert
  mehr Orbs über mehr Kills, nicht über gekürzte Sustain-Quellen.
- **Danger-Skalierung aus den Daten:** `hp`, `dmg`, `spd`, `cnt`, `price`,
  `reward` und `dmgLate` der `DANGERS`-Tabelle; höhere Danger bringt mehr
  Gegner und lässt den eingehenden Schaden ab Welle 9 steigen, während `reward`
  die Kaufkraft normiert. Die Eskorten verstärken ab Danger 3 die Bosse.
- **Wellenabschluss-Heilung:** 15 % der Max-HP (gedeckelt auf 60 HP) als
  Datenregel `BROTATO_RULES.waveClearHealPct`.
- **6 Shop-Angebote** pro Wellenende, **4 Level-Up-Optionen**, maximal sechs
  Waffen und der unveränderte Horden-Deckel von 100.
- Touch-Steuerung: linker Joystick, Dash- und Fähigkeitsbutton; Desktop:
  WASD/Pfeile, E/Q = Fähigkeit, Shift/Space = Dash, Esc = Pause.

## Voraussetzungen

- [Godot 4.4.1](https://godotengine.org/) mit den passenden Export-Templates.
- Für Windows: Godot-Template „Windows Desktop“ (x86_64).
- Für Android:
  - JDK 17 oder neuer,
  - Android SDK mit `platform-tools`, `platforms;android-34` und
    `build-tools;34.0.0`,
  - ein Debug-Keystore.
- Android-Export verlangt das Projekt-Flag
  `textures/vram_compression/import_etc2_astc=true` (ist gesetzt). Ohne das
  Flag bricht Godot 4.4 im Headless-Export mit einer leeren
  „configuration errors“-Meldung ab.

Debug-Keystore einmalig erzeugen:

```bash
mkdir -p "$HOME/.android"
keytool -keyalg RSA -genkeypair -alias androiddebugkey \
  -keypass android -keystore "$HOME/.android/debug.keystore" \
  -storepass android -dname "CN=Android Debug,O=Android,C=US" \
  -validity 9999 -deststoretype pkcs12
```

In Godot unter **Editor Settings → Export → Android** eintragen:

| Einstellung | Wert |
|---|---|
| Android SDK Path | z. B. `$HOME/Android/Sdk` |
| Java SDK Path | z. B. `/usr/lib/jvm/java-17-openjdk` |
| Debug Keystore | `$HOME/.android/debug.keystore` |
| Debug Keystore User | `androiddebugkey` |
| Debug Keystore Pass | `android` |

Alternativ können die drei Keystore-Werte über
`GODOT_ANDROID_KEYSTORE_DEBUG_PATH`, `GODOT_ANDROID_KEYSTORE_DEBUG_USER` und
`GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD` gesetzt werden.

## Starten

```bash
godot --path godot
# oder im Godot-Projektmanager godot/project.godot öffnen
```

Im Titelbild **SPIELEN** wählen, Charakter, Seed und Danger einstellen und
**LAUF STARTEN**. Der Seed `12648430` ist der feste Test-Seed.

## Bauen

```bash
# Windows (Release, x86_64)
GODOT=/pfad/zu/godot ./godot/build.sh windows

# Android (Debug-APK, direkt installierbar)
GODOT=/pfad/zu/godot ./godot/build.sh android

# beides
GODOT=/pfad/zu/godot ./godot/build.sh all
```

Ergebnisse:

- `build/windows/WiesbadenSurvivors.exe` — eigenständige Windows-Executable
  mit eingebettetem PCK.
- `build/windows/Desktop-Verknuepfung-erstellen.cmd` — per-user Windows-Installer:
  kopiert die EXE nach `%LOCALAPPDATA%\Programs\Wiesbaden Survivors` und legt
  `Wiesbaden Survivors.lnk` auf dem Desktop und im Startmenü an. Keine
  Admin-Rechte nötig; vor einem Update das laufende Spiel schließen. Der
  PowerShell-Helfer `desktop-shortcut.ps1` liegt daneben.
- `build/android/WiesbadenSurvivors-debug.apk` — debug-signierte APK,
  Paket `de.wiesbaden.survivors.godot`, targetSdk 34, arm64-v8a.

### Aktueller Build (2026-11-10)

| Artefakt | Größe | SHA-256 |
|---|---:|---|
| `build/windows/WiesbadenSurvivors.exe` | 98.003.968 B | `395c7e74abb163e6212a427e5f8ac9fbf5d2b4333ea112fc3a8494c044e460f7` |
| `build/android/WiesbadenSurvivors-debug.apk` | 27.370.690 B | `829465f777e132c7b21b365cb752125451e68a9ec0b5a9190ea4728ae84ecf52` |

Die APK ist mit `CN=Android Debug` über v1/v2/v3 signiert,
`zipalign -c -p 4` ist grün; `minSdk 21`, `targetSdk 34`, `arm64-v8a`.
Die gebündelte `assets/data/game_data.json` ist byte-identisch zur Quelle
(SHA-256 `f62249b95e7f1052bc783050642c7eb8a2cff06d9b7ed1c17bf478a438e3a7ee`).
Die EXE ist eine PE32+-Datei mit eingebettetem PCK (71 Dateien); dessen
`data/game_data.json` hat denselben Hash, und `scripts/main.gdc` sowie
`scripts/ui.gdc` sind byte-identisch zu den APK-Versionen. Das `Shop`- und das
`Workshop`-Gate bestätigen Recycling- und Werkstatt-Pfad nach dem Build.

Die Artefakte stammen vom **2026-11-10** und enthalten Item-Recycling,
Curse-Onboarding und Werkstatt-Aufträge. Die Debug-APK ist zum Testen und Installieren gedacht, nicht
für den Play Store. Die Windows-EXE ist nicht Authenticode-signiert; in der
Linux-Buildumgebung fehlte außerdem `rcedit`, daher wurden die Windows-
Versionsressourcen nicht nachträglich angepasst. Für eine Release-APK/AAB muss
im Android-Preset ein eigener Release-Keystore eingetragen und mit
`--export-release "Android" …` exportiert werden; `build.sh` baut bewusst die
debug-signierte Variante.

APK auf einem verbundenen Gerät installieren und Logs ziehen (USB-Debugging
aktivieren, RSA-Dialog am Gerät bestätigen):

```bash
adb devices -l
adb install -r godot/build/android/WiesbadenSurvivors-debug.apk
adb logcat -c
adb shell am start -n de.wiesbaden.survivors.godot/com.godot.game.GodotApp
adb logcat -d -v time > usb-logcat.txt
adb shell screencap -p /sdcard/wbn-usb.png
adb pull /sdcard/wbn-usb.png .
```

## Verifikation

```bash
# Datenexport prüfen (keine Zeitstempel, reproduzierbar)
node tools/export-godot-data.mjs --check

# Start, 900 Ticks, zwei identische Seed-Läufe
godot --headless --path godot res://tests/Smoke.tscn

# echte Button-Signale für Level-Up und Shop
godot --headless --path godot res://tests/Ui.tscn

# Shop: Merge, Locks, Reroll-Kosten, Kauf und Item-Recycling
godot --headless --path godot res://tests/Shop.tscn

# Werkstatt: zwei Angebote, Preis/Stapel, Max-Grenze, UI, Save/Resume, Reroll
godot --headless --path godot res://tests/Workshop.tscn

# Curse: Onboarding, Kauf, Skalierung, Caps, Recycling, Save/Load
godot --headless --path godot res://tests/Curse.tscn

# Pickups: XP/Material/Heilung und Magnetradius
godot --headless --path godot res://tests/Pickup.tscn

# Save/Load inklusive korruptem Save und Shop-Resume
godot --headless --path godot res://tests/Persistence.tscn

# Balance-Autopilot ohne Test-Buffs (echte Input-Actions)
WBN_BALANCE_ONLY=easy godot --headless --path godot res://tests/Balance.tscn
WBN_BALANCE_ONLY=hard godot --headless --path godot res://tests/Balance.tscn

# Erweiterungs-Gate: 44 Fähigkeiten, Synergie, Events, Eliten, Gefahr, Endlos
# (nutzt die echten Buttons/Signale des Hauptscenes)
godot --headless --path godot res://tests/Systems.tscn

# kompletter 20-Wellen-Lauf bis zum Sieg (Test-Buffs für Balance-Isolation)
godot --headless --path godot res://tests/Loop.tscn
```

Die Tests geben maschinenlesbare Zeilen `SMOKE`, `UI`, `SYSTEMS`, `LOOP`,
`SHOP`, `WORKSHOP`, `CURSE`, `PICKUP`, `PERSIST` und `BALANCE` aus und beenden sich mit Exit-Code 1
bei einem Fehler. Der Balance-Test ohne `WBN_BALANCE_ONLY` spielt beide
Danger-Stufen nacheinander und vergleicht sie; die Einzelmodi sind für schnellere
Messläufe gedacht.

Referenzmessung (Seed 12648430, ohne Test-Buffs, voller Zwei-Modus-Lauf mit
aktiver Curse-Mechanik und Onboarding ab Welle 4): Danger 0 gewinnt Wellen 20
mit 1.346 Rest-HP, 66 Heil-Orbs, 858 Kills, 34.610 Ticks und 161 erlittenem
Schaden. Danger 3 gewinnt ebenfalls Wellen 20 mit 1.274 Rest-HP, 140
Heil-Orbs, 1.522 Kills, 42.642 Ticks und 7.029 erlittenem Schaden. Das Gate
fordert beide Siege, `hard.damage_taken > easy.damage_taken` und
`hard.heal_orbs > easy.heal_orbs`.

Die End-HP bleiben ein buildabhängiger Nebenwert: Danger 3 nimmt über den Run
fast 44-mal so viel Schaden, obwohl beide Läufe gewinnen. Das Gate misst
deshalb die direkte Schadenssumme statt eines einzelnen End-HP-Vergleichs.
Die früheren 694/358 Rest-HP gelten für den Lauf ohne Curse-Wirkung; die
550/674-Werte stammen aus der Zeit vor dem Fluch-Onboarding.

## Daten aktualisieren

`data.js` bleibt die einzige Quelle. Nach Änderungen:

```bash
node tools/export-godot-data.mjs
node tools/export-godot-data.mjs --check
```

Das Skript schreibt `godot/data/game_data.json`, prüft die Anzahl der
Registries und bricht ab, wenn der Horden-Deckel nicht 100 ist.

## Scope und Grenzen

- Der Port ist eine spielbare, erweiterte Godot-Adaption, keine 1:1-
  Neuimplementierung aller Browser-Sonderfälle. Die vollständigen Registries
  sind geladen; die 19 Gegner-KI-Familien und alle 16 Bossmuster der exportierten
  Daten werden ausgeführt; Browser-Mods und Browser-Meta-Import bleiben außen
  vor. Werkstatt-Aufträge sind portiert, das browser-only `Druckstoß`-Extra
  des Druckventils nicht.
- Die Fähigkeiten nutzen neun gemeinsame Effekt-Archetypen statt 44 separater
  Sonderimplementierungen. Das hält die Systems testbar und die Darstellung
  konsistent, ist aber bewusst keine exakte Kopie jeder Browser-Animation.
- Kein Browser-Meta-Import, keine Browser-UI, keine Netzwerkfunktionen; der
  Godot-Meta-Fortschritt liegt lokal in `user://` und ist vom Browser getrennt.
- In der Build-Umgebung wurde die APK erfolgreich exportiert und mit
  `apksigner` verifiziert; ein Test auf einem echten Android-Gerät war nicht
  möglich. Die Windows-EXE wurde auf Linux erzeugt, aber nicht auf Windows
  gestartet.
- Builds sind lokal und werden durch `godot/.gitignore` nicht versioniert.
