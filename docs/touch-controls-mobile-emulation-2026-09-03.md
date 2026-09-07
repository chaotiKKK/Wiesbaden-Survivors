# Touch Controls — Android-PWA twin-stick verification (2026-09-03)

Surface: served copy on 127.0.0.1:8080, driven in headless Edge (scratch profile)
with raw CDP — `Emulation.setDeviceMetricsOverride` 390×844 @2x mobile +
`Emulation.setTouchEmulationEnabled` (5 touch points) — real touches via
`Input.dispatchTouchEvent`. Probe: `node tools/touch-playtest.mjs [baseUrl]`
(Node ≥ 21, global WebSocket, no deps). Result: **15/15 PASS, exit 0, 0 page errors.**

## What was exercised (real touch events, real engine, rAF running)

| Check | Evidence |
|---|---|
| Touch mode auto-enters | `Input.isTouch=true` at init (mobile emulation → maxTouchPoints 5); `#touch` overlay visible without any gesture |
| Studio splash dismisses by tap | First real tap removes `#intro` (its `pointerdown`-capture "skip" path — also the audio-unlock gesture) |
| Left stick moves avatar | Full-right drag: stick vector (1.00, 0), avatar +158 px in ~0.6 s |
| Release | Stick resets (act=false, x/y=0); avatar coasts ~11 px (intentional velocity smoothing, `lerp(vx, mv*sp, 1-slip^dt)`) then fully stops (0.7 px/0.4 s residual) |
| SKILL button | Real tap fires the ability (cd 0 → 8.85) |
| Pause button | Tap opens the pause menu (state paused, scPause visible) |
| Menu resume by touch | Tapping scPause's own "Weiter" returns to play |
| Right stick aims | Aim vector (−0.71, −0.71) registers through `Input.aimVec(0)` |
| Combat engages while aiming | dmg 57 → 87 with 3 enemies in range; player alive after probe |

## Non-defect finding (chase this before crying "broken stick")

A touch on a stick during the first ~9 s of a cold start hits `#intro` (studio
splash, `z-index:200`, full-viewport), not the stick — that gesture dismisses
the splash (by design, it is the audio-unlock gesture). By the time a real user
has tapped through title → character → start, the splash is long gone, so this
is not a playability defect. Any future touch probe must dismiss the splash
first (as this one does).

## Limits (honest)

- Emulation, not hardware: no real multitouch/pointer-coalescing, no install
  prompt, no WebView shell. Chromium touch semantics on Edge match Android
  Chrome's engine; feel/performance on a physical phone was not measurable here.
- In-run tests started via `Game.startRun()` (engine path, same as the page's
  own selftest LongRun) after the splash was dismissed by touch — menu
  navigation itself was not re-walked on this pass.
- `tools/touch-playtest.mjs` is kept as a reusable probe; `diag` arg prints the
  event-target capture log for future hit-test investigations.
