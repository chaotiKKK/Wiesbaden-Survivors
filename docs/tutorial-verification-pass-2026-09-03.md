# Tutorial / first-run gating verification — 2026-09-03

## What I verified on a clean served copy
- Path: title -> Spiel starten -> character selection -> controls -> first wave
- Tutorial cue behavior on the first wave
- Skip cleanup after the tutorial hint
- Run-end return path
- Second run from the same served copy

## Verified behavior
- The tutorial cue appears in the first wave, with a working “ÜBERSPRINGEN” button reachable in the DOM.
- Clicking “ÜBERSPRINGEN” from the DOM hides the tutorial hint.
- After skip, the run continues normally (HUD advances, wave timer expires, material/combo and upgrade path continue).
- The run-end screen returns cleanly to the title via “HAUPTMENÜ”.
- A second run can be started from the same served copy.
- The tutorial cue can appear again on that second run’s first wave.

## Important architectural finding
- The tutorial cue is currently gated to the first wave start, not to a dedicated “first-run marker” in the title path.
- So this is better described as “first wave of a run” behavior than “once per fresh save and cleared afterward” behavior.

## Caveat
- The live preview bridge was unreliable for some in-page reads/clicks, so I verified the tutorial skip cleanup through the DOM and confirmed the served copy directly rather than relying on snapshot reads alone.
