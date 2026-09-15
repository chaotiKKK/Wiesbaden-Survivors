# Umbau nach Unreal Engine 5.8 — Plan

Stand 2026-09-16. Grundlage ist der aktuelle Arbeitsbaum (HEAD `ae08ce8` plus
nicht committete Änderungen). Alle Zahlen in diesem Dokument sind am Arbeitsbaum
gemessen, nicht geschätzt; das Messprotokoll steht in Abschnitt 9.

**Überarbeitet am 2026-09-16** nach den vier Grundsatzentscheidungen: Weg **A**
(3D top-down mit echten Assets), Zielplattform **Windows**, das HTML-Spiel wird
**abgelöst**, Mehrspieler wird **früh mitgedacht**. Die Abschnitte 3 bis 6 und 8
sind darauf umgestellt; Abschnitt 8 hält die Entscheidungen samt Wirkung fest.

---

## 1. Ist-Zustand, gemessen

| Kennzahl | Wert |
| --- | --- |
| `index.html` | 18.384 Zeilen, 5.357.018 Bytes (≈ 5,1 MiB) — Engine, UI und Content inline |
| `data.js` | 868 Zeilen, reine Datenregister |
| `sw.js` | 75 Zeilen |
| Systeme im Engine-Script | 26 Top-Level-Objekte/Klassen |
| `ctx.*`-Vorkommen | 3.208 (inklusive Property-Zugriffe wie `fillStyle`) |
| davon reine Zeichen-Methoden | 1.865 |
| `ctx.drawImage` | **6** |
| eingebettete PNGs (base64) | 66 |

**Systeme nach Umfang** (Zeilen, aus den Startzeilen der Top-Level-Definitionen
berechnet):

```
3521 Game          1070 SelfTest        344 Combat        87 Save
2614 AudioSys      1012 Level           262 ShopSystem    75 RNG
1614 FX             773 QUOTES          184 Input         40 MqttWire
1486 UI             454 Net             171 TUNE          39 Turret
1319 Player         388 WeaponSystem    107 Prof          31 Feedback
1144 Enemy          356 BalanceSim       92 Pet           25 ELEMENTS
                                                          23 SpatialHash
                                                          18 Pool
```

Summe der Systemblöcke: 17.249 Zeilen von 18.384.

**Content-Umfang** (aus `data.js` über require gezählt, nicht überschlagen):

| Register | Anzahl |
| --- | --- |
| CHARS | 23 |
| WEAPONS | 42 |
| ENEMIES | 28 |
| ITEMS | 44 |
| ACHIEVEMENTS | 36 |
| ARENAS | 8 |
| BOSSES | 8 |
| DANGERS | 9 |
| MODS | 9 |
| **Summe** | **207** |

**Gegner-Obergrenze, aus dem Code belegt:** `Game._maxSimultaneous = 50`
(`index.html:13232`, zurückgesetzt in `:14037`). Durchgesetzt wird sie beim
Spawn in `:15650` — überzählige Spawns wandern zurück in die `spawnQueue`.
Bosse sind von der Grenze ausgenommen (`if (!s.boss && …)`). Die Wellenlänge
liegt bei `clamp(18 + n * 0.8, 18, 35)` Sekunden (`:13988`).

---

## 2. Die unbequeme Kernaussage zuerst

**Das wird kein Port, das wird ein Neubau mit übernommenem Design.**

Der Beleg steht in den Zahlen oben: von 1.865 Zeichen-Methodenaufrufen sind
**6** `drawImage`. Der Rest ist prozedurale Vektorgrafik — 385× `beginPath`,
275× `fill`, 250× `lineTo`, 246× `fillRect`, 216× `arc`, 175× `moveTo`, 122×
`stroke`, 48× `ellipse`. Dazu 417× `fillStyle` und 259× `globalAlpha`, also
Farbe und Deckkraft ebenfalls im Code statt in Materialien. Die 66 eingebetteten
PNGs sind im Wesentlichen ein paar Lauf-Sprites.

Das heißt: **es existiert praktisch kein Asset-Bestand, den man mitnehmen
könnte.** Jede Figur, jeder Gegner, jeder Effekt ist Code, der Pfade zeichnet.
Dafür gibt es in Unreal keine Entsprechung, die man „übersetzen" kann.

