# data.js → real ES module: feasibility evaluation (2026-09-04)

Goal asked: convert data.js to a real ES module (named exports, imported in the
engine) because classic-script global sharing is load-order-fragile — while
keeping file:// and PWA behavior working.

## Verdict up front

**A real browser-ESM conversion cannot keep Chromium file:// working.** Fetched
ES modules are CORS-blocked on `file://` by design ("Cross origin requests are
only supported for protocol schemes: … http, https …" — verified on this
machine's headless Edge). Classic scripts load fine on file:// and are the only
no-server option. So the two stated halves of the goal are mutually exclusive in
the project's target browser (Edge/Chrome); anything below either (a) keeps
classic scripts, or (b) drops double-click file://.

The load-order fragility the goal names is REAL (not theoretical): with data.js's
`<script src>` moved below the engine block, boot dies with `ReferenceError: Data
is not defined` (engine top-level executes `Data.register*` at parse time).

## Empirical findings (all measured on this machine, headless Edge)

1. **file:// blocks fetched modules.** `<script type="module" src>`/`import`
   from a `file://` page fails with the CORS message above. Positive control:
   the identical page works under `--allow-file-access-from-files` (a dev-only
   flag), proving the module code is fine and the blocker is purely policy.
2. **Inline `<script type="module">` DOES run on file://** — only *fetched*
   modules are blocked.
3. **Modules can read classic-script global-lexical consts** (verified:
   `import`-ed module saw `const CLASSIC_TABLE` from an earlier classic script).
   So a module can *consume* classic-loaded data; the reverse (classic consuming
   module exports) requires the consumer to be a module too.
4. **One file cannot be both classic and ESM**: an `export` in a file loaded as
   a classic script is a SyntaxError (`Unexpected token 'export'`, verified).
   Any dual-surface scheme needs two files or a build step — drift risk / new
   tooling the repo does not have.
5. **The ordering requirement is genuine**: engine top-level contains **14**
   `Data.register*` calls (lines 3853/3870/3897/3951/4005/4056/4096/4669/4682/
   4696/4707/4715/4797/8479), five of them const-assigned `*_BY_ID` bindings
   (`ITEM_BY_ID`, `RUNE_BY_ID`, `PET_BY_ID`, `RELIC_BY_ID`, `ATT_BY_ID`) whose
   values are used by later engine code. Reversed tag order → immediate crash.
6. **Node-side ESM named imports already work today, no changes needed**: the
   classic file's guarded `module.exports = { CHARS, … }` object literal is
   statically analyzed by Node's cjs-module-lexer, so
   `import { CHARS, WEAPONS, Data } from './data.js'` (or dynamic `import()`)
   yields all 16 names with correct values (verified: CHARS.length=23).
   The "export named tables" half exists for Node/tools as-is.

## What a full browser conversion changes (inventory, Option A)

If file:// support is dropped (data only loads over http(s) — the PWA path
already is http(s)):

- **data.js**: replace the `module.exports` guard tail with top-level
  `export { … }` (or `export const` on each table); engine script tag
  `<script src="data.js">` removed; engine block becomes an inline
  `<script type="module">` with `import { CHARS, … } from './data.js';` at its
  head. Imports are hoisted and order-free by construction — the fragility
  disappears.
- **Engine module fallout**: the block is already `"use strict"` (small diff),
  but all ~140 top-level declarations become module-scoped. Probes/evals read
  `Game`, `UI`, `Input`, `Save`, `BalanceSim`, `SelfTest`, flags
  (`SIMS_ENABLED`, `QA_ENABLED`), plus `Data`/table names, as *bare globals* via
  `Runtime.evaluate` — each needs a `window.X = X` re-export (~15 names at
  minimum; every omission is a silent probe break).
- **Deferral nuance**: inline modules run after parsing but before
  DOMContentLoaded — the engine's existing boot listener still works, but the
  second boot path and any load-order assumptions need re-checking.
- **Server MIME**: module loading requires a JS MIME type
  (`text/javascript`/…); both the session's 8080 copy and verify.mjs's
  self-server must serve `.js` with a JS type (classic scripts tolerated any).
- **Gate/verify.mjs data leg**: rework the "once-declaration" checks and the
  `module.exports` dual-mode assertion; browser-side markers like
  `<script src="data.js">` change; FORBIDDEN list semantics change.
- **file-boot probe** (`tools/_file-boot.mjs`, the kept file:// + selftest
  proof): becomes invalid for module data — retire it or run Edge with the
  `--allow-file-access-from-files` dev flag (no longer a real-user surface).
- **sw.js**: `SHELL` precaches `./data.js` — filename can stay, so the PWA
  precache list is unchanged (module content-type of the cached response must
  still be JS — the sw stores the first network response's type).

## The extraction alternative (Option B, recommended if file:// must live)

Keep classic scripts on both sides; make the engine's load-time coupling vanish
so *any* tag order boots (mirrors ESM's structural win within classic
constraints):

- Move the 14 top-level registrations **and their table literals** (QUOTES,
  WEAPON_SFX, CLASS_BONUS, ITEMS+`I()` helper, BOSSES, GROUND_TEX (base64
  textures incl. its top-level consumption loop), GROUND_TEX_ARENA, DANGERS
  (mind `dangerPriceMult` interleave), MODS, BUFF_CHESTS, RUNES, PETS, RELICS,
  ATTACHMENTS) into data.js in original relative order, keeping the
  `extrahiert nach data.js` tripwire comments.
- `*_BY_ID` consts move with their registers into data.js (data.js already owns
  the same pattern: CHAR_BY_ID/WEAPON_BY_ID/…).
- Engine top-level then has zero `Data.`/table references → order-independent;
  verify with a reversed-tag regression probe; extend FORBIDDEN/markers.
- Cost: a large surgical cut of the 5 MB engine file (several hundred lines
  incl. embedded base64); blast radius real, but it is the direction the
  extraction pass already established and touches no runtime logic.

## Recommendation

Because the mission states file:// must keep working and that is physically
incompatible with browser ESM (findings 1–4), the defensible path is **Option B**
in a dedicated pass with the reversed-order regression probe, or — if file://
support is consciously dropped — **Option A**, whose full change inventory is
above. Neither is a small edit; both should be their own gated pass. Node-side
"named exports / imports" (finding 6) already works and needs no change.

No code was changed this pass beyond temp-copy experiments (all in the OS temp
dir, removed); the workspace, flag `H`, and gate state are untouched.
