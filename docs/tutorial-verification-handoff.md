# Tutorial verification + handoff note (same workspace)

**Scope of this note**
Same workspace as the recent tutorial-improvement pass. This is a compact handoff so another agent can pick up the verified facts and the one remaining correctness item without re-deriving them.

**What changed in the last pass**
- `index.html`: small tutorial improvement only.
  - Reworded/extended the existing in-run tutorial steps so the first-run hint reads more clearly and ends more cleanly.
  - Kept the existing `tutSkip` action path and the existing hint-advance path.
  - Did not add a separate training mode, new enemies, or new core combat/net logic.
- No new standalone Leonidas/Sylvia adjustment file was added in the last pass. The existing planning file `docs/tutorial-leonidas-sylvia-plan.md` already contains the character-adjustment sketch.

**What was confirmed earlier from the live preview**
- Cold load renders a clean title screen.
- Start moves to character selection.
- From character selection, the controls screen is reachable, and a wave 1 run is reachable from there.
- During wave 1, the tutorial hint area is visible with the “ÜBERSPRINGEN” button, and clicking that button dismisses/cleans the hint as expected.

**What was NOT fully confirmed in this pass**
- I could not complete a clean-save end-to-end assertion from a truly fresh `localStorage` slate in this pass, so the first-run-only tutorial gating is not fully verified here.
- There is currently no tracked git diff to read in this workspace (`git status` shows only untracked `docs/` and `AGENTS.md`), so an exact diff cannot be re-presented from git in this pass.

**One remaining correctness item worth re-checking**
- From a served copy with a fresh save, confirm that the tutorial appears once on a first run and does not reappear on later runs, and that skip ends the tutorial sequence cleanly without leaving the hint stuck.

**If another agent continues here**
- Use `docs/tutorial-leonidas-sylvia-plan.md` for scope and the character-adjustment sketch.
- Re-read the current `index.html` tutorial hooks: `Game.showTutorial()`, `Game.hideTutorial()`, `_tutI/_tutSteps/_tutT`, `$('tutHint')`, and the `data-act="tutSkip"` handler.
- Re-verify the first-run gating and skip-cleanup behavior from the served copy before treating the tutorial change as fully closed.

**Honest limits that still apply**
- This workspace has no usable video toolchain, and only a few PNGs exist locally. The attached Leonidas/Sylvia video cannot be inspected or edited here.
- Any real character-art or sprite substitution is deferred to a machine/toolchain that can actually inspect and edit the video or supply new assets.