| Übertragbar | Nicht übertragbar |
| --- | --- |
| Die 207 Datensätze samt Balance-Zahlen | Sämtliche Darstellung (1.865 Zeichenaufrufe) |
| Spielregeln: Wellen, Wetten, Aufträge, Arena-Mods | `FX` (1.614 Z.) — wird Niagara, komplett neu |
| Progressions- und Freischaltlogik | `UI` (1.486 Z.) — wird UMG, komplett neu |
| Gegner-Verhaltensmuster (konzeptionell) | `Net` + `MqttWire` (494 Z.) — entfällt ersatzlos |
| `BalanceSim` als Methode | `AudioSys` (2.614 Z.) — wird MetaSounds |
| Die Test-Disziplin aus `SelfTest` + Gate | `Save` (87 Z.) — wird `USaveGame` |

Konzeptionell überträgt sich grob ein Drittel der 17.249 Zeilen Systemcode,
**wörtlich null Zeilen**. Wer den Umbau als Übersetzung plant, plant falsch.

---

## 3. Darstellungsweg — entschieden: A

**Entscheidung vom 2026-09-16: Weg A — 3D top-down mit echten Assets.**

Die Abwägung der drei Wege ist unten dokumentiert, damit später nachvollziehbar
bleibt, *wogegen* entschieden wurde. Meine ursprüngliche Empfehlung war C
(prozedurale Meshes) als vertikaler Schnitt; A ist der aufwendigere, aber auch
der einzige Weg, der ein Produkt mit eigenständiger visueller Identität ergibt.
Die Entscheidung steht, der Rest des Dokuments ist darauf ausgerichtet.

### Gewählt: A — 3D top-down, orthografische oder leicht perspektivische Kamera

Der idiomatische Unreal-Weg. Figuren und Gegner sind Static- bzw. Skeletal
Meshes, Effekte sind Niagara, Beleuchtung macht Lumen, Arena-Props können
Nanite nutzen. Alles, wofür die Engine gebaut ist, funktioniert sofort.

**Was das konkret bedeutet:**

- **Die Asset-Produktion wird ein eigener, paralleler Arbeitsstrang** — nicht
  ein Anhängsel der Programmierung. 23 Charaktere, 28 Gegnertypen, 8 Bosse plus
  Arena-Props. Dieser Strang ist der Terminfaktor des Projekts, nicht der Code.
- **Phase 1 wartet nicht auf Kunst.** Der vertikale Schnitt läuft mit
  Platzhaltern (UE-Mannequin, Grundkörper). Wer den vertikalen Schnitt an
  fertige Assets koppelt, blockiert die gesamte Gameplay-Arbeit hinter einem
  Arbeitsstrang, der Monate braucht.
- **Nicht alles wird Skeletal Mesh.** Siehe Abschnitt 4 — bei bis zu 50
  gleichzeitigen Gegnern ist die Wahl der Gegner-Darstellung die kritischste
  technische Entscheidung des Projekts.
- **Ein Art-Bible vor der Produktion.** 23 Charaktere von wechselnden Händen
  ohne verbindliche Vorgabe zu Proportionen, Silhouette, Farbcodierung und
  Lesbarkeit aus der Top-down-Perspektive ergeben 23 Stile. Die heutige
  Farbcodierung (Element- und Gefahrenfarben) ist funktional, nicht dekorativ —
  sie muss in 3D erhalten bleiben, sonst verliert das Spiel seine Lesbarkeit im
  Gewühl.

### Abgewogen und verworfen: B — Paper2D / PaperZD

Optisch am nächsten am heutigen Spiel. Aber: das heutige Spiel hat **keine
Sprites**, es zeichnet Vektoren (6 `drawImage` gegen 1.865 Zeichenaufrufe). Man
müsste 23 Charaktere mit vollständigen Animationssätzen als Sprites erst
herstellen. Paper2D ist zudem der am schwächsten gepflegte Teil der Engine;
Beleuchtung, Sortierung und Performance sind Handarbeit. Der Weg kombiniert den
Art-Aufwand von A mit den Engine-Nachteilen von 2D.

### Abgewogen und verworfen: C — Prozedural in 3D

Die heutigen Vektorformen als einfache Meshes (Kegel, Quader, Ringe, Scheiben)
mit material-getriebener Farbe. Technisch der kürzeste Weg zu einem spielbaren
Ergebnis, praktisch ohne Asset-Produktion — aber ohne eigenständige visuelle
Identität.

