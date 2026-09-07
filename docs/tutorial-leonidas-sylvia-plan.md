# Tutorial Mode + Leonidas/Sylvia Character Adjustment — Plan

> **Status:** planning deliverable only. No code changed in this pass.
> **Ground truth:** this workspace currently has no usable video toolchain and only a few PNG icons locally (`crotch_zoom.png`, `icon-192.png`, `icon-512.png`, `maskable-512.png`). The attached Leonidas/Sylvia video cannot be inspected or edited here.

## 1) Tutorial mode — smallest buildable scope

**Goal**
A first-time player can reach the main loop without guessing the basic commands and goals.

**Smallest sensible scope**
- One short tutorial overlay/page that appears on first run, or from a clearly labeled “Tutorial” entry.
- It teaches only the essentials: move, shoot, use trail/ability cue if relevant, pause, and the basic objective.
- It does not add a separate training level, new enemies, or new game logic.
- It ends by dismissing into normal play, not by completing a separate sequence.

**Entry flow**
1. Player reaches the title/start area for the first time, or opens Tutorial manually.
2. Tutorial shows a small sequence of steps, one at a time.
3. Each step highlights the relevant control/idea and waits for a simple acknowledgment or the actual key/action.
4. After the last step, the tutorial closes and the player continues into the normal game flow.

**What it shows**
- Controls: movement, firing, pause, and any start-key cue already present in the game.
- Objective: what the player is trying to do in a run.
- Safety note: optional seed input behavior and how to start, if that is still useful for first-run clarity.
- Keep copy short, concrete, and in the existing game register.

**How it ends / transitions**
- Explicit “Skip” and “Next/Finish” affordances.
- On finish, return to the same place the player would be without the tutorial.
- If the game already supports a first-run flag or a menu state, the tutorial should plug into that rather than invent a new persistence model.

**Open decision needed**
- Tutorial style:
  - **Option A:** dismissable first-run overlay/walkthrough.
  - **Option B:** small interactive practice with a few guided tasks.
- Preferred entry point:
  - first-run only,
  - or always-available from a menu entry,
  - or both.

## 2) Asset / upgrade placeholders

**What exists locally**
- `index.html` with the game UI and styling.
- A few PNG icons for the PWA/home-screen artifact.
- No character art, no sprites, no sound files, no video, no archives.

**What can be faked with existing styling**
- Tutorial steps and callouts using existing screen/menu styling.
- Simple highlighted boxes, arrows/labels, and copy-based instructions.
- Placeholder visual cues for characters using color, labels, and layout rather than custom art.

**What real assets would add the most value later**
- Character visuals for selection and in-game identity.
- Tutorial highlights or pointers that are clearer than pure text.
- Feedback cues for actions important to new players.
- Any atmospheric background/icon polish that makes the first-run moment feel more intentional.

**Honest gap**
There are no local assets to substitute right now. Any asset-driven upgrade is either a placeholder pass now or an external asset creation/import pass later.

## 3) Leonidas/Sylvia character adjustment sketch

**What can be inferred here**
- Only the request intent: the attached video shows Leonidas and Sylvia, and the characters should be clearly recognizable in-game.
- The exact look, poses, costumes, silhouette, and color cues cannot be determined here because the video cannot be inspected or decoded in this environment.

**Proposed ident-kit-style adjustment**
- Naming/role assignment:
  - Assign Leonidas and Sylvia as the two named characters the player can recognize.
  - Give each a short role label consistent with the game’s existing crew/character register.
- Visual differentiation cues:
  - One stable color cue per character.
  - One stable shape/silhouette/pose cue per character where the game allows it.
  - One clear name/role label per character.
  - Keep the cue set identical across selection, in-game tagging, and any post-run presentation.
- Fallback rule:
  - If the clip does not clearly show a distinguishing face/silhouette/pose/color cue for a character, fall back to a stable name/role label plus one fixed color/shape mark and one framing cue per character, kept consistent across shots.

**Where the identity would show up in the game**
- Character selection/intro.
- In-game character tag or label.
- End/credits/preview presentation.
- Any future character portraits or cards, if those are added.

**Open decision needed**
- Character mapping:
  - **Option A:** Leonidas and Sylvia become fixed named characters in the game with an assigned role and recognizable visual cues.
  - **Option B:** the video is used only as stylistic direction; exact name/role/look stays open for later definition.
- Source of truth for the look:
  - derive from the attached video externally,
  - or define the characters from scratch here and treat the video as inspiration only.

## 4) Recommended next move

Start with **Option A** for tutorial scope and **Option A** for character mapping.

Reason: with no assets and no video tooling here, the most useful next deliverable is the smallest implementable tutorial overlay plus a concrete named-character intent, so the next pass has a real target instead of remaining open-ended.

## 5) Open items to decide before implementation

- Tutorial scope: overlay walkthrough vs small interactive practice.
- Tutorial entry: first-run only vs menu-available vs both.
- Character mapping: fixed named characters now vs stylistic direction only.
- Character look source: external video-derived art vs define here from scratch.
- Asset path: placeholder-only now vs plan an external asset import later.
