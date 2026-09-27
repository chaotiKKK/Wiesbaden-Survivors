# Audio-Design-Pass — Lautstärke-Leiter (2026-09-11)

GRADES spec=4 design=4 correctness=4 quality=4; biggest gap: Verifikation per Playwright-Probe auf UI-/Node-Ebene — die Leiter wurde nicht in hörbaren Referenz-Lautsprechern verglichen (kein Referenz-Monitoring in dieser Umgebung).

## Ausgangslage: Skill-Audit gegen audio-design-Praxis

Die AudioSys-Engine erfüllte den Großteil der Praxis-Checkliste bereits auf hohem Niveau:

| Praxispunkt (Skill) | Befund in index.html |
|---|---|
| Bus-Routing statt Einzelclips | ✅ `master ← {sfxGain, musicGain(Musik-Kette), reverbWet, echoWet}`; `refresh()` setzt nur Bus-Gains |
| Headroom/Limiter | ✅ Brickwall-Limiter (`threshold −2 dB, ratio 20`) vor Soft-Clip; dokumentierte Messung: Anteil >1.0 von 2.9 % → 0.1 % |
| Ducking (Sidechain) | ✅ `duckMusic`: 20 ms Attack, `setTargetAtTime`-Release (kein Pumpen); je Cue getunte Dip-Tiefen; zusätzlich Crowd-Duck und Pump/Sidechain-Option |
| SFX-Variation | ✅ ±3,5 % Pitch-Wobble, Sample-Pools (`bank[name].v`), Zufallspan/-freq pro Cue, Koaleszenz + Stimmen-Budget |
| Beat-Sync | ✅ Scheduler läuft auf der Audio-Clock (`_nextTime`, 160 ms Lookahead), nicht auf Frame-Delta; BPM-Wechsel gleitend |
| Adaptive Musik | ✅ Gefahrenschicht (Sub-Drone, Lowpass-Dunkelung, Puls nach HP), `setDanger`-Mapping |
| **dB statt linear** | ❌ **Verstoß:** Volume-Optionen master/sfx/music/amb stepten linear in 0.1-Amplitude-Sprüngen |

## Der Fix: −4-dB-Leiter (11 Sprossen + Stille)

- **Gespeichert bleibt die Amplitude 0..1** — alle Gain-Konsumenten (`AudioSys.refresh()`, musicGain ×.5, Save-Format, Code-Import/Export) bleiben unverändert.
- **Geändert:** `cycleOpt` rastert Lautstärken auf eine Sprossen-Leiter (`VOL_RUNGS`, aufsteigend: 0, −40, −36 … −4, 0 dB); Links-Klick = lauter (wie alle anderen Range-Optionen), Rechts-Klick = leiser; unter der untersten Sprosse explizites `AUS (stumm)`.
- **Anzeige:** dB-Label statt Prozent (`-4,0 dB`, `AUS (stumm)`).
- **Defaults auf Sprossen:** master/sfx −4 dB (0.631), music −8 dB (0.398 = ×.5-Preset), amb −6 dB (0.501). Alte SFX:Musik-Ratio (10 dB) bleibt hörbar erhalten.
- **Einmalige Snap-Migration** (`_volMig`-Flag): alte lineare Saves rasten per dB-Distanz auf die nächste Sprosse; Werte >1 (alter Code-Import-Korner) kommen auf 0 dB zurück.

## Fehler, die der Probe-Lauf eingefangen hat (jede echte index.html-Bug)

1. **Sprossen-Array falsch herum** (absteigend): Links-Klick machte leiser — Inversion gegen alle anderen Range-Optionen. Diagnose: instrumentiertes `cycleOpt` (1 Call, `dir=+1`, Wert −8 dB nach einem Klick) + Body-Handler-Check (`data-act`-Delegation greift nicht auf `.opt`-Rows). Fix: aufsteigendes Array.
2. **Mute-Index-Lücke:** `volRungIdx(0)` lieferte den letzten Index ( links von 0 lag nichts ), ein "leiser"-Klick bei Stille sprang auf −4 dB (fast volle Lautstärke). Event-Trace (Mute → −12 dB nach 3 Klicks) festgenagelt. Fix: `v > 0`-Guard → Index 0.

Beide nur durch echte Event-Dispatches (linker Klick + `contextmenu`) sichtbar — ein reiner Unit-Test der Sprossen-Mathe wäre grün gewesen.

## Probe-Hinweise (Replication)

- `tools/pw_vol_probe.py` (18 Checks, Exit 1 bei FAIL): Sprossen-Defaults, dB-Label, ±4 dB pro Klick, Stille-Boden, Node-Gain-Tracking (Float32-Toleranz 1e-6), Persistenz über Reload.
- Options-UI: Links-Klick = +1, `contextmenu` = −1 — die Probe muss echte `MouseEvent('contextmenu')` dispatchen; `row.click()` allein geht immer nach OBEN.
- In-Process-`ThreadingHTTPServer` statt `with_server.py` (Orphan-Server-Falle, siehe docs/pw-playtest-2026-09-11.md).

## Gates

- `tools/pw_vol_probe.py` 18/18 PASS
- `node tools/verify.mjs` VERIFY OK (Selftest-Banner, BalanceSim-, Throttle-Beine grün)
- `node tools/data-regression.mjs` 22/22 PASS
- `tools/pw_walk.py` 23/23 PASS (Kritischer Loop unverändert fehlerfrei)
- sw.js-CACHE neu gestempelt aus sha1(index.html) nach jedem Griff (wbns-d3596062…)

## Offen / Nächste Schritte

- `-14…-16 LUFS`-Ziel laut Skill ist für den Master nicht gemessen (Analyser-basierte LUFS-Messung wäre möglich, war nicht Teil des Passes).
- Sequencer koppelt Gameplay-Events bisher nicht an Musik-Grenzen (Beat-Grid vorhanden, aber ungenutzt — z. B. Wellenstart auf Takt).
- Lizenzierter/human-recorded Asset-Satz bleibt der Qualitätsschritt (siehe docs/sound-design.md, lokale Pipeline deckt Rollen ab).