**Rest-Nutzen trotz Verwerfung:** Die C-Darstellung bleibt als
*Platzhalter-Ebene* für Phase 1 sinnvoll. Grundkörper mit Farbcodierung sind in
Stunden gebaut und erlauben es, Gameplay, Lesbarkeit und Performance zu
beurteilen, lange bevor das erste finale Modell existiert.

## 4. Zielarchitektur (UE 5.8, C++)

### Modulschnitt

```
WbnSurvivors/                       (Runtime-Modul)
  Source/WbnSurvivors/
    Core/        Subsysteme, Save, RNG, Datenzugriff
    Data/        UPrimaryDataAsset-Definitionen
    Gameplay/    GameMode, GameState, Character, Controller
    Combat/      Waffen-Komponenten, Projektile, Schadensauflösung
    Enemies/     Gegner-Repräsentation, Spawner, Flussfeld
    UI/          UMG-Widgets (C++-Basisklassen)
WbnSurvivorsEditor/                 (Editor-Modul)
  Balance-Commandlet, Daten-Validierung, Automation-Tests
```

Zwei Module, nicht eines: Balance-Simulation und Datenvalidierung brauchen
`UnrealEd` und dürfen nicht im Shipping-Build landen. Der bereits im Repo
liegende `UnrealDropIn/` (BuildCity-Editor-Guard, laut eigenem README ebenfalls
UE 5.8) gehört in genau so ein Editor-Modul — sein README beschreibt die
Anforderung bereits.

### Klassen-Abbildung

| Heute (JS) | UE 5.8 | Anmerkung |
| --- | --- | --- |
| `Game` (3521 Z.) | `AWbnGameMode` + `AWbnGameState` | Regeln und Wellen-State-Machine in den Mode, replizierter Laufzustand in den State. Die größte Einzelzerlegung des Projekts. |
| `Player` (1319 Z.) | `AWbnCharacter` + `AWbnPlayerController` | Bewegung über `UFloatingPawnMovement`, **nicht** `UCharacterMovementComponent` — es gibt kein Springen und kein Crouchen, CharacterMovement wäre reiner Ballast und repliziert deutlich mehr. |
| `WeaponSystem` + `Combat` (732 Z.) | `UWbnWeaponComponent` je Waffe | Ein `UActorComponent` pro ausgerüsteter Waffe, konfiguriert aus dem Data Asset. Schadensauflösung zentral in einem `UWbnCombatSubsystem`. |
| `Enemy` (1144 Z.) | `AWbnEnemy`, gepoolt | **Kein** `PrimaryActorTick` pro Gegner — siehe Performance unten. |
| `Level` (1012 Z.) | `AWbnArena` + `UWbnArenaSubsystem` | Arena-Layout aus Data Asset, Props als Instanced Static Meshes. |
| `Game.flow` (Flussfeld) | `UWbnFlowFieldSubsystem` (`UWorldSubsystem`) | Bleibt ein eigenes Flussfeld. Navmesh + Crowd ist für bis zu 50 gleichgerichtete Verfolger der schlechtere und teurere Ansatz. |
| `SpatialHash` + `Pool` (41 Z.) | Bleiben als `F`-Structs | Zusammen 41 Zeilen, bewährt, kein Grund sie durch Engine-Äquivalente zu ersetzen. |
| `FX` (1614 Z.) | Niagara-Systeme | Vollständiger Neubau. |
| `UI` (1486 Z.) | UMG + **CommonUI** | CommonUI ist hier wichtig: das Spiel hat bereits ein Nav-Ring-/Gamepad-Fokusmodell mit Sichtbarkeitsfilter und Screenreader-Kontrakt. CommonUI liefert genau diese Semantik, statt sie ein zweites Mal von Hand zu bauen. |
| `AudioSys` (2614 Z.) | **MetaSounds** + Sound Cues | Der prozedurale Synth-Teil bildet sich erstaunlich direkt auf MetaSounds ab — der einzige Bereich, in dem UE *besser* passt als das Original. Die 21 gebackenen `.m4a` werden importierte Assets. |
| `Save` (87 Z.) | `UWbnSaveGame : USaveGame` | Die Migrationslogik aus `Save.load()` als explizites Versionsfeld übernehmen. |
| `Net` + `MqttWire` (494 Z.) | **Entfällt ersatzlos** | UE-Replikation mit Listen-Server ersetzt WebRTC + MQTT-Signaling eins zu eins. Das Host/Client-Modell existiert im Spiel bereits und passt exakt. Größter Gratis-Gewinn des Umbaus. |
| `BalanceSim` (356 Z.) | Commandlet im Editor-Modul | Läuft headless, gleiche 10.000-Läufe-Methodik. |
| `SelfTest` (1070 Z.) | Automation Tests | Die Disziplin überträgt sich, die Assertions nicht. |
| `data.js` (207 Datensätze) | `UPrimaryDataAsset` je Typ | Siehe unten. |

