# Sound Design — Wiesbaden Survivors

Short brief and plan. Audio behavior here is described as intended, not as shipped.

## Posture

- Sound work is ElevenLabs-gated.
- Generation script lives at `tools/gen_sfx.mjs`.
- It requires `ELEVENLABS_API_KEY` and `@elevenlabs/elevenlabs-js`.
- Output target is `audio/*.mp3` in the workspace root.
- This environment does not run generation here; the brief is a plan, not an executed asset set.

## Intended sound behavior

- UI sounds: short, clean, low-friction confirmations for menu/selection and navigation.
- Gameplay impacts: restrained but distinct shoot/hit/explosion/damage cues, in tone with the retro-futurist terminal aesthetic.
- Weapon identity: weapon-specific cues can exist, but the larger the set, the more important it is to keep them consistent and not noisy.
- Ambient/mood: optional, light, and non-intrusive; used sparingly so the page stays readable.

## Plan shape

- Define a small set of sound roles first: UI, core gameplay impacts, optional ambient/mood.
- Where weapon-specific SFX make sense, map stable filenames to weapon IDs so integration stays predictable.
- Keep assets small and loop-friendly where ambient/mood is used.
- When generated, wire assets into the existing audio path as fallbacks/playables without inventing a new audio system.

## Blocker, stated plainly

- Generation and integration are blocked until an `ELEVENLABS_API_KEY` is available or the work is done elsewhere.
- Do not treat `tools/gen_sfx.mjs` as already runnable here without that key and dependency.

## Suggested next step

- On a machine with the key and toolchain, generate a small starter set, place the outputs in `audio/`, and integrate only the roles that measurably improve first-run clarity and gameplay feedback.
