# Generischer Surface-Vertrag (SelfTest) — 2026-09-04

## Premise check first (the important part)

The mission named scCode export/codeBox and the Feedback row as "remaining
gated surfaces". **They are not gated.** Verified from source + dispatch:

- **scCode / Spielstand-Code** — title-menu entry (`data-act="code"`, key X),
  export/import roundtrip shipped and playtested
  (`docs/midrun-endrun-playtest-2026-09-03.md`). The only dev-adjacent path is
  `simJson` (?devsim) writing `BalanceSim._lastJson` into the shared codeBox —
  the *action* is gated, the *screen* is a player feature.
- **Feedback row (`#fbBtns`, scEnd)** — end-screen balance loop; `Feedback.submit`
  records to the save and nudges the recommended difficulty. No flag anywhere.

Applying "hidden and unnavable on plain load" to them would break real
features, so the contract was built in both directions instead.

## What changed (selftest-only + one id; engine untouched)

One **generic gated-row contract** on `SelfTest`, replacing the bespoke
hidden/unnavable checks in both gate groups:

- `_gatedRowHidden(rowId, label, flagParam)` — 3 assertions: row hidden on plain
  load, its buttons carry no `.nav`, and even with `.nav` re-added they never
  join the ring (visibility filter decides). Registered by **simRow**
  (Codex-Nav) and **qaRow** (QA-Nav); new gated rows register with one call.
- `_gatedRowShown(rowId, label, flagParam)` — positive counterpart: under the
  flag the row is shown and every button is a ring member (the `?qa` branch).
- `_playerRowVisible(screenId, rowId, label)` — the **inverse contract** for the
  two named surfaces: scCode/codePanel and the Feedback row must stay visible
  AND navigable on a plain load. Guards against someone accidentally gating a
  player feature. New group `_surfaceContracts()` registers both (scCode's
  statBox gained `id="codePanel"` for the row handle).

Codex/QA gate extra checks (ring walk with content-row exclusion, pause-ring
QA-act check) are unchanged; the `_qaNavGate` positive message keeps the exact
'QA-Nav: unter ?qa' prefix the gate's branch-switch proof filters on.

## Verified

- `node tools/verify.mjs` (real headless Edge): **SELFTEST 109/109 · PASS**
  (107 + 2 surface-contract), BalanceSim sync + chunked green, and the
  `?selftest&qa=1` pass **106/106** with `pos:[true], plain:0, all:true` —
  branch-switch proof intact. Exit 0.
- `node tools/_surface-neg.mjs` (kept): the real contract helpers pass clean on
  a plain load (`[true,true]`) and DETECT the regression they guard (codePanel
  + fbBtns forced hidden/`.nav`-stripped → `[false,false]`). Exit 0.
- `node tools/_qa-neg.mjs`, `node tools/_codex-neg.mjs`: still PASS after the
  refactor (they call the shared helpers, which are unchanged).
- One gate run failed 2× mid-pass with a page stuck at `len:684`/`BalanceSim
  undefined` while a fresh boot-diag on the served copy showed 109/109, 0
  errors, and the next gate run was fully green — the documented fresh-profile
  tab-drift flake (evals landing on a drifted tab after the one-shot tab
  activation), not a code regression.

## Residual

The gate's one-shot tab activation is vulnerable to mid-run drift (the flake
above); re-activating the tab inside the banner poll when `location.href`
drifts off the expected URL would close that class. Left as follow-up — the
failure signature is documented in `docs/edge-cdp-playtest-handoff.md`.