### Daten: DataAsset statt DataTable

Für die 207 Datensätze empfehle ich `UPrimaryDataAsset` statt `UDataTable`:

```cpp
// WbnWeaponData.h
#pragma once
#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "WbnWeaponData.generated.h"      // MUSS der letzte Include sein

UCLASS(BlueprintType)
class WBNSURVIVORS_API UWbnWeaponData : public UPrimaryDataAsset
{
    GENERATED_BODY()                       // erste Zeile im Klassenrumpf
public:
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identitaet")
    FName WeaponId;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Balance")
    float BaseDamage = 10.f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Balance")
    float CooldownSeconds = 0.5f;

    // TSoftObjectPtr: Effekt wird erst geladen, wenn die Waffe gebraucht wird.
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Darstellung")
    TSoftObjectPtr<UNiagaraSystem> MuzzleEffect;
};
```

Vorteile gegenüber DataTable: pro Waffe eine Datei, also diff- und mergebar —
bei 42 Waffen und mehreren Beteiligten relevant. Dazu asynchrones Laden über den
Asset Manager und direkte Referenzen auf Meshes, Niagara und MetaSounds im
Datensatz statt Auflösung über Namensstrings.

**Migration:** ein einmaliges Commandlet, das `data.js` liest und die Assets
erzeugt. Nicht von Hand abtippen — 207 Datensätze von Hand sind 207
Gelegenheiten für einen Zahlendreher, und die Balance-Zahlen sind das Wertvollste
am gesamten Bestand.

### Performance: die Entscheidung, die man nicht verschieben darf

Der Code deckelt gleichzeitige Nicht-Boss-Gegner hart bei **50**
(`_maxSimultaneous`, durchgesetzt in `index.html:15650`); Bosse kommen obendrauf,
ebenso Projektile und Partikel. Das ist die Zahl, an der naive
Unreal-Umsetzungen scheitern.

**Windows-only entschärft die Lage** (Entscheidung vom 2026-09-16): 50 Gegner
sind auf PC-Hardware mit gepoolten Actors erreichbar. Auf Mobile wäre Mass
Entity kaum vermeidbar gewesen; hier ist es das nicht.

**Weg A verschärft sie dafür an anderer Stelle.** Mit echten Assets liegt es
nahe, jeden Gegner als Skeletal Mesh mit Animation Blueprint zu bauen — und
genau das ist bei 50 gleichzeitigen Gegnern der teuerste denkbare Aufbau:
Skinning, Animation-Update und Bone-Transform-Kosten je Instanz.

Empfohlene Staffelung der Gegner-Darstellung:

| Kategorie | Darstellung | Begründung |
| --- | --- | --- |
| Spielerfiguren (1–2) | Skeletal Mesh + Animation Blueprint | Volle Qualität, immer im Blick, vernachlässigbare Anzahl |
| Bosse (1 gleichzeitig) | Skeletal Mesh + Animation Blueprint | Einzelstück, verdient die Kosten |
| Gegner-Masse (bis 50) | **Vertex Animation Textures** oder Niagara-Mesh-Renderer auf Instanced Static Meshes | Animation im Material statt im Skelett; hunderte Instanzen ohne Per-Instanz-Animationskosten |

Falls Skeletal Meshes für die Masse doch gewünscht sind: **Animation Budget
Allocator** und Significance Manager sind Pflicht, nicht Kür, und die
Entscheidung muss in Phase 1 gemessen werden — nicht geglaubt.

Empfohlene Reihenfolge für den Tick:

