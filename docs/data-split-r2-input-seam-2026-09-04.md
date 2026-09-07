# Table-Split Round 2 (BOSSES/ITEMS/DANGERS/MODS) + Input-Seam Sketch — 2026-09-04

Two things recorded here: the second extraction slice of the data split (the
four remaining inline tables into `data.js`), and the first engine-seam sketch
(the input port) with an executable headless proof. The engine itself is
untouched by both — no behavior change, gate green.

## 1. Split round 2: the last four pure tables left the engine

`data.js` grew from the round-1 set (STAT_DEF/Data/CHARS/WEAPONS/ENEMIES/
ARENAS/ACHIEVEMENTS + helpers) to also carry **BOSSES, ITEMS (+ `ITEM_BY_ID`),
DANGERS, MODS** — 117 lines spliced out of the engine verbatim by
`tools/_splice-bossitems.mjs` (anchored asserts, TEMP backups, CRLF preserved).
`data.js` ends with the same guarded `module.exports`, now listing 19 names;
Node named imports (`import { BOSSES, ITEMS, ... } from './data.js'`) all
resolve. This is the completion of the ESM-evaluation recommendation's
"classic direction": with the tables gone, the engine's remaining load-time
coupling is only the top-level `Data.register*` calls, whose *tables* now all
live in data.js.

**Audit before splicing:** no engine top-level code outside the removed bands
references the moved names (only a comment, a base64 false-positive, and
runtime-only arrows like `ITEM_BY_ID[...]` remained) — same pattern as
round-1's `WEAPON_BY_ID`.

**Verified:**
- Full gate `node tools/verify.mjs`: 52 PASS, 0 FAIL, selftest banner green
  (116/116 plain, 113/113 `?qa=1`), new data.js declaration markers PASS.
- `node tools/_file-boot.mjs`: selftest 116/116 over **file://** with the
  extended data.js — the PWA/file:// surface holds.
- One gate flake on the first run (chunked leg "never completed in 30 s")
  matched the documented drift signature; immediate re-run green.

## 2. Input-seam sketch — the first real engine seam behind a module interface

**Observation that motivates the seam:** `Player.update` (index.html:4929-4968),
`Projectile`/pet paths and the Net client tick consume only a *tiny* read
surface of the giant browser-bound `Input` singleton (index.html:3646):
`moveVec(pi)`, `aimVec(pi)`, `skillDown(pi)` — plus `endFrame()` frame
bookkeeping and `rumble*()` as an output. Everything else in `Input` is device
plumbing (DOM listeners, gamepad poll, touch sticks, key rebinding). Game
logic reads a 3-method port; it is currently coupled to the whole singleton,
so it is only testable by faking the singleton inside a browser.

**The seam (in codebase-design vocabulary):** a **port** — the three read
methods + `endFrame()` — with **two adapters**:
1. the real engine `Input` singleton (browser: keyboard/gamepad/touch), and
2. `ScriptedInput` (deterministic, headless; `tools/input-seam.mjs`).

One adapter is a hypothetical seam; two make it real. With the scripted twin,
Player-motion logic becomes Node-testable: the movement law extracted from
`Player.update` (the lerp slip-integrator at index.html:4951-4953, `lerp` at
:1107) is mirrored byte-for-byte as a pure `stepMotion(body, mv, speed, slip,
dt)` — slip made an explicit parameter (regen .045 vs base .0001) instead of
a `Game.modIs('regen')` read — and exercised headlessly.

**Executable proof** (`node tools/input-seam.mjs` → 11/11 PASS, exit 0):
- both adapters satisfy the port contract (missing-method check),
- diagonal (1,1) normalizes to |v|=1 exactly as the engine's `moveVec` does;
  sub-unit vectors pass through unchanged,
- same driver ⇒ byte-identical trajectory across runs (determinism),
- physics sanity against the real law: vx converges to the target speed,
  never overshoots, decays monotonically after release, and the total
  displacement matches the engine law's own exponential dynamics (~363 px for
  the 1 s hold + regen-decay scenario — my first bound was a misestimate of
  the law, not a law defect),
- a remote-twin driver (mirroring `Net.remote.mx/my` consumption in `moveVec`)
  drives a player body headlessly — the leverage case: bots, replays, and
  online-remote twins all become the same port,
- `aimVec`/`skillDown` are readable per player index.

**Not done (deliberately):** no engine edit. The engine still reads the bare
`Input` global; wiring the port in would mean either (a) Player/Projectile
receiving an injected input object, or (b) extracting `stepMotion` into a
shared classic script (file:// constraint: a real ES module cannot be fetched
over file:// — see `esm-conversion-evaluation-2026-09-04.md`). That is the
next slice and is an engine change with selftest-surface implications, so it
is proposed here rather than executed in this pass.

**Seam depth note:** the port is deliberately *smaller* than the full Input
object. Keyboard/gamepad/touch acquisition, rebinding UI, rumble output and
`Game.coop`/`Net.isHost()` remote mixing all stay in the browser adapter —
they are the shallow, device-facing half that should never leak into logic.
The deepening payoff: motion, aiming and skill gating become pure functions of
(port, dt) testable in Node in <1 s, and the QA/bot surfaces get a typed input
source instead of CDP key events.

## Files
- `data.js` — +BOSSES/ITEMS/ITEM_BY_ID/DANGERS/MODS (19 exports, guarded)
- `tools/_splice-bossitems.mjs` — kept splice script
- `tools/input-seam.mjs` — kept executable seam proof
- `index.html`, `sw.js` — unchanged this pass (sw precache already listed
  `./data.js`, name-stable)
