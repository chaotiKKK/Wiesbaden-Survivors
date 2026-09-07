# Codex keyboard/gamepad nav vs. sim-row gate — playtest 2026-09-03

Surface: served copy on 127.0.0.1:8080, plain load (`index.html?cb=…`, no `?devsim`),
driven through the preview bridge (DOM reads + real `KeyboardEvent` dispatch into
`Game.handleGlobalInput()`, the same function the rAF loop calls per frame).

## Question
On a plain load, is the BalanceSim row fully skipped by codex keyboard/gamepad
navigation, and does the focus ring ever land on an invisible button?

## How the nav works (source)
`UI.refreshNav()` collects `.nav,.card:not(.lock),.item:not(.bought),.lvlCard,.opt,.wrow`
members of the current screen — **class-based, no visibility filter** — so sim-row
exclusion depends entirely on `renderCodex()`, which on every open/tab-switch call
toggles `simRow.hidden` and strips/restores `.nav` on its four buttons per
`SIMS_ENABLED`. Keyboard (ArrowDown/Up) and gamepad (dpad/stick via
`padPressed`/`padAxis`) both funnel into `UI.navMove()` over the same `navEls`.

## Evidence (all on the plain load)
1. **Membership**: `simRow` `display:none`; all four sim buttons (`sim`×2,
   `simClear`, `simJson`) lack `.nav`. `UI.navEls` = 50 members on the Waffen tab
   (7 `codexTab` + 42 content `.item` rows + `codexBack`). **0 members inside
   `#simRow`, 0 hidden members.**
2. **Full ring walk**: 50× `navMove(1)` from index 0 — focus sequence
   codexTab×7 → item×42 → codexBack; zero violations (never on a hidden element,
   never on a sim element). Exactly one `.focus` element in `scCodex` per step.
3. **Wrap edges**: `navMove(-1)` at index 0 wraps to codexBack (visible, ring on,
   not sim); `navMove(1)` wraps back to index 0.
4. **Real keyboard path**: dispatched `ArrowDown` keydowns → `handleGlobalInput()`
   moved navIdx 0→1→2 with the ring following visible tabs. `Enter` on a tab
   switched content; `renderCodex`→`refreshNav` rebuilt the list (Items tab: 76
   members = 7 tabs + 68 rows + back) — sim still excluded, 0 hidden members,
   ring on a visible tab. `navActivate` can only click list members, so the sim
   actions are unreachable even by Enter.
5. **Gamepad**: same funnel (`UI.navMove`) — code-verified; no controller attached,
   so not device-exercised.

## Ring rendering
Active "Amt" theme: focus = yellow left bar + white text on flat buttons
(`.btn.focus` computed `border-left-color: rgb(255,204,0)`); the ▶ marker is
intentionally disabled in this theme (`.btn.focus::before{content:none}`).
Ring is only ever painted on visible members.

## Observations (pre-existing, not sim-gate related)
- Codex content `.item` rows are nav members, so a keyboard user steps through
  every entry (42–68 per tab) before the ring reaches ZURÜCK; Enter on a content
  row does nothing. Predates the gating; recorded for a possible future UX pass.

## Verdict
Sim row fully skipped; focus ring never lands on invisible buttons on a plain
load. No code change needed.