1. **Gepoolte Actors, aber kein `PrimaryActorTick` pro Gegner.** Ein
   `UWbnEnemySubsystem` tickt einmal und iteriert über flache Arrays. Das liegt
   nah am heutigen Code — der macht genau das — und trägt kein Framework-Risiko.
   50 Actors mit je eigenem Tick plus Komponenten-Ticks sind in UE deutlich
   teurer als 50 Einträge in einem Array, das einmal durchlaufen wird.
2. **Messen.** Unreal Insights, nicht Bauchgefühl. Budget vorher festlegen, zum
   Beispiel 50 Gegner plus Bosse plus Projektile bei 60 fps auf der
   Zielhardware, mit Kopfraum für den Endlos-Modus.
3. **Erst wenn das reißt: Mass Entity.** UE5s ECS ist die richtige Antwort für
   tausende Einheiten, hat aber eine erhebliche Einarbeitungskurve und macht
   Debugging schwerer. Bei 50 Gegnern auf Windows-PC voraussichtlich nicht
   nötig — aber das ist eine Messfrage, keine Glaubensfrage.

Darstellung in jedem Fall über **Instanced Static Meshes** bzw.
Niagara-Mesh-Renderer, nie ein `AActor` mit eigener Mesh-Komponente je Gegner.

### Mehrspieler-Architektur (ab Phase 0 mitgebaut)

Entscheidung vom 2026-09-16: Mehrspieler wird früh mitgedacht. Das heißt
konkret, nicht als Absichtserklärung:

- **Listen-Server**, zwei Spieler, wie im HTML-Spiel. Der Host spielt mit.
- **Serverautoritativ.** Spawns, Schaden, Tod, Beute, Wellenfortschritt und
  Wirtschaft entscheidet ausschließlich der Server. Der Client sagt, was er
  *will* (Bewegungseingabe, Kaufwunsch), nie was *passiert ist*.
- **Zustandstrennung ab Tag 1:** `AWbnGameState` hält den replizierten
  Laufzustand (Welle, Timer, aktive Mods), `AWbnPlayerState` das Pro-Spieler-
  Sichtbare (Level, Material, Waffen). Wer das erst später trennt, zieht es
  durch jedes System nach.
- **Kosmetik braucht keine Replikation.** Partikel, Trefferzahlen und
  Bildschirmeffekte laufen lokal aus replizierten Ereignissen — nicht als
  eigene replizierte Zustände. Das ist der Unterschied zwischen spielbarer und
  unspielbarer Bandbreite bei 50 Gegnern.

---

## 5. Phasenplan

Jede Phase endet mit etwas Lauffähigem. Keine Phase endet mit „Gerüst steht".

**Umgestellt gegenüber der ersten Fassung:** Mehrspieler ist keine späte Phase
mehr, sondern läuft ab Phase 1 mit (Entscheidung vom 2026-09-16). Die frühere
Phase 6 entfällt als eigener Block; ihr Inhalt verteilt sich auf alle Phasen.

### Phase 0 — Fundament

- `.uproject`, zwei Module, `Build.cs` mit `Core`, `CoreUObject`, `Engine`,
  `InputCore`, `EnhancedInput`, `Niagara`, `UMG`, `CommonUI`,
  `NetCore`/`OnlineSubsystem` je nach gewähltem Sitzungsweg.
- Windows-Target, DX12. Keine Mobile- oder Konsolen-Rücksichten (Entscheidung
  vom 2026-09-16) — Lumen und Nanite sind ohne Fallback-Pfad nutzbar.
- `UnrealDropIn/` an seinen vorgesehenen Ort im Editor-Modul legen.
- Automation-Test-Harness, der in CI läuft. **Vor** dem ersten Gameplay-Code,
  sonst entsteht er nie.
- **Netzwerk-Rohbau schon hier:** Listen-Server startet, ein zweiter Client
  verbindet sich, beide sehen einander als Pawn. Ohne Gameplay. Das ist eine
  Nachmittagsaufgabe am Anfang und ein Umbau von Wochen am Ende.

### Phase 1 — Vertikaler Schnitt, von Anfang an zu zweit

Ein Charakter, eine Waffe, ein Gegnertyp, eine Arena, eine Welle — **im
Listen-Server, mit zwei verbundenen Spielern.** GameMode, Character mit
Enhanced Input, Waffen-Komponente, Gegner-Subsystem mit Flussfeld,
Trefferauflösung, ein Niagara-Effekt. Darstellung mit Platzhaltern.

