# Live play: wager/Trennen join the nav ring only when actually visible (2026-09-04)

**Pass:** real-surface confirmation (headless Edge, rAF live, real DOM clicks on a fresh
served copy) that the two `.nav + hidden` markup buttons — `#btnWager` (shop) and
`#netHangUp` (net) — are nav-ring members only while actually visible, per the
visibility filter that is now the single source of truth.

## Live driver (`tools/_wager-trennen-live.mjs`, kept as regression)

Self-serves the current workspace fresh, launches scratch headless Edge with the
real-rAF flag set, reaches the first shop the real way (fixed-seed run via
`Game.startRun()`, real DOM clicks through level-up/relic/shop screens), then flips the
wager offer and the net host state and reads the LIVE ring (`UI.navEls`) plus computed
visibility after every step. Cleanup on exit; no strays left behind.

## Results

**Shop leg — 6/6 PASS:**
- First shop (wave 1, offer rolled): `#btnWager` visible → IN ring (idx 1 of 11).
- Offer nulled through the real render path (`Game.wagerOffer = null; UI.renderShop()`):
  hidden → OUT of ring (10 stops).
- Offer restored + re-render: visible → IN ring again (idx 1 of 12).

**Net leg — two real staleness defects found live, then fixed:**
1. After a real click on "Raum erstellen" (`netHost`, phase → signaling) the Trennen
   button became visible but the ring stayed at 4 stops — a visible button keyboard/
   gamepad users could not reach.
2. After a real Trennen click (`netHangUp`) the button went hidden but the ring kept it
   at idx 3 of 6 — a hidden stop the filter is supposed to prevent.

Root cause (single, static + live confirmed): the click dispatch has no catch-all
`refreshNav`, and `renderNet()` — unlike every other screen renderer (`renderShop`,
`renderCodex`, …) — never refreshed the ring after the visibility toggles it makes; it
only called `scheduleFit()`. Fix: `renderNet()` now ends with `this.refreshNav()`
(which schedules the fit itself). One line; no engine logic touched.

**After the fix — net leg 9/9 PASS (total 15/15, 0 page errors):**
- Idle: Trennen hidden → OUT of ring; ring = `netHost,netJoinMode,netManualMode,netBack`.
- After hosting: Trennen visible → IN ring immediately (idx 3 of 6).
- After the real disconnect click: Trennen hidden again → OUT of ring (4 stops).

## Gate

`node tools/verify.mjs` — exit 0, VERIFY OK, plain banner PASS (>=100), `?selftest&qa=1`
pass 113/113. No stray Edge processes; `index.html` flag still `H`.

## Notes

- The broker reachability never mattered for the test: both `signaling` (broker
  connected) and `error`/`closed` (broker unreachable) leave `Net.phase !== 'idle'`, so
  Trennen shows either way; the run observed `phase=signaling` (public broker reached).
- Scope kept to the two screens named in the request. The same staleness class could
  exist on other screens whose actions toggle visibility without a re-render that ends
  in `refreshNav` — not investigated here.
