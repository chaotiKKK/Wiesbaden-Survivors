# Codex screen-reader reading-order check (2026-09-04)

**Pass:** add an automated reading-order guarantee for the codex so rows excluded from
the keyboard/gamepad ring (`data-navskip`, reference content) stay reachable and
structured for assistive tech: `role=list` on the container, `role=listitem` +
`aria-label` on every row, nothing `aria-hidden`/`display:none`.

## Why

The codex nav work made content rows keyboard-excluded (they are reference text, not
controls), and ZURÜCK is reached via the fold-walk. Exclusion from the *custom in-game
ring* must never leak into the accessibility layer — a screen-reader user reads the
DOM, not `UI.navEls`. Before this pass the rows were a flat wall of unstyled divs with
no list semantics and no names; nothing guarded against someone implementing the
exclusion as `aria-hidden`.

## Changes (index.html)

1. **`renderCodex()`** (single build point — every codex row goes through its `add()`):
   - `#codexList` gets `role="list"` + a per-tab `aria-label` ("Kompendium — <Tab-Name>",
     read from the active tab button, which otherwise marks state only via border color).
   - Every row `role="listitem"` + `aria-label` (optional explicit label; default = the
     row's own text collapsed — full content stays the accessible name). Rows are built
     with `className='item'` locally here, so the shop's `.item` cards are untouched.
2. **Markup**: `#codexList` carries `role="list" aria-label="Kompendium-Inhalt"`
   statically as well.
3. **New selftest group `SelfTest._codexA11y`** (registered after `_codexNavGate`; runs
   in both the plain and `?qa` passes):
   - container is `role=list` with a non-empty aria-label;
   - weapons tab: every row `role=listitem` + non-empty aria-label (42 rows), 0 rows
     hidden/aria-hidden — ring-excluded but AT-reachable;
   - reading order follows the data registry: first row label contains `WEAPONS[0].name`,
     last row label contains the final weapon;
   - the list's aria-label names the active tab ("Waffen");
   - items tab: same full contract (68 rows).

## Verification

- **In-page group:** 6/6 PASS (plain run also green in the full gate).
- **Real accessibility tree** (`tools/_codex-a11y-live.mjs`, kept as regression): via
  CDP `Accessibility.getFullAXTree` on the live `scCodex`, the AX tree contains exactly
  one `list` node named "Kompendium — Waffen" with 42 `listitem` children whose names
  start with "Dienstpistole …" and end with "🔒 THERMAL-DAMPFKANONE …" — the DOM
  attributes genuinely surface to assistive tech, in registry order. 7/7 PASS, 0 page
  errors.
- **Full gate:** `node tools/verify.mjs` exit 0, VERIFY OK; plain banner now
  **122/122**, `?selftest&qa=1` pass **119/119** (+6 assertions each). No stray Edge
  processes; `index.html` flag `H`. Current-state count references updated in AGENTS.md
  and the handoff doc (historical dated docs unchanged).

## Residual / notes

- The tab strip still marks the active tab only by border color — no `aria-pressed`/
  `aria-selected` on the tab buttons. The list aria-label names the current tab as a
  partial mitigation; real tab semantics would need the buttons reworked as a tablist.
  Out of scope for this pass (rows were the ask).
- `aria-label` defaults to the row's own collapsed text — a faithful name with zero
  per-row authoring, at the cost of duplicating content for browse-mode readers
  (harmless; quick-nav announces the label once).
