# Erst-Offline-Sound: SW-Vorcach der 21 Audio-Cues (2026-09-10)

Pass: die 21 `audio/*.m4a`-Cues sind jetzt im Service-Worker-Vorcach
(`sw.js` → `AUDIO`-Liste, install-phase), damit der **erste** Offline-Start
vollen Sound hat. Vorher kamen Cues nur über den Runtime-Cache nach der
Audio-Geste — frische Offline-Sitzung = stumm (Synthese-Bake deckte nur
die Slots, kein Sample-Klang).

## Design

- **Per-Cue-Toleranz statt `addAll`:** `cache.add(u).catch(() => {})` je
  Datei — eine fehlende Cue bricht den Install nicht ab; die Synthese-Bake
  deckt den Slot im Spiel (gleiche Toleranz-Philosophie wie
  `prefetchAssets`).
- **Liste manuell parallel zu `AudioSys.ASSET_ROLES`** (index.html) —
  neu in data-regression gepinnt: SW-Quelltext muss jede Manifest-Rolle
  als `audio/<role>.m4a` enthalten (Check 3j, jetzt 22/22).
- Cache-Gewicht: +104 KB (Cues 1–14 KB je Datei), Shell bleibt unverändert.

## Nachweis über die echte Oberfläche: 13/13 Checks PASS

Serve → SW installiert und kontrolliert die Seite → Cache-Audit:
28 Einträge (Shell + 21 Cues) **vor jeder Geste** → **Server gekillt
(wahrhaftig offline)** → Reload bootet komplett aus dem SW-Cache →
echte UI (Titel → Charakterwahl → Bestätigen → Steuerungs-OK) →
`window.fetch`-Spy (vor der Geste armiert — erster Lauf verpasste das
Fenster, weil `prefetchAssets` in `startRun()` feuert):

| Check | Ergebnis |
|---|---|
| SW installiert/kontrolliert, Precache hält Shell + 21 Cues | PASS |
| Offline-Reload bootet vollständig aus dem Cache | PASS |
| Offline-UI-Flow bis `Game.state === 'play'` | PASS |
| **21/21 Cue-Fetches OK bei totem Server** (= Precache-Treffer) | PASS |
| 21/21 Rollen dekodiert in der Bank (48 kHz AudioBuffers) | PASS |
| Offline-Kampf hörbar (Limiter-Peak > 0.05) | PASS |
| 22 Cues gespielt, 22/22 aus echten Bank-Buffers | PASS |
| Null Konsolen-/Exceptions | PASS |

## Messlehren (Probe-seitig)

- **Fetch-Spy vor der Geste armieren:** `prefetchAssets` läuft innerhalb
  von `startRun()`; nach dem Klick armiert, ist die Runde unsichtbar.
- **`scrollIntoView` bottomed out:** bei Maximals-Scroll blieb Bestätigen
  11 px unter dem Fold; echter Nutzer scrollt nach (scrollBy der Differenz
  + 24 px Puffer, dann Klick) — gleiche Lehre wie im Kampf-Audio-Pass.
- **Kontaktfenster abwarten:** 3 s ab Run-Start fingen nur 1 Cue
  (Spawn-Phase); 2,5 s Anlauf + 4 s Fenster fingen echten Kontakt (22 Cues).

index.html unangetastet — sw.js-Stamp (b44be35c…) bleibt zum Blob korrekt.
Gates: data-regression 22/22, verify.mjs VERIFY OK.
