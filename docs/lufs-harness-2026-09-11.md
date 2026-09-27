# LUFS Measurement Harness (2026-09-11)

GRADES spec=4 design=4 correctness=4 quality=4; biggest gap: the harness measures the *music bed* only — SFX contribution, ducking dynamics and true-peak (over-sample) metering are deliberately out of scope for now; the −19,8 LUFS verdict will move once the bed retune lands.

## Request

Add an LUFS measurement harness (OfflineAudioContext analyser) that reports master-mix loudness and warns when it leaves the −14…−16 LUFS target.

## What was built (`index.html`)

**1. Mix chain extracted — `AudioSys._buildBuses()`.** The full production chain (master → comp → presence EQ → brickwall limiter → soft-clip WaveShaper → destination; sfxGain; music path musicGain → musicFilter → dangerFilter → pump → musicComp → duck → crowdDuck; reverb send/wet; echo) now lives in one method used by *both* `init()` and the offline harness. The measurement therefore runs through the exact production graph by construction, not a hand-copied lookalike that can drift. Live `init()` behavior is unchanged (same nodes, same order, same parameter values).

**2. `AudioSys.lufsMeasure(buf)` — ITU-R BS.1770-4, pure function.** K-weighting as the standard's two-stage biquad chain (48 kHz coefficients, Direct Form II transposed, per channel with persistent state), momentary blocks of 400 ms at 75 % overlap (hop 100 ms), G-weights 1.0 per stereo channel, absolute gate −70 LUFS, relative gate −10 LU below the ungated mean (one iteration), sample-peak scan. The −0.691 dB calibration offset is included, so a 997 Hz stereo sine at −20 dBFS measures **−19.99995 LUFS** — the keeper pins this at ±0.15. Returns `{lufs, peakDb, blocks, total, sr}`; `null` for silence/too-short input.

**3. `AudioSys.lufsRender(seconds)` — offline render of the real mix.** Spins `this.ctx` to a fresh 48 kHz stereo `OfflineAudioContext`, calls `_buildBuses()`, then plays the music bed through the **actual sequencer scheduler** (`_chipTick` per 16th step, current song table, boss variant, current danger intensity as the intensity gate), restores everything in `finally`. Because `voice()`/`noiseVoice()` read `this.ctx` and gate on `this.started`, the swap block also sets `started=true` transiently and resets the ctx-local caches (`_bufs`, `_pwmCache`) — restored afterwards. **No `AudioContext` is created and no live node is touched** (guarded + verified), so the run is gesture-gate compatible: it works before the first user gesture, fetches no assets, produces no audible output.

**4. `AudioSys.audioConformance()` — verdict.** Renders 6 s, measures, classifies against `LUFS_TARGET = [-16, -14]`: `inWindow`/`warn` flags + German-formatted message; out-of-band additionally logs `console.warn('[LUFS] …')` (from the QA path). Level reference: options master/sfx/music temporarily pinned to 1 — the harness judges the *mix*, not the player's personal volume.

**Surfaces:**
- `?qa` pause-screen button **"LUFS messen…"** (`qaLufs`, QA-gated, nav ring member) → toast with the measured verdict.
- SelfTest async group **`LUFS`** (registered after SeedCopy, Balance-Parity pattern: `_asyncPending` defers the banner; 15 s guard): measurement plausibility (finite LUFS/Peak, peak ≤ ~0 dBFS — the limiter's job, ≥ 30 gated blocks), determinism (second conformance run Δ ≤ 0.5 LU — the bed is deterministic, only noise offsets vary), warn/inWindow/target consistency. Deliberately **warn-not-gate**: the current mix measures −19,8 LUFS, outside the band; gating that red would wedge `verify.mjs` before anyone has decided to retune — the console.warn + row text carry the finding instead.

## The measured finding

Master mix (music bed, intensity 0.6, level ref 0 dB): **−19,8 LUFS, peak −7,6 dBFS, 57/57 blocks gated, Δ 0,00 LU across runs.** That is ~3,8 LU below the −16 floor: quiet, but with 8,4 dB peak headroom — raising the bed ~4 LU would still peak at ≈ −3,6 dBFS, inside the brickwall's comfort zone. This is the harness doing its job: a concrete number for the balance pass, not a verdict enforced by the gate.

## Verification — `tools/pw_lufs.py` (keeper, 14 checks, stable ×3)

- **§1 measurement math:** engine `lufsMeasure` on synthetic buffers — 997 Hz −20 dBFS stereo sine → −20,0 ±0,15 LUFS; silence → null.
- **§2 conformance:** completes, plausible, verdict consistent (`warn ⇔ !inWindow`, target −16…−14), deterministic Δ 0,00 LU, **zero m4a fetches** during measurement, zero console/page errors.
- **§3 QA surface:** `?qa=1` → button present + nav ring member → click → toast with measured verdict (~12,5 s incl. double render on the throttled headless box); out-of-band path emits `[LUFS]` console.warn; no errors.
- **§4 hygiene:** live `AudioSys.ctx` identity, `started`, and volume options untouched after a conformance run.

**Gates:** `verify.mjs` VERIFY OK (selftest now 160 rows incl. 3 LUFS checks; gesture-gate group still green — the offline render is pre-gesture-safe) · data-regression 22/22 · walk 23/23 · vol_probe 21/21 · abuse 29/29 · perf 15/15 · danger 23/23 · beatsync 21/21 · lufs 14/14 ×3. sw.js stamp `wbns-64b79caf`. Probe-context bugs fixed along the way: `audioConformance` didn't propagate `blocks/total` (row showed undefined/undefined); the probe's `window.AudioSys` reference (lexical const, not a window property) and clicking the QA button while the pause screen was still hidden.

## Next steps worth doing

1. **Bed retune decision:** +4 LU on the music path (`_chipTick` voice volumes or `musicGain` makeup) lands the mix in-band with peak ≈ −3,6 dBFS; re-run `pw_lufs` + perf after.
2. **SFX-aware harness variant:** render kick + gun bursts through `sfxGain` under the same offline chain to get the combat-mix LUFS (crowd-duck dynamics included) — the honest number for "how loud does the game actually play".
3. **True-peak metering:** 4× oversampled peak for delivery-style reporting (the current sample peak understates inter-sample peaks post soft-clip).
