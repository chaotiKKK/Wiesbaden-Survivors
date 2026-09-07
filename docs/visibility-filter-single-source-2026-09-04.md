# Visibility filter becomes the single source of truth for gated rows (2026-09-04)

**Pass:** remove the class-based `.nav` stripping toggles on the sim and QA rows; the
visibility filter (`refreshNav`/`_navCandidates`, incl. the scroll-viewport filter) is
now the only thing that decides ring membership.

## Changes (index.html only)

1. **`renderCodex()` — sim row:** deleted `for (const b of simRow.querySelectorAll('button')) b.classList.toggle('nav', SIMS_ENABLED);`. Only the `hidden` toggle remains; the buttons keep `.nav` statically in the markup. Comment documents why.
2. **`syncQaRow()` — QA row:** same deletion for the `?qa` row.
3. **Gate assertions rewritten for the new contract** (`SelfTest._gatedRowHidden`,
   `_codexNavGate`):
   - The old assertion "Buttons tragen kein .nav" was the *stripping contract* and is now
     false by design. It is replaced by its inverse: buttons **do** carry `.nav` in markup
     (`navCount === btnTotal`), and the hardening proof (buttons never in the ring while
     hidden — the visibility filter wins) stays as `hiddenHits === 0`.
   - `_navHiddenRow` now saves/restores the original `.nav` state instead of stripping the
     class after the check.
   - The codex walk no longer pins `n === 8` (7 tabs + ZURÜCK always in the ring). Under
     the scroll-viewport filter, ZURÜCK at the bottom of a 1900px list is *below the fold*
     and legitimately not a member. New contract per tab: 7 tabs in ring, 0 content rows,
   0 hidden/simRow rows, and ZURÜCK either in the ring or reachable via the fold-walk
    (`scrollIntoView` + `refreshNav(back)` — the exact sequence `navMove` runs at the ring edge).
4. **Scroll hygiene the fold filter requires** (found while making the walk deterministic):
   - `UI.show('scCodex')` and the end of `renderCodex()` reset `#scCodex` to `scrollTop = 0`
     so a reopened codex or a tab switch always starts at the visible tabs.
   - Chrome scroll anchoring fought the reset: after a deep `scrollIntoView`, the innerHTML
     rebuild restored the old offset (`scrollTop = 0` placed before/inside the rebuild was
     silently undone on the next layout pass; measured `after renderCodex scroll=1122`).
     Fix: `#scCodex { overflow-anchor: none }` in CSS — the list is fully rebuilt per tab,
     anchoring has no legitimate job there. Verified: with the rule, the reset sticks
     (probe: `scroll=0 ring=7` after a fold reveal + tab switch).

## Verification

- **Full gate green twice in a row:** `node tools/verify.mjs` — exit 0, VERIFY OK, plain
  banner `SELFTEST 116/116 · PASS`, `?selftest&qa=1` pass `113/113` (QA row shown, all 24
  buttons ring members — the pause screen fits 774/774 at the gate viewport, so the fold
  filter doesn't shrink the QA ring).
- **Assertion counts unchanged** (116/113) because the gated-row helper still emits three
  checks and the codex walk still emits two — only the *contracts* changed.
- Root-caused boot "failures" during the pass were measurement artifacts: leaked headless
  Edge instances (each probe launch left one holding the fixed CDP port, serving a stale
  pre-edit page — "SELFTEST 115/116 · FAIL" with old assertion text was the stale page, not
  the current file). Killed 110 + 92 stray `msedge` processes across the pass; the boot
  probe now cleans up after itself.
- A real engine defect surfaced and was fixed: Chrome's scroll anchoring (above). A
  secondary finding: at 1280x900 the codex screen is 774px tall with 1900px of content, so
  the pre-filter "8 stops" contract was only true at the top of the list — the fold-aware
  walk is the honest contract now.

## Residual

- The `?devsim` positive branch (sim row visible) is not gate-covered — only the QA branch
  has a positive check. The identical mechanism (visible row + markup `.nav` → ring
  members) is proven by the QA pass; a devsim positive check could be added later.
- The other gated surfaces use `_gatedRowShown`/`_gatedRowHidden` unchanged; nothing else
  referenced the deleted toggles (grep before removal: only the two sites).
