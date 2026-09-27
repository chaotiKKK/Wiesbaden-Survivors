# Balance-Referenz

`balance-reference.json` hält fest, was die BalanceSim des HTML-Spiels
berechnet. Der UE-5.8-Neubau ([`docs/ue58-portierungsplan-2026-09-16.md`](../docs/ue58-portierungsplan-2026-09-16.md))
wird gegen diese Zahlen geprüft und nicht gegen die Erinnerung, wie sich das
Spiel angefühlt hat.

Die Datei kommt aus dem echten, ausgelieferten Code. Das Werkzeug öffnet das
Spiel in headless Edge und liest `BalanceSim` direkt aus, es gibt keine
Nachbildung in Node.

```
node tools/export-balance-reference.mjs            # Referenz neu schreiben
node tools/export-balance-reference.mjs --check    # neu rechnen und vergleichen, Exit 1 bei Abweichung
```

Beides dauert ein paar Sekunden. Die Simulation ist deterministisch: Jede Waffe
und jede Figur hat ihren eigenen Zufallsstrom mit festem Seed, und es gibt
weder `Math.random` noch Spielstand- oder Optionszustand. Der gleiche Spielstand
ergibt also byte-gleich dieselbe Datei.

## Wann neu schreiben

Nur **absichtlich**, bei einer gewollten Balance-Änderung am HTML-Spiel.
Schlägt `--check` fehl, obwohl niemand an der Balance gedreht hat, dann ist
das ein Befund und kein Anlass, die Datei zu überschreiben.

`provenance` hält fest, woraus die Datei entstanden ist: Commit, Blob-Hashes
von `index.html` und `data.js`, ob die Quellen sauber waren und welcher
Browser gerechnet hat. Stand 2026-09-28 liefern `main` (ae08ce8) und das
Ende des PR-Stapels #1 → #2 → #3 → #5 **dieselben Zahlen**. Die Änderungen dort
betreffen Audio, CI und Koop, nicht die Balance.

## Aufbau

| Block | Inhalt | Toleranz |
|---|---|---|
| `config` | Stichprobengrößen (3333 pro Waffe und Tier, 434 Läufe pro Figur, 60 pro Figur-Waffen-Paar), der Referenz-Build (Level 14 mit seinen Stats), die Gefahrenstufe 2 für die Figurenläufe und die RNG-Definition (mulberry32 plus Seed-Formel) | muss gleich sein, sonst ist der Vergleich nicht sinnvoll |
| `exact` | Alles ohne Zufall: pro Waffe und Tier jeder Term der DPS-Formel (Grundschaden, Krit-Chance, Krit-Multiplikator, Cooldown, Treffer pro Angriff, Reaktionsfaktor, Brand-DPS) und daraus `expectedDps`; Mittelwerte daraus über Waffen und Bauarten; DPS der Aufsätze und ihre Abweichung von der erwarteten SMG-Basis; Bedrohungswert der Gegner; Kampfdauer der Bosse | relativ 1e-9 |
| `monteCarlo` | Alles Gesampelte, so wie das Spiel es selbst anzeigt: gemessene DPS pro Waffe und Tier mit Standardfehler, Mittelwerte aus gemessenen DPS, Aufsatz-Abweichung gegen die gesampelte Basis, Siegquoten der Figuren mit Standardfehler, beste und schlechteste Waffe pro Figur | siehe unten |
| `summary` | Die Urteile des Spiels: Waffen- und Aufsatz-Ausreißer, Bosse außerhalb von 25–90 s, Figuren im Siegband 20–80 % | nur zur Information, weil sie aus gesampelten Werten stammen |

## Wie der Neubau vergleicht

1. **`exact` zuerst.** Mit demselben Referenz-Build und denselben Tabellen
   muss jede Zahl auf 1e-9 relativ stimmen. Weicht etwas ab, steht in
   `weaponTiers[].tiers[]` Term für Term, *welcher* Teil der Formel abweicht.
2. **`monteCarlo`, bit-exakt.** Wenn der Neubau mulberry32, die Seed-Formel
   und die Reihenfolge der Ziehungen nachbaut (beschrieben in `config.rng`),
   müssen auch diese Werte bis auf Rundung stimmen. Das ist die stärkste
   Prüfung und für den Kern der Simulation empfohlen.
3. **`monteCarlo`, statistisch.** Wenn der Neubau anders zieht, gilt pro Waffe
   und Tier `|gemessen − referenz| ≤ 5 · measuredStderr · √2`, wobei √2 dafür
   steht, dass beide Seiten sampeln. Für die Siegquoten gilt dasselbe mit
   `winRateStderrPct`. Die Paare (`pairs`) sind nur Information: Bei 60
   Stichproben können nahe beieinander liegende Waffen die Plätze tauschen.

## Was die Referenz einfriert

Die Referenz friert den **Ist-Zustand** ein, keinen Soll-Zustand. Laut ihren
eigenen Urteilen sind derzeit 6 Waffen und 6 Aufsätze Ausreißer, und nur
10 von 23 Figuren liegen im Siegband 20–80 %. Die Spanne reicht von 0,9 %
(`nova`) bis 100 % (`sylvia`). Kein Boss liegt außerhalb seines Zeitfensters.

Wer im Neubau die Balance ändern will, tut das bewusst **nach** dem Nachweis,
dass der Neubau die Referenz reproduziert. Sonst lässt sich ein Portierungsfehler
nicht mehr von einer Designentscheidung unterscheiden.

## Selbstprüfung beim Export

`expectedDps` bildet `BalanceSim.weaponDPS` ohne Zufall nach. Damit diese
Nachbildung nicht unbemerkt vom Spiel abdriftet, vergleicht der Export jede
gemessene DPS mit ihr. Liegt `|z|` bei 5 oder darüber, bricht der Export ab.
Zuletzt lag das größte `|z|` bei 2,82 über 168 Waffen-Tier-Werte.