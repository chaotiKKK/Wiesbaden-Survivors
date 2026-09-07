# refreshNav derives membership from visibility — 2026-09-04

Follow-up to `codex-nav-content-exclusion-2026-09-04.md` (same session, same area).

## Problem
`UI.refreshNav()` collected ring members purely by class
(`.nav,.card:not(.lock),.item:not(.bought),.lvlCard,.opt,.wrow`) inside the current
screen. Hiding a row therefore only worked if every hide-path also stripped `.nav`
(sim row, QA row, net menu) — a fragile invariant. The audit found two live members
that violate it today:

- **`#btnWager`** (shop, `data-act="wager"`): `class="btn small nav hidden"` — hidden
  yet a ring member, so the keyboard ring could land on an invisible “Wette annehmen”.
- **`#netHangUp`** (`data-act="netHangUp"`): `class="btn small nav danger hidden"` —
  same problem on the net screen while idle.

`.hidden{display:none !important}` (line 44) makes all of these detectable via
computed style.

## Change (one place)
`refreshNav()` now filters candidates by a `shown(el)` walk: every element and its
ancestors up to `<html>` must compute `display !== 'none'` and
`visibility !== 'hidden'`; the `[data-navskip]` exclusion stays. Ring membership is
therefore *derived from actual rendering*, and the `.nav`-stripping toggles become a
belt-and-braces layer instead of the only guarantee. `navIdx` is clamped after the
filter as before, so a shrunken ring can never point off-list.

Consequences:
- Hidden sim/QA buttons cannot be ring members even if a future path forgets to strip
  `.nav`.
- `#btnWager` / `#netHangUp` can no longer receive ring focus while hidden — and join
  the ring normally as soon as their container is shown (visibility is re-evaluated on
  every `refreshNav`, which shop/net renders already trigger).
- A hidden *current screen* (should not happen via `UI.show`) degrades to an empty ring
  instead of an invisible-focus list.

## Selftest
`SelfTest._codexNavGate()` gained one assertion: re-add `.nav` to the four sim buttons
**while the row stays hidden**, refresh the ring, and require **0 members** inside
`#simRow` (then restore). Suite: 98 → 102 → **103/103**, all green in real Edge.

## Verification
- `node tools/_codex-neg.mjs` — **PASS** (all scenarios in one run):
  - clean plain load: ring = 8 stops (7 tabs + Zurück), `cleanContent: 0`,
    `cleanBad: 0`;
  - live 9× ArrowDown ring walk visits only `codexTab`/`codexBack`;
  - scenario A “forgot to strip `.nav`” (row hidden + buttons `.nav`): **0** sim
    members — the visibility filter is what excludes them;
  - scenario B full regression (row unhidden + `.nav`): 4 bad / 4 sim members —
    still detected.
- `node tools/verify.mjs` — **VERIFY OK**, exit 0: `SELFTEST 103/103`, BalanceSim 10k
  green, new change-set marker (`Sichtbarkeitsfilter`) present.
- Engine untouched; only `refreshNav` + the codex-nav selftest group changed.

## Honest limits
- `visibility:hidden` is checked per ancestor without honouring a descendant that
  re-sets `visibility:visible` (rare pattern; not used in this codebase). `display:none`
  is unconditional anyway.
- The two latent finds (`#btnWager`, `#netHangUp`) are fixed *by construction* of the
  shared filter; they were not each re-played through a live shop/net session.
