# Read-only long lists: navskip audit + empty-ring fold reveal (2026-09-04)

**Pass:** apply the codex `data-navskip` treatment to other read-only long lists
("statistics rows, end-screen details") so arrows stop only on actionable controls.

## Finding: the named rows never were nav stops

An empirical ring scan (`tools/_ring-scan.mjs`, kept) of every title-reachable screen
plus a live end screen showed:

- Statistics rows (`#statsAll .l`), end-screen details (`#endStats .l`) and achievement
  rows (`.ach`) are **not candidate classes** — the candidate selector is
  `.nav,.card:not(.lock),.item:not(.bought),.lvlCard,.opt,.wrow` — so arrows never
  dragged through them. The end screen's ring is 6 pure-button stops
  (`fb`×4, again, toTitle).
- The only candidate-classed read-only rows in the game were the codex content rows,
  already `data-navskip`'d. All remaining candidate rows (options `.opt` toggles, char
  `.card` picks, shop offers/inventory, level/relic cards) are interactive by design.
- **Consequence:** adding `data-navskip` to the `.l` containers would be decorative —
  no change was substantiated on that axis.

## Real defect the scan exposed (introduced by this session's fold filter)

`scStats` and `scAchv` opened with an **empty nav ring** at common viewports: their
only stop (Zurück at the bottom of a long read-only list) sits below the fold, so the
scroll-viewport membership filter left zero members and the early return in `navMove`
made arrow/gamepad input a dead end on those screens.

## Fix (index.html)

`UI.navMove(d)`: when the ring is empty but candidates exist outside the fold, the
first press reveals the nearest below-fold candidate (for d>0) or above-fold (d<0) —
`scrollIntoView` + `refreshNav(next)` — mirroring the existing at-edge fold walk.
Read-only content itself is still never a stop; only the exit control is revealed.
Lazy on first input, so opening the screen never yanks the scroll position.

## Regression guard

New selftest group `SelfTest._readOnlyListNav` (both gate passes): for `scStats`
(`statsBack`), `scAchv` (`achvBack`), `scEnd` (`toTitle`) — after a real render +
show + refreshNav, the back control must remain a candidate, and arrow presses must
reach it from the top (whether the ring was empty — fold reveal — or direct).

## Verification

- Standalone group: 6/6 PASS — `scStats`/`scAchv`: "Ring war leer → Falten-Reveal,
  2 Schritte, 1 Stopps"; `scEnd`: direct 6-stop walk to toTitle.
- Full gate: `node tools/verify.mjs` exit 0, VERIFY OK; plain `SELFTEST 128/128`,
  `?qa` pass `125/125` (+6 assertions each). File-boot confirms 128/128. No stray
  Edge processes; `index.html` flag `H`. Count references updated in AGENTS.md
  (historical dated docs unchanged).

## Residual

- Other bottom-anchored screens are unaffected because they carry top-of-screen stops
  (codex tabs, pause controls); the reveal generalizes if a future read-only list
  screen loses its ring the same way.
- The fold reveal is keyboard/gamepad-only by construction (`navMove`); mouse users
  scroll normally.
