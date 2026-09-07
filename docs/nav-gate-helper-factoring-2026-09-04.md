# Nav-Gate-Helfer-Factoring (SelfTest) — 2026-09-04

## What changed

The visibility/hardening predicates duplicated across `SelfTest._codexNavGate`
and `SelfTest._qaNavGate` were factored into three shared helpers on `SelfTest`:

- **`_navVisibleUpTo(el, stopId)`** — element + ancestors up to (excluding) the
  screen root are computed-visible (`display`/`visibility`). Replaces the inline
  walks that stopped at `scCodex` / `scPause`.
- **`_navHiddenRow(row)`** — returns `{ rowHidden, navCount, hiddenHits }` and
  runs the hardening proof internally: re-adds `.nav` to every button in the
  row, refreshes the ring, counts how many joined it, removes `.nav`, refreshes
  again. The shared predicate now *is* the guard the gate tests.
- **`_navBadRing(ring, stopId, row)`** — ring members that fail the visibility
  walk OR sit inside the gated row (containment check, subsumes the old codex
  `sim.contains(el)` and qa button-membership checks).

Both gate methods now call the helpers with identical assertion messages and
order; **zero assertions added or removed — suite stays 107/107**.

## Verified

- `node tools/verify.mjs` (real headless Edge): **SELFTEST 107/107 · PASS**,
  BalanceSim sync + chunked legs green, exit 0.
- `node tools/_codex-neg.mjs`: PASS — clean ring 8 stops, keyboard walk clean,
  hidden+.nav sim buttons excluded (0), full unhide regression still detected
  (4 bad / 4 sim members). Probe now calls `SelfTest._navBadRing` instead of a
  mirrored inline predicate (no drift possible).
- `node tools/_qa-neg.mjs`: PASS — plain load clean (11-stop pause ring, 0 QA),
  hidden+.nav excluded (0), unhide regression detected (12/12 back in ring);
  `?qa=1` positive branch 21/21 buttons ring members. Probe also uses the
  shared helpers.
- No stray Edge processes; `index.html` flag still `H`.

## Residual

The `?qa` positive branch's `rowShown` check (inverted visibility, no
hardening) stays inline — semantically distinct (shown-row check, not the
hidden-row hardening) and only two lines.