**Abnahmekriterium:** Zwei Spieler laufen, schießen automatisch, töten Gegner,
die Welle endet regulär — und der Client sieht dasselbe wie der Host.

Hier, nicht später, werden zwei Dinge festgelegt, die nachträglich Umbauten
wären: der Gegner-Tick-Ansatz und die Gegner-Darstellung aus Abschnitt 4.

### Phase 2 — Datenmigration

Commandlet `data.js` → DataAssets. Danach ein Validierungs-Automation-Test:
jedes Asset hat eine ID, IDs sind eindeutig, alle Referenzen lösen auf. Das
ersetzt die heutige Funktion von `tools/data-regression.mjs`.

### Phase 3 — Systeme in Reihenfolge des Risikos

Jedes System wird mit Authority-Prüfung geschrieben, nicht nachgerüstet:

1. Wellen- und Spawn-Logik samt Bossen (der Kern des Spiels) — serverautoritativ
2. Waffen-Tiers, Items, Shop, Level-Up — Auswahl clientseitig, Anwendung Server
3. Arena-Mods, Wetten, Aufträge
4. Progression, Freischaltungen, Achievements — pro Spieler, lokal gespeichert
5. Save

### Phase 4 — Asset-Produktion (parallel ab Phase 1)

Kein sequenzieller Block, sondern ein durchlaufender Strang: Art-Bible,
Charaktere, Gegner, Bosse, Arena-Props. Ersetzt Platzhalter stückweise. Der
Gameplay-Strang darf nie darauf warten.

Reihenfolge nach Sichtbarkeit: Spielerfiguren zuerst (sieht man immer), dann
die häufigsten Gegnertypen, dann Bosse, zuletzt Props.

### Phase 5 — Audio

MetaSounds-Graphen für die prozeduralen Cues, die 21 gebackenen Dateien
importieren. Die dokumentierte Lautstärkeleiter aus
`docs/audio-design-volume-ladder-2026-09-11.md` ist dabei die Vorgabe — sie ist
hart erarbeitet und sollte nicht neu erfunden werden.

### Phase 6 — UI

UMG über CommonUI. Das Fokus- und Navigationsmodell ist bereits durchdacht und
getestet (Sichtbarkeitsfilter, `data-navskip`, Screenreader-Kontrakt) — dieses
**Verhalten** ist die Spezifikation, nicht die heutige DOM-Umsetzung.

Dazu die Mehrspieler-Oberflächen, die das HTML-Spiel schon hat: Sitzung
erstellen und beitreten, Verbindungsstatus, Coop-Shop mit Spielerwechsel.

### Phase 7 — Balance und Ablösung

BalanceSim-Commandlet, gegen die Zahlen aus dem HTML-Spiel gegengeprüft. Die
alte Implementierung bleibt als Referenz-Orakel erhalten: laufen beide bei
gleichen Eingaben auseinander, ist eine von beiden falsch.

**Ablöse-Kriterium** (Entscheidung vom 2026-09-16: das HTML-Spiel wird
abgelöst): Der UE-Bau löst erst ab, wenn er Feature-Parität erreicht —
einschließlich Online-Coop — und die Balance-Simulation vergleichbare Kurven
liefert. Bis dahin bleibt das HTML-Spiel live und unverändert.

---

## 6. Risiken, ehrlich benannt

Neu gewichtet nach den Entscheidungen vom 2026-09-16.

