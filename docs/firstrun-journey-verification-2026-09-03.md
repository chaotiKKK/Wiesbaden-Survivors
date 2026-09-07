# First-run / user-journey verification — 2026-09-03

## Surface used
- Served copy: `http://127.0.0.1:8080/index.html`
- Live inspection: preview bridge snapshot + targeted DOM reads

## Journey steps observed
1. Title screen: title block, tagline, clear start action, optional seed input.
2. Seed input: not autofocused in this snapshot; served HTML contains a short seed purpose line.
3. Character selection: each character shows name, role, profile, and moveset line.
4. Controls: explicit keyboard/gamepad mapping, clear start action.
5. First run: first wave starts, HUD shows `ANGRIFFE FEUERN AUTOMATISCH` and `Dein Arsenal zielt auf den nächsten Feind`; tutorial hint visible with `ÜBERSPRINGEN`.
6. Tutorial skip: skip button reachable; hint hidden after skip.
7. End/restart: run-end screen with stats, feedback request, `NOCHMAL` and `HAUPTMENÜ`; clean return to title.
8. Selftest: `?selftest` shows `SELFTEST 98/98 · PASS` plus assertion list; served HTML contains the selftest block.

## Problems substantiated
- First-run objective clarity is a bit shallow for a complete newbie.
- The visible rendering of the seed purpose cue could not be confirmed through this live DOM read, even though it is present in the served HTML.

## Behaviors left unconfirmed
- A full headless end-to-end walk of the journey in a real browser was not available in this environment.
- The live preview was treated as useful but incomplete; anything depending on it being a perfect oracle was flagged as such.
