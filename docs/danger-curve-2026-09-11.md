# Danger-Adaptive Layer — Multi-Input Intensity Curve (2026-09-11)

GRADES spec=4 design=4 correctness=4 quality=4; biggest gap: verified numerically and through the real AudioSys lerp, but not by ear on calibrated monitoring — the drone/filter audibility at the new low-intensity values is inferred, not listened to.

## What changed (index.html)

The danger layer (`AudioSys.setDanger` → sub-drone + darkened music filter + heartbeat pulse) was previously fed by **one input only**: lowest player HP (`(0.45 − lowHp)/0.40`). Full-HP players standing in front of a dense crowd heard nothing from the layer.

Now `Game._dangerChan()` computes the intensity as the **max of three channels** (extracted to its own method so probes/selftest can drive it with synthetic states):

1. **HP channel** — the existing curve, unchanged: `clamp((0.45 − lowHp)/0.40)`, 1.0 pin at ≤ 5 % HP (preserved exactly: HP 40 → 0.125, HP 20 → 0.625, HP 8 → 0.925).
2. **Crowd channel** — enemies near players (< ~340 px, squared distance 115 600) count **1**, distant ones **0.35** (splitters at the arena edge shouldn't feel like pressure); weight / 55, then **squared** for a soft onset. Full weight needs ~55 close enemies.
3. **Wave-depth floor** — `clamp((wave − 4)/14) × 0.35`: depth alone ramps toward a 0.35 cap by wave ~18, never full intensity on its own.

`Game.update` feeds `AudioSys.setDanger(_dangerChan())` when `state === 'play'` (unchanged 0 otherwise). The AudioSys side (lerp `_dangerNow`, drone voice, filter darkening, pulse) is untouched — its smoothing already covers the new channel mix.

**Stale-drone fix:** `endRun()` now calls `AudioSys.setDanger(0)` first thing, so the danger drone immediately decays on the end screen instead of ringing from the last combat second.

## New probe: `tools/pw_danger.py` (23 checks, exits non-zero)

- **A. Curve math** (14 checks): `_dangerChan()` against 14 synthetic states — all exact (crowd (20/55)² = 0.132, far-chaff (14/55)² = 0.065 soft pre-warn, depth 0.1 @ wave 8 / 0.35 cap @ wave 20, HP curve values preserved, 1.0 pins, saturation).
- **B. Integration:** `Game.update` with a spawned swarm at full HP drives `_dangerWant` > 0.3 (the old curve gives exactly 0 there). Calm state stays 0.
- **C. Lerp:** `_dangerNow` rises toward a directly-set want and decays after `setDanger(0)` (sim paused first — while playing, update re-feeds want every frame, which the probe documents).
- **D. Exit:** `endRun(false)` drops `_dangerWant` to 0 immediately; state=end.
- Stability: 3 consecutive green runs; zero console/page errors in each.

## Probe-found process notes (probe bugs, not engine bugs)

- The live battlefield kills spawned enemies through auto-fire weapons in the same tick — integration checks must assert the *channel behavior*, not a specific headcount.
- The 40 "far chaff" enemies the probe spawns for isolation themselves contribute (0.065) — the designed soft pre-warn for distant approaching swarms, worth an explicit check of its own.
- The lerp-decay check must pause the sim or `Game.update` overwrites the probe's `setDanger(0)` every frame.

## Gates

- `tools/pw_danger.py` 23/23 (×3)
- `tools/pw_walk.py` 23/23 · `tools/pw_vol_probe.py` 21/21 · `tools/pw_abuse.py` 29/29 · `tools/pw_perf.py` 15/15
- `node tools/verify.mjs` → VERIFY OK · `node tools/data-regression.mjs` → 22/22 PASS
- sw.js CACHE re-stamped (`wbns-ef24d37c` = sha1 of final index.html), stamp kept in literal form.