| Risiko | Bewertung |
| --- | --- |
| **Asset-Produktion (gestiegen)** | Durch Weg A der mit Abstand größte Posten und der Terminfaktor des Projekts. 23 Charaktere + 28 Gegner + 8 Bosse mit Animationen übersteigen den gesamten Gameplay-Code. Gegenmittel: Art-Bible vorab, Platzhalter-Ebene in Phase 1, Produktion nach Sichtbarkeit priorisiert. |
| **50 Gegner × Skeletal Mesh (neu, kritisch)** | Weg A verführt dazu, jeden Gegner als Skeletal Mesh mit Animation Blueprint zu bauen. Bei 50 gleichzeitigen Gegnern (`_maxSimultaneous`) plus Bossen ist das der teuerste denkbare Aufbau. Entscheidung gehört in Phase 1, siehe Abschnitt 4. |
| **Mehrspieler-Aufschlag (neu, bewusst eingekauft)** | Serverautoritatives Design kostet pro System spürbar Mehraufwand gegenüber einer reinen Einzelspielerlogik. Das ist der Preis dafür, Phase 6 der alten Fassung nicht als Umbau zu bezahlen. |
| **Feature-Parität als Pflicht (neu)** | Weil das HTML-Spiel abgelöst wird, ist Parität kein Ziel mehr, sondern Abnahmebedingung: 207 Datensätze, Online-Coop, Progression, Achievements. Ein UE-Bau mit 80 % der Inhalte löst nichts ab. |
| **Scope-Falle** | 207 Datensätze klingen nach „nur Daten". Jede Waffe braucht Modell, Effekt, Sound und Trefferfeedback. 42 Waffen sind 42 kleine Projekte — unter Weg A mit Art-Anteil. |
| **Verlust der Testabdeckung** | Heute rund 134 Selbsttest-Assertions plus ein Gate in etwa 15 Sekunden. Das UE-Äquivalent ist langsamer und aufwendiger. Läuft es nicht ab Phase 0 mit, entsteht es nie. |
| **UE-5.8-Spezifika** | Die Architektur ist versionsstabil, die konkreten Signaturen sind es nicht: Mass Entity, CommonUI und die Animation-Optimierungspfade haben sich zwischen 5.x-Versionen bewegt. Gegen die 5.8-Doku prüfen, bevor darauf gebaut wird. |
| **Doppelpflege (entschärft)** | War in der ersten Fassung ein Hauptrisiko. Durch die Ablöse-Entscheidung entfällt es: das HTML-Spiel wird eingefroren gepflegt, nicht weiterentwickelt. Es bleibt bis zur Ablösung Referenz-Orakel für die Balance. |
| **Spielstände der Bestandsspieler (neu, offen)** | Das HTML-Spiel speichert Freischaltungen, Mastery und Statistiken in `localStorage`. Bei einer Ablösung gehen die ohne Migrationspfad verloren. Siehe Abschnitt 8. |

---

## 7. Was ich nicht empfehle

- **Kein Big Bang.** Das HTML-Spiel bleibt live und unverändert, bis der UE-Bau
  Feature-Parität samt Online-Coop erreicht. Abgelöst wird am Ende, nicht am
  Anfang — sonst steht man zwischen zwei unfertigen Spielen.
- **Keine WebRTC-Rettung.** `Net` + `MqttWire` sind 494 gut gebaute Zeilen — und
  in UE trotzdem wertlos. Die Engine-Replikation ist besser. Wegwerfen.
- **Kein Skeletal Mesh für die Gegner-Masse**, ohne es vorher gemessen zu haben.
  Weg A verführt dazu; 50 gleichzeitige Gegner bestrafen es. Siehe Abschnitt 4.
- **Kein Warten auf Assets.** Der vertikale Schnitt läuft mit Platzhaltern. Wer
  Phase 1 an fertige Modelle koppelt, blockiert die Gameplay-Arbeit hinter dem
  langsamsten Strang des Projekts.
- **Keine Mehrspieler-Nachrüstung.** Die Entscheidung ist gefallen, also wird ab
  Phase 0 serverautoritativ gebaut — nicht „erstmal Einzelspieler, Netzwerk
  später". Genau das wäre der Umbau, den die Entscheidung vermeiden soll.
- **Kein Mass Entity ab Tag 1.** Erst messen. Auf Windows-PC mit 50 Gegnern
  voraussichtlich unnötig.

---

## 8. Entscheidungen

### Getroffen am 2026-09-16

| Frage | Entscheidung | Wirkung im Plan |
| --- | --- | --- |
| **Darstellungsweg** | **A — 3D top-down mit echten Assets** | Abschnitt 3 neu; Asset-Produktion wird paralleler Strang (Phase 4); Platzhalter-Ebene für Phase 1; Gegner-Darstellung wird zur kritischen Technikfrage (Abschnitt 4). |
| **Zielplattform** | **Windows, nur PC** | DX12, Lumen und Nanite ohne Fallback-Pfad; Performance-Budget auf PC-Hardware; Mass Entity dadurch weniger dringlich (Abschnitt 4). |
| **Zukunft des HTML-Spiels** | **Wird abgelöst** | Doppelpflege-Risiko entfällt; Feature-Parität inklusive Online-Coop wird Abnahmebedingung (Phase 7); neue offene Frage zur Spielstand-Migration. |
| **Mehrspieler** | **Früh mitdenken** | Phasenplan umgestellt: Netzwerk-Rohbau in Phase 0, vertikaler Schnitt in Phase 1 bereits zu zweit, Authority-Prüfungen in jedem System aus Phase 3 statt Nachrüstung. |

