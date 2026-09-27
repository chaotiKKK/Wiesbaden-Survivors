# Game-Developer Pass — Performance Validation (2026-09-11)

GRADES spec=4 design=4 correctness=4 quality=4; biggest gap: profiling ran in software-rendered headless Chromium (no GPU compositing) — absolute frame times on real hardware with a GPU will be better, and real-machine validation is still unmeasured.

## Trigger

`game-developer` skill activation. Its MUST-DO/MUST-NOT list is Unity/Unreal-C#-shaped, so each rule was mapped to this engine's WebAudio/Canvas 2D equivalent and **verified by reading the engine**, then validated behaviorally where it mattered — the skill's profiling checkpoint — with a new real-rAF stress probe.

## Checklist audit (all verified in engine, no changes needed)

| Skill rule | Engine evidence |
|---|---|
| Object pooling for frequent instantiation | `Pool` class with swap-pop + free-list (`FX.*` particles/rings/shards/etc., line ~4876); enemies pooled via `enemyPool.pop() \|\| new Enemy()` (line 14133); pool cleared on run start |
| Proper state machine | `Game.state` (`title/play/paused/end`) with `timeScale`/hitstop; guest mode skips sim+render entirely |
| Delta time, no death spiral | rAF loop clamps `dt = min(.05, …)` — slowdown-not-spiral; FPS smoothing via lerp |
| No per-frame allocations / caching | SpatialHash with preallocated `_tmp/_tmp2/_tmp3` scratch arrays (line 12992) |
| LOD / adaptive quality | Built-in `autoQuality`: sustained < 38 fps → effects at 0.55, > 52 fps → back to 1.0 |
| Frustum culling analogue | Off-camera enemy draw skip (viewport guard at line 15824, bosses exempt) |
| Profile regularly | Built-in `Prof` overlay (F3/Backquote, opt-persisted), samples frame interval + frame cost |
| Data not hardcoded | `data.js` registries (STAT_DEF/CHARS/WEAPONS/ENEMIES/ARENAS…) already split from the engine |

## New probe: `tools/pw_perf.py` (15 checks, real-rAF, exits non-zero on failure)

1. **Baseline** (title, 2 s): rAF fires in headless; p50 16.7 / max 16.8 ms — clean 60 Hz control.
2. **Stress load** (real run, QA god mode, `qaGo(25)` endless, 10 s): enemy swarm peak 50–58, weapons auto-firing, sim provably live (kills advance), state stays `play`.
3. **Contract under burst**: either ≥ 30 fps held **or** autoQuality engaged (its 2 s reaction window legitimately lets the pre-mitigation spike tail exceed the floor) — no stall (max ≤ 250 ms), p99 ≤ 100 ms.
4. **Settled window** (6 s after reaction): median frame ≤ 33.4 ms (30 fps software floor), sim live.
5. **Headroom escalation** (waves 40, 60): sim live, no stall, fps floor holds — reported as info, not asserted.

Probe found **no engine defect**; its first draft instead had a dishonest assertion (fixed p95 floor that fired exactly during the autoQuality reaction window) — the engine's mitigation was working, the test was wrong. The final contract encodes the designed behavior. One tuning fix along the way: the enemy-peak threshold moved from 60 → 40 after observing wave 25's spawn cap sustains ~50–58.

## Measured results (3 consecutive green runs, zero console/page errors)

- Baseline: p50 16.7 / p95 16.7 / max 16.8 ms
- Wave 25 burst: p50 16.7 / p95 33.4 / max ≤ 66.7 ms; fps_min 29–30, autoQ 1 → 0.55 engaged
- Settled: p50 33.3 / max 50.1 ms (deliberate degradation, stable)
- Waves 40/60 (post-autoQ): p50 16.7–33.3 / max 33.4 ms, fps_min 40–52, enemy peak 50–56

## Cross-checks

`node tools/verify.mjs` → VERIFY OK. Perf suite stable ×3. `index.html` untouched this pass → no sw.js re-stamp. Keeper suites now: `pw_recon`, `pw_walk`, `pw_vol_probe`, `pw_abuse`, `pw_perf` (shared core `pw_lib.py`).

## Honest scope notes

- Headless Chromium = software rasterizer: the 33–50 ms settled frames are the *floor machine* profile, not a claim about player hardware; autoQuality exists precisely because real machines vary.
- The probe drives via QA wave-jump + god mode (white-box per AGENTS.md QA rules), not autonomous combat play — combat-skill pressure on frame time (heavy FX stacking from skilled play) remains unexercised.
- Skill items without a web equivalent (Unity draw-call batching, GPU instancing, texture atlasing) were noted as N/A; the closest analogues (viewport culling, atlas-based prop rendering — `PROP_ATLAS_SRC`) are present.
