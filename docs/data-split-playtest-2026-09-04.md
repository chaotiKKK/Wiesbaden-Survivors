# Daten-Registry-Split (data.js) — 2026-09-04

## What moved

Pulled the pure-data registries out of the giant inline engine script in
`index.html` into a load-ordered `data.js` (742 lines), loaded via
`<script src="data.js"></script>` **immediately before** the engine `<script>`:

| Band | Lines moved | Notes |
|------|------------|-------|
| STAT_DEF / STAT_KEYS / STAT_NAME / STAT_UNIT | 13 | stat-definition tables |
| `Data` registry object + `statDefinitions` register | 67 | Data infra |
| `CHARS` + `CharacterProfiles` + `CHAR_BY_ID` | 203 | 23 chars |
| `WEAPONS` (+ `W` builder) + `WEAPON_BY_ID` | 342 | 42 weapons |
| `ENEMIES` (+ `E` builder) + `ENEMY_BY_ID` | 46 | 28 enemies |
| `ARENAS` + register | 12 | 8 arenas |
| `ACHIEVEMENTS` + register | 40 | 36 achievements |

Each band was replaced in `index.html` by a `/* … extrahiert nach data.js */`
marker comment. `BOSSES`, `ITEMS`, `DANGERS`, `MODS`, and the engine itself stay
inline this pass. Backup of the pre-split `index.html`:
`%TEMP%\index.html.pre-data-extract.bak`. Migration script kept as
`tools/_extract-data.mjs` (anchor-based; aborts before writing on ambiguous
anchors — line numbers drift, content anchors don't).

## Why it works as a split

Both files are **classic scripts**, so top-level `const`s in `data.js` land in
the shared global lexical environment and the engine script (which opens with
`"use strict";` at line ~1088) resolves `CHARS`/`WEAPONS`/`Data`/… at runtime —
same visibility as when they were declared earlier in the same script. The
relative `<script src>` also resolves from `file://` (PWA/offline path) with no
server. `data.js` ends with a guarded `module.exports`, so Node `require`
(BalanceSim analysis, future regressions) sees the same tables.

## Verified (all green)

- `node tools/_extract-data.mjs` self-checks: 0 table decls left inline, each
  decl exactly once in data.js, no `W({` row uses left inline.
- `node --check data.js` + Node require: 23/42/28/8/36 entries, all byId maps
  and STAT tables populated.
- `node tools/verify.mjs` full gate: static legs (incl. new data.js leg +
  FORBIDDEN entries so a clobbered inline `const CHARS = [` fails the gate),
  `?selftest` **103/103** in real headless Edge over HTTP, BalanceSim
  10.000-run green (39 weapons). Exit 0.
- `node tools/_file-boot.mjs`: file:// selftest boot — data tables visible to
  the engine (`typeof CHARS === 'object'`, 23 chars), **103/103 PASS** on disk
  with no server. Probe kept for future file:// regression checks.

## PWA note (sw.js)

`index.html` slimmed ~37 KB, and the shell gained `data.js` — so the sw.js
CACHE stamp was re-stamped manually (`wbns-527216329053` → `wbns-bbe09e61b740`,
sha1[0:12] of the new index.html) and `./data.js` added to `SHELL`. The comment
in sw.js references a `tools/build.js` stamper that **does not exist in this
workspace** — re-stamping is manual until/unless that build returns.

## Limits

- Split is load-order-fragile by design: `data.js` must stay ahead of the
  engine `<script>` (the gate's `data.js loads before engine script` marker
  guards this).
- `module.exports` guard means `data.js` is not a pure ES module; importing it
  from ESM requires the CJS interop path.
