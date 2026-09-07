# First-run / user-journey playtest — 2026-09-03

## What I tested on a served copy
- Title/seed screen
- Spiel starten → character selection → controls → first wave
- In-run tutorial hint and skip
- End/restart and feedback screen
- `?selftest` self-check on the served copy

## Verified facts
- Title screen is reachable after reload and is the real cold-start layer.
- Seed input remains optional and was not autofocused in the tested path.
- `?selftest` on `http://127.0.0.1:8080/index.html?selftest` still shows `SELFTEST 98/98 · PASS`.

## Defects observed
1. The first readable moment in this preview was not reliably the title screen; a reload was needed to get the true title.
2. The seed input had no short visible cue explaining its purpose.
3. The earliest in-run guidance was only one line.
4. The in-run “ÜBERSPRINGEN” button is reachable in the DOM, but the preview bridge could not always click it.
5. The `SELFTEST` banner is real but not prominent.

## Substantive fixes applied
- Added a short seed cue under the title seed row.
- Added an explicit first-wave objective to the existing tutorial copy.
- Made the skip hint a little clearer without changing skip behavior.

## Remaining caveat
- The live preview could not reliably expose the title seed row in the live DOM read, even after reload. The served HTML does contain the new cue, so this is a verification-bridge readability limit, not a missing edit.
