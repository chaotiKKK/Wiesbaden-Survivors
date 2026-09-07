# Wiesbaden Survivors — First-Run Acceptance

Concise, externally readable playability note for the shipped page.

## What a first run should do

- The page loads at the title screen.
- A visible start control is present on the title screen.
- Pressing the start key begins play.
- Movement and shoot actions respond to input.
- Pause is accessible.
- Game-over / end state has a clear way back to playing or the title.
- Optional seed input does not steal the first key press on load.
- The page loads with no console errors blocking the title path.

## Verified facts (read-only reference)

- Title screen is visible on load.
- Seed input is focusable, but it is not autofocused on cold start.
- Cold-start title path is clean in the live preview.
- Internal self-test surface passes at `?selftest` with `SELFTEST 98/98 · PASS`.

## Known limits

- This is an inline game embedded in one large page, so later behavior/UI changes are more brittle than they would be in a separated spine.
- Audio enhancements exist as a generation plan in `docs/sound-design.md` and are blocked until the required API key / tooling is available.
