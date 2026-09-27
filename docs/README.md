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
- Internal self-test surface passes at `?selftest` with `SELFTEST n/n · PASS`. The count grows as assertions are added (it was 98 when this note was first written); `node tools/verify.mjs` asserts the banner, so read the current number there.

## Known limits

- This is an inline game embedded in one large page, so later behavior/UI changes are more brittle than they would be in a separated spine.
- The game SFX are synthesized locally with ffmpeg (`tools/synth-audio.mjs`), and no API key is needed. `docs/sound-design.md` holds the design. Licensed assets would be the next quality step.
- Performance under CPU throttling: see `docs/pw-perf-klaerung-2026-09-28.md`. The red 6x legs of `pw_perf` come from software canvas raster in headless Chromium, not from the game loop.
