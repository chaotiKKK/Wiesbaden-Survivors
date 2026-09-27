# Playwright Playtest — Critical Loop (2026-09-11)

GRADES spec=4 design=5 correctness=4 quality=4; biggest gap: correctness rests on a scripted click-path with engine-stepped frames, not on autonomous combat play; the rAF loop itself was verified only indirectly.

Toolchain: **Python Playwright 1.62 + bundled Chromium** (new in this workspace; the `agent-browser`/CDP path from `docs/edge-cdp-playtest-handoff.md` is no longer needed for scripted runs). Headless Chromium, real rAF, real service worker, fresh profile per run. Scripts: `tools/pw_recon.py` (discovery) and `tools/pw_walk.py` (acceptance walk, exit 1 on any failed check). Screenshots: `docs/pw/walk-*.png` (title, char select, controls, game, end summary, save code, codex).

## Result: 23/23 checks passed

| # | Check | Result |
|---|-------|--------|
| 1 | Cold load: `#scTitle` visible | PASS |
| 2 | Cold load: zero console/page errors | PASS |
| 3 | Gesture gate: `AudioSys.started === false` before first gesture | PASS |
| 4 | Gesture gate: no page-initiated `audio/*.m4a` fetch pre-gesture (request listener scoped to the page context) | PASS |
| 5 | Reload in same context: service worker controls page | PASS |
| 6 | Reload: still zero console/page errors | PASS |
| 7 | `play` → character select | PASS |
| 8 | `charConfirm` → first-run controls screen (`scControls`) | PASS |
| 9 | `controlsOK` → `Game.state === 'play'` | PASS |
| 10 | 300× `Game.update(1/60)` without exception, state stays `play` | PASS |
| 11 | Pause overlay opens (Esc, fallback P) → `scPause` | PASS |
| 12 | `resume` → overlay closed, state `play` | PASS |
| 13 | Re-pause works | PASS |
| 14 | `quit` ("Run abbrechen") → `endRun(false)` → `#scEnd`, `Game.state === 'end'` | PASS |
| 15 | `toTitle` ("Hauptmenü") → back at `#scTitle` | PASS |
| 16–19 | Save-code surface: `#scCode` opens, `#codePanel` visible, `#codeBox` present, closes back to title | PASS |
| 20–22 | Codex surface: `#scCodex` opens, `#codexList` is `role=list` with 42 `role=listitem` rows (sample aria-label intact), closes back to title | PASS |
| 23 | Session end: zero console/page errors overall | PASS |

Cross-check: `node tools/verify.mjs` — VERIFY OK (selftest banner, BalanceSim legs, throttle legs all green) on the same working tree.

## Findings

1. **The SW precache now includes the 21 `audio/*.m4a` cues** (`docs/offline-audio-precache-2026-09-10.md`). A naive "no audio requests before gesture" probe fails on ANY http load; the gate contract must be scoped to *page-context* fetches (`AudioSys.prefetchAssets`), not service-worker install traffic. The page-context probe above is the correct shape; an alternative is fetching `sw.js` and excluding its SHELL list.
2. **`charConfirm` intentionally detours through `scControls`** (first-run controls screen) before `startRun()`; `case 'controlsOK': this.startRun()` at index.html:13366. Any scripted walk that skips it never reaches `play`.
3. **"Run abbrechen" (`quit`) is `endRun(false)`**, not a silent return to title — the defeat/summary screen (`#scEnd`, `Game.state === 'end'`) is the designed next step, then `toTitle`. Endscreen QA caveat from AGENTS.md applies: this is a white-box-adjacent path, but here it is the genuine button flow.
4. **Env notes for future Playwright passes on this box:**
   - `with_server.py` (skill helper) leaked orphaned `python.exe` servers on this machine; two `SO_REUSEADDR`-bound servers then raced on the port (page got `ERR_EMPTY_RESPONSE`). `tools/pw_walk.py` therefore serves the workspace with an in-process `ThreadingHTTPServer` — no orphan possible.
   - If a port is ever stuck: kill only the PIDs bound to it (`netstat -ano` → `taskkill //F //PID <pid>`; Git Bash needs the double-slash form).
   - Windows console is cp1252: print with `sys.stdout.reconfigure(encoding="utf-8", errors="replace")` or German UI text/glyphs crash the dump (not the browser).
   - Stub `window.confirm` before interacting (native `confirm()` blocks automation) — same rule as the preview bridge.
   - The pause key is `Escape` (`Input` map, `pause: 'Escape'`); `P` kept as fallback in the walk.

## Not covered (honest gaps)

- No autonomous combat play (movement, aim, DPS, item pickup) — frames were advanced via bounded `Game.update(1/60)` batches per the established convention; combat feel/behavior at wave depth remains `?selftest`/BalanceSim territory.
- Online co-op (`#scNet`/`#scNetMenu`) not exercised.
- Level-up / relic / shop screens not exercised (require run progression beyond a fresh 300-tick start).
- No touch/mobile emulation pass (the 2026-09-03 pass covered that on the CDP path; should re-run here for parity).
