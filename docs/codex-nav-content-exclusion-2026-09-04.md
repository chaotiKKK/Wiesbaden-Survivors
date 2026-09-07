# Codex content rows are NOT keyboard stops — decision + implementation — 2026-09-04

Closes the “possible future UX pass” flagged in
`codex-nav-sim-gate-playtest-2026-09-03.md` (“…a keyboard user steps through every
entry (42–68 per tab) before the ring reaches ZURÜCK; Enter on a content row does
nothing.”).

## Decision

**Codex content rows are reference text, not controls — they must not be keyboard/gamepad
stops.** Rationale:

- A roving nav ring exists to reach *operable* elements. The rows in `#codexList` have no
  click handler anywhere in the codebase (verified: only `renderCodex` writes the list;
  nothing binds clicks to rows), so Enter/`navActivate` on one is a no-op.
- The cost was real: 42–76 arrow presses per tab just to reach Zurück, with the ring size
  varying by tab (weapons 50, items 76, …). Excluding content makes the ring stable at
  **8 stops on every tab** (7 tabs + Zurück).
- Shop `.item` rows must stay in the ring (they are buy actions), so the exclusion cannot
  be “drop `.item` from the selector” — it has to be per-region.

## Change (engine untouched, UI-nav only)

1. `UI.refreshNav()` now filters its collected members with
   `el => !el.closest('[data-navskip]')`. Any future read-only list opts out by marking
   its container `data-navskip` — self-documenting and reusable (sim results box, codex).
2. `#codexList` carries `data-navskip` with a comment explaining the why.
3. The selftest `SelfTest._codexNavGate()` assertions (added 2026-09-03) were tightened
   from “N members, none hidden/outside simRow” to the intended shape: ring has exactly
   **8 members (7 `codexTab` + `codexBack`)**, zero members inside `#codexList`, zero
   hidden, zero in `#simRow` — checked on the Waffen tab and again after switching to
   Items (re-render path). Suite stays at 102/102.
4. `tools/verify.mjs` change-set markers extended by two: `data-navskip` and
   `_codexNavGate()`.

## Verification (real Edge, served copy, live rAF)

- `node tools/_codex-neg.mjs` — **PASS**: plain load ring = 8 stops, `cleanContent: 0`,
  `cleanBad: 0`; a live 9× ArrowDown ring walk (via `UI.navMove`, the same funnel
  keyboard + gamepad use) visits only `codexTab`/`codexBack` acts; the sim-row
  regression is still **detected** (re-adding `.nav` + unhiding the row yields 4 bad /
  4 sim members).
- `node tools/verify.mjs` — **VERIFY OK**, exit 0: `SELFTEST 102/102` in real Edge
  (Waffen and Items ring assertions green), BalanceSim 10k green, both new change-set
  markers present.
- Shop unaffected: its items live outside any `data-navskip` container, so Enter-buy on
  `.item:not(.bought)` keeps working (covered by the existing selftest Brotato/shop legs
  plus the unchanged `.item` rule).

## First-run reading after this change
Arrow/`Tab` users open Kompendium → ring head on Waffen; 7 ↓ presses step the 7 tabs,
the 8th lands on Zurück; content is read with pointer/wheel or by tabbing past (it is
not focusable at all, so screen-reader virtual cursor still reaches it — this only
affects the roving ring, not document order/reading order).
