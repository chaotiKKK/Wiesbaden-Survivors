# QA-Oberfläche — permanenter Regressions-Guard (SelfTest._qaNavGate) — 2026-09-04

## What was added

Mirror of the sim-row/codex gate pattern, so the hidden ?qa surface can never
silently become visible/reachable again:

- **`SelfTest._qaNavGate()`** (index.html, registered in `SelfTest.run()` behind
  the same try/catch as `_codexNavGate` → „QaNav (Fehler: …)“ on exception):
  - **Plain load (no ?qa):** opens the pause screen (the surface QA row lives
    on scPause) and asserts (1) `qaRow` is hidden (hidden class + computed
    `display:none`), (2) its 12 buttons carry no `.nav`, (3) hardening like the
    sim row — buttons forcibly re-given `.nav` while the row is hidden still
    never join the ring (visibility filter), (4) the pause nav ring itself has
    zero `qa*` entries and no invisible member.
  - **?qa active:** asserts the row is shown and all its buttons (12 static +
    mod chips) carry `.nav` and are ring members.
- `tools/verify.mjs`: change-set marker `_qaNavGate()` added next to the QA_ENABLED
  / id="qaRow" / godmode markers. No forbidden entry — consistent with the sim/codex
  gates (markers only).

Suite: 103 → **107** assertions on a plain `?selftest` (4 new QA-Nav checks).
Gate parses count-agnostic (pass == total, floor ≥ 100), so no gate-side count
update needed; handoff doc example bumped to 107/107.

## Verified

- `node tools/verify.mjs` (real headless Edge): **SELFTEST 107/107 · PASS**,
  BalanceSim sync + chunked legs green, new marker present; exit 0.
- `node tools/_qa-neg.mjs` (kept): plain load — qaRow hidden, 0 `.nav`, 0 ring
  members, clean pause ring (11 stops), hidden+.nav buttons excluded (0), full
  regression (row unhidden + `.nav`) detected (12/12 QA buttons in ring);
  `?qa=1` load — row shown, all 21 buttons (12 static + 9 mod chips) carry
  `.nav` and are ring members. Exit 0.

## Scope note

QA behavior itself untouched (surface verified working 2026-09-03 + live
re-verification probe `tools/_qa-live-probe.mjs`); this pass is guard-only.

## Addendum — positive branch now on every verify (2026-09-04)

`tools/verify.mjs` gained a second browser-leg pass: after the plain `?selftest`
and BalanceSim legs, the same headless Edge navigates to `?selftest&qa=1` and
the gate proves the positive QA-Nav branch actually ran and passed:

- banner all-green (pass == total, ≥ 100),
- exactly one `QA-Nav: unter ?qa` assertion in `SelfTest.results`, ok:true,
- zero `QA-Nav: qaRow ist bei Plain-Load` results (branch really switched),
- every result ok.

Observed: plain pass **107/107**, qa pass **104/104** (107 − 3 plain-only
QA-Nav checks + 1 positive) — the branch-switch math is self-evident in the
banner counts. Gate exit 0; wall time ~7 s. The manual `tools/_qa-neg.mjs`
probe stays for the regression-detection scenarios the selftest must not run
(unhide + `.nav` re-add).
