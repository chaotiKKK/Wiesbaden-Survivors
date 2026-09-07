# Tutorial verification note (same workspace)

**What is being verified**
The recent tutorial change in `index.html` is small and bounded: it reworded/extended the existing in-run tutorial steps, kept the existing `tutSkip` path and the existing hint-advance path, and left core combat/net logic untouched.

**Where the tutorial currently hooks**
- `Game.showTutorial()` and `Game.hideTutorial()` already exist.
- The tutorial is triggered on wave 1 start: `startWave()` calls `this.showTutorial()` when `n === 1`.
- `showTutorial()` bails early if `!OPT().tutorial`, if `this._tutI !== null`, or if there are no players.
- The skip button is rendered by `_tutSkipBtn()` and handled via the existing `data-act="tutSkip"` path, which calls `hideTutorial()`.
- Hint advance/timeout is handled in the game tick area using `_tutI`/`_tutSteps`/`_tutT`.

**What is true in this workspace right now**
- Local assets are minimal: only a few PNGs exist (`crotch_zoom.png`, `icon-192.png`, `icon-512.png`, `maskable-512.png`). There are no character art, sprites, sound files, video, or archives.
- The attached Leonidas/Sylvia video cannot be inspected or edited here because this environment has no usable video toolchain.
- The existing planning file `docs/tutorial-leonidas-sylvia-plan.md` already contains the character-adjustment sketch and open decisions.

**What is confirmed**
- The tutorial mechanism is real and reachable: it appears during wave 1 and can be skipped with the existing button.
- The change is confined to the tutorial flow and the skip/hint behavior; it is not a separate training mode.

**What is NOT yet fully verified here**
- First-run-only gating is not fully proven in this workspace yet. The current code triggers the tutorial on wave 1 whenever `OPT().tutorial` is on and `this._tutI` is still null; it does not yet read a dedicated “shown once per fresh run” marker before that trigger.
- Skip cleanup is structurally sound, but a clean end-to-end fresh-save walk is still the safer confirmation.

**One remaining correctness item**
Confirm from a served copy with a fresh save that:
- the tutorial appears once on a first run,
- it does not reappear on later runs, and
- skip ends the tutorial sequence cleanly without leaving the hint stuck.

**If another agent continues here**
- Re-read the current `index.html` tutorial hooks and the `startWave` trigger at the wave-1 path.
- Decide whether first-run-only behavior should be expressed as a save flag, an `OPT()` setting, or a menu entry before treating the tutorial change as fully closed.
- Keep any Leonidas/Sylvia visual work deferred to a machine/toolchain that can inspect the video or supply new assets.