### Noch offen

1. **Spielstände der Bestandsspieler.** Das HTML-Spiel hält Freischaltungen,
   Mastery, Perks, Quests und Statistiken in `localStorage` (`Save`, 87 Z.).
   Bei Ablösung sind sie ohne Zutun weg. Drei Möglichkeiten:
   - **Export/Import-Code.** Das Spiel kann bereits Zustand als
     deflate+base64-Code aus- und eingeben (`Net.b64`/`unb64` für die
     Offline-Verbindung). Derselbe Mechanismus ließe sich für einen
     Spielstand-Code nutzen: im HTML-Spiel exportieren, im UE-Bau importieren.
     Technisch der sauberste Weg, Aufwand überschaubar.
   - **Bewusst verwerfen.** Alle fangen neu an. Legitim, wenn die Spielerbasis
     klein ist — aber es ist eine Produktentscheidung, keine technische.
   - **Startbonus statt Migration.** Kein echter Import, aber ein Ausgleich für
     Bestandsspieler. Umgeht das Problem, statt es zu lösen.

   *Empfehlung:* Export/Import-Code, falls überhaupt nennenswert Spielstände
   existieren. Die Frage blockiert nichts vor Phase 3.

2. **Sitzungsvermittlung für den Coop.** Das HTML-Spiel nutzt MQTT-Signaling
   plus manuellen Code-Austausch. In UE stehen Steam-Sessions, ein eigener
   Master-Server oder schlichtes Direct-IP zur Wahl. Steam ist für Windows-only
   naheliegend, bindet aber an eine Plattform. Die Frage muss **vor Phase 0**
   fallen, weil sie die Modulabhängigkeiten in der `Build.cs` bestimmt.

   *Empfehlung:* Für Phase 0 und 1 Direct-IP im LAN — das genügt zum Entwickeln
   und bindet nichts. Die Plattform-Entscheidung dann bis Phase 6 nachholen.

---

## 9. Messprotokoll

Alle Zahlen in Abschnitt 1 stammen aus diesen Befehlen, ausgeführt am
2026-09-16 im Arbeitsbaum:

```sh
wc -l index.html data.js sw.js                     # 18384 / 868 / 75
stat -c "%s bytes" index.html                      # 5357018
grep -o "ctx\." index.html | wc -l                 # 3208 Vorkommen
grep -oE "ctx\.[a-zA-Z]+" index.html | sort | uniq -c | sort -rn
grep -o "data:image/png;base64" index.html | wc -l # 66
grep -n "_maxSimultaneous" index.html              # :13232 :14037 :15650
```

Die 1.865 reinen Zeichen-Methodenaufrufe stammen aus einem `grep -oE` über die
Methodennamen `fillRect|strokeRect|clearRect|arc|ellipse|rect|drawImage|
fillText|strokeText|beginPath|closePath|moveTo|lineTo|quadraticCurveTo|
bezierCurveTo|fill|stroke|clip`. Die 207 Datensätze wurden über einen
`node -e`-Aufruf gezählt, der `data.js` per require lädt und die Längen der
neun Register summiert.

**Korrektur gegenüber einer früheren Chat-Fassung dieses Plans:** dort stand
„1.656 Zeichenaufrufe". Diese Zahl war falsch — sie stammte aus `grep -c`, das
*Zeilen mit Treffern* zählt, nicht die Treffer selbst. Korrekt sind 3.208
`ctx.`-Vorkommen beziehungsweise 1.865 reine Zeichen-Methodenaufrufe. Die
Aussage von Abschnitt 2 wird dadurch nicht schwächer, sondern stärker. Ebenso
ersetzt die Code-Konstante `_maxSimultaneous = 50` die frühere, aus einem
Screenshot abgelesene Gegnerzahl.
