# Volume-Ladder Selftest Pin (2026-09-11)

GRADES spec=4 design=4 correctness=4 quality=4; biggest gap: the pin guards the ladder's *math and stepping path* — the perceived equal-loudness feel itself remains an audio-design judgment, verified numerically (constant 4 dB per click) but not by ear.

## Trigger

User request: "Pin the volume-ladder contract into the page's ?selftest suite so a regression to linear stepping fails the packaged verify gate."

## What was added

New `SelfTest._volLadder` group (`index.html`, registered between SeedCopy and Net — sync group, no async machinery needed). 11 assertions pinning the −4-dB ladder contract end to end:

1. **Rung table:** `VOL_RUNGS` is 12 entries — index 0 is silence (0), every other entry is `10^(dB/20)` for exactly −40…−4/0 dB.
2. **Monotonic:** strictly ascending; AUS sits *under* the lowest rung.
3. **Constant interval:** every click spans exactly 4 dB (±1e-9) — the property linear stepping lacks (100→90 % is −0.9 dB, 20→10 % is −6 dB).
4. **Mute mapping:** `volRungIdx` returns 0 for 0 / negative / NaN; full volume is the top rung.
5. **Snapping:** arbitrary values snap to the *nearest* rung (±0.1 dB probes land on rungs 9/8); `volSnap` returns the rung amplitude (the save-migration path).
6. **Labels:** `volLabel(0)` = "AUS (stumm)"; `volLabel(1)` = "0 dB", `volLabel(−4 dB rung)` = "-4,0 dB" (German comma).
7. **Real stepping path:** drives `UI.cycleOpt` (the actual click handler), not the rung math in isolation — from 0, one click up = −40 dB rung (no dead zone), 11 clicks = full volume (top clamp), one down = exactly −4 dB, second down = exactly −8 dB. State saved/restored in `finally` (`OPT().master` + `Save.save()` + `renderOptions()`).
8. **On-rung saves:** all four `VOL_KEYS` values in the live save are exact rung values (or 0) and `_volMig` ran — pins the snap-migration invariant.

Gate stays count-agnostic (≥ 100): the group adds 11, banner count grew 141 → 152.

## Negative proof (the regression actually trips it)

Simulated the exact regression the pin exists for: replaced the `cycleOpt` volume branch with linear stepping (`opt += 0.1`):

- `node tools/verify.mjs` → **VERIFY FAILED (2 checks)**: banner never reaches PASS, `?qa` positive branch unprovable (`total: 152`).
- Panel probe (throwaway Playwright script, deleted after) confirms the failure is *specific*: exactly 3 FAIL rows, all in the new group — "erste Stufe ab AUS = −40 dB", "ein Klick runter von 100 % = exakt −4 dB", "zweiter Klick runter = −8 dB". Structural rung-table checks correctly still pass (they test the table, which the regression didn't touch).
- Restored from a byte-hash bookkept backup (`git hash-object` before/after: `f0bb71f5…` both), gate green again.

## Gates

`node tools/verify.mjs` VERIFY OK (152 assertions incl. new group) · data-regression 22/22 · walk 23/23 · vol_probe 21/21 · abuse 29/29 · perf 15/15 · danger 23/23 · beatsync 21/21. sw.js re-stamped `wbns-b6c19c1c` (index.html sha1 b6c19c1c…); `git ls-files -v index.html` = `H`.

## Notes

- The stepping assertions deliberately drive `UI.cycleOpt` — pinning only `volRungIdx` math would let a regression swap the handler branch to linear while the math still passes.
- The rung-table itself is asserted structurally (not by re-deriving literals) so a *re-tuning* of the ladder (e.g. −5 dB steps) fails loudly here and forces a conscious contract update, not a silent drift.
