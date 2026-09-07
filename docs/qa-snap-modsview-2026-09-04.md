# QA-Panel: Save-Snapshot/Restore + Wellen-Mods-Anzeige — 2026-09-04

## What was added (all strictly behind ?qa; engine logic untouched)

Three new controls in `#qaRow` (pause screen), each double-guarded
(`if (!QA_ENABLED)` in the action + hidden/.nav-stripped row on plain loads):

- **`qaModsView`** („Mods-Anzeige: AUS/AN") — toggles `Game.qaModsView`; when
  on, `qaRenderModsView()` fills a small fixed overlay `#qaModsReadout` inside
  `#hud` with the active `Game.mods` names in their colors. Readout stays
  `display:none` unless `?qa` AND the toggle is on; `qaRefreshUI()` keeps the
  button label and readout in sync (also re-rendered on mod toggles).
- **`qaSnap`** („Save sichern") — deep-copies `Save.data` into `Game._qaSaveSnap`
  (JSON round-trip, the codebase's own clone idiom — `Save.importCode` does the
  same) and toasts the snapshot's run count.
- **`qaRestore`** („Save zurücksetzen") — if a snapshot exists: restores
  `Save.data` from it, `Save.save()` (persists to localStorage), toasts, and
  re-renders the title screen. Without a snapshot it is a guarded no-op
  (`err` sfx + toast), so a stray click cannot wipe the save.

Result: probing `endRun` (which writes the real save) no longer needs the probe
to snapshot `Save.data` itself — snapshot → endRun → restore is three panel
clicks. Probe `tools/_qa-snap-probe.mjs` demonstrates exactly that flow.

## Verified

- `node tools/verify.mjs` (real headless Edge): plain `?selftest` all-green +
  `?selftest&qa=1` pass green (106/106 — the positive QA-Nav branch asserts
  every qaRow button is a ring member, count-agnostic). New markers
  (`qaModsView`, `data-act="qaSnap"`, `id="qaModsReadout"`) present. Exit 0.
- `node tools/_qa-snap-probe.mjs` (kept, 12/12 PASS): plain load — readout
  hidden, qaRow hidden, qaSnap never joins the ring (visibility filter despite
  `.nav` in markup); ?qa — restore-without-snapshot guarded no-op, qaSnap
  stores a matching snapshot, mods-readout ON shows active mod names / OFF hides,
  endRun grows runs past the snapshot, qaRestore returns the save to the
  snapshot (memory + localStorage + title screen). Zero page errors.
- `node tools/_qa-neg.mjs`: plain regression detection now 15/15 (12 old + 3 new
  buttons); `?qa` positive 24/24 ring members. `node tools/_qa-live-probe.mjs`:
  still 13/13.

## Notes

- New buttons carry `.nav` in markup like every QA button; plain-load safety is
  by construction: `syncQaRow()` strips `.nav` when scPause opens, and
  `refreshNav()`'s visibility filter excludes the hidden row regardless — the
  selftest `_gatedRowHidden` contract asserts both paths.
- After `endRun` the probe reaches the pause panel via `UI.show('scPause')`
  (display-only; no menu path leads from the end screen back to pause) and then
  real-clicks restore — documented in the probe header.
