---
name: webgame-playtest
description: >-
  Playtest and verify a browser game (especially a single-file HTML/JS game) on a
  served copy: drive the full first-run / user journey (title, character/mode
  selection, controls, first wave with tutorial cue and skip, mid-run loops like
  level-up and shop, end/restart screens, meta screens, and the game's own
  ?selftest seam), record what a first-time player would see and understand at
  every step, and fix only defects that the run actually substantiates. Use this
  whenever the user asks to "playtest", "verify the user journey", "QA", "drive
  the first-run experience", "confirm the tutorial/skip behavior", "check the
  seed path", or "make the game's cold start / onboarding clearer" — even if they
  never say "playtest" — and also when the run happens in a harness whose preview
  cannot drive real-time frames (requestAnimationFrame throttled to zero), so the
  engine must be stepped deterministically instead.
---

# Webgame Playtest & First-Run Verification

Verify a game by driving its real visible surface on a served copy, and fix only
what you can substantiate. The job is a report with evidence, not a redesign:
preserve the existing engine, don't invent gameplay/enemies/modes, and say
explicitly when a behavior could not be confirmed through the surface you used.

## Why the discipline matters

- **Observe, then conclude.** A preview bridge can lag, uppercase text, drop
  elements from accessibility trees, and even serve you a cached older page. The
  served HTML you fetch over HTTP never lies. When live reads and served reads
  disagree, trust the served bytes for *content* and mark the live rendering as
  unconfirmed — do not pick a side silently.
- **Substantiate before fixing.** Fixing a product you cannot fully see is how
  regressions creep in. Only fix what this run actually observed, keep fixes
  bounded to user-facing copy/markup, and re-verify the served copy and the
  game's own self-check after every edit.
- **Judge through a first-timer's eyes.** The deliverable is what a *first-time
  player* understands at each step, not what you understand after ten passes.
- **Honest grading.** Report unexercised behavior as unexercised. Inflated
  grades steer the next pass at the wrong gap.

## Workflow

### 1. Map the pass before touching anything
List the journey legs you will drive (e.g., title → character selection →
controls → first wave with tutorial cue and skip → end/restart → selftest), and
write down what is explicitly out of scope (online/netplay, features needing a
human-length run, anything requiring real-time feel). Track the legs as todos.

### 2. Serve and establish ground truth
- Check whether a served copy is already answering (`curl -s -o /dev/null -w
  "%{http_code}" http://127.0.0.1:<port>/index.html`). Prefer an existing
  loopback server over starting a new one; background server processes started
  from a harness can die between turns.
- Fetch the served HTML and use it as the content ground truth for anything you
  will claim about the page. When you edit, re-fetch to confirm the edit landed
  server-side.

### 3. Probe the environment's limits first (cheap, saves hours)
Before driving the journey, run these probes and record what they return:
- **rAF alive?** `requestAnimationFrame(()=>__n++)` then read `__n` after ~1s.
  Zero callbacks means the preview cannot run the game in real time.
- **Caching.** After edits, load with a cache-buster (`?cb=N`) and verify a
  marker of your edit exists in the live DOM; browsers and bridges cache.
- **Focus/auto-pause.** Games often auto-pause on blur/`visibilitychange`.
  If `document.hidden` is false and state is `play` but timers are frozen, the
  cause is throttling, not the game.
- **Native dialogs.** `confirm()`/`alert()` block the page thread under
  automation and look like a hang. Stub them (`window.confirm=()=>true`)
  before clicking anything that may confirm.
- **Text casing/order.** Accessibility trees and CSS `text-transform` can show
  text in a different case than the DOM holds; match case-insensitively and
  parse footers with tolerant regexes (e.g. `/Siege:\s*(\d+).*?Runs:\s*(\d+)/i`
  if you know the order, or capture a slice and eyeball it).

Reusable probe snippets live in `references/probes.md` — read it when you need
one instead of retyping.

### 4. Drive the journey on the live surface
- Use the accessibility snapshot to see the page; interact by clicking fresh
  uids, and use direct DOM evaluation for the assertions you actually need
  (element visibility classes, hint text, button labels, seed values).
- Many rows are clickable without being `<button>`s (a div with a bound click,
  e.g. option toggles, level-up cards, shop offers). To act on one, find its
  text and click the element or its container through the DOM, then read state
  back from the engine/DOM — do not assume a click worked because the snapshot
  still looks the same (a pick may have advanced a queued screen).
- When a snapshot/click is unreliable, drive through the DOM and confirm the
  *state change* (engine state, visibility classes, counters), not the paint.

### 4b. Prefer a real browser when one exists
Before falling back to engine-stepping, check whether a real browser is
drivable: on Windows, system Edge ships at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`.
Launch it headless with a CDP port and a scratch profile, then connect a browser
automation CLI (`agent-browser connect <port>`):

```bash
powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList @('--headless=new','--disable-gpu','--disable-extensions','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=9333','--user-data-dir=<scratch-profile>','about:blank')"
```

In a real browser, `requestAnimationFrame` fires and the game runs in real time,
so you can skip engine-stepping entirely and verify *actual* gameplay (wave
timers ticking without manual update calls). Pitfalls that bit us: launch with a
fresh scratch profile each time (`--user-data-dir`); kill only Edge processes
whose command line matches that profile before deleting it (a stale instance
locks the profile and can keep old tabs/extensions alive); verify with `eval
location.href` that your evals target the game tab — a drifted tab silently
returns results from the wrong page (this once produced a false "seed help is
missing at runtime" for several passes).

### 5. Engine-step when real-time is dead
When the rAF probe says the preview cannot run frames (and no real browser is
drivable), the engine's own update path is still real. Advance it in bounded
batches and observe every transition as a genuine engine-state transition:

```js
let n = 0;
while (n < 600 && Game.state === 'play' && Game.waveTimer > 0) { Game.update(1/60); n++; }
```

Why this is legitimate: the game's own shipped self-check (`?selftest`, often
with a `LongRun` assertion like "echte Game.update überquert mindestens zwei
Wellen") drives the identical method. Report every run leg made this way as
**engine-stepped observation, not real-time play**, and remember that
wall-clock-driven displays (e.g. playtime counters) will show ~0 — that is a
surface artifact of stepping, never a game defect to "fix".

### 6. Record each leg as you go
For every leg, capture: what you actually saw, what a first-time player would
understand, and every defect you can substantiate. Do not pad: a leg with no
defect is a positive finding (e.g. "defeat screen shows clear stats and menu
options").

### 7. White-box probes for unreachable states
Some states (wave-20 victory, deep unlocks) cannot be reached in-session. You
may reach the *screen variant* by a direct engine call (`Game.endRun(true)`),
but you must label it a white-box probe in the record — the screen under test is
verified; the natural path to it is not.

### 8. Fix policy (the boundary)
- Fix only defects this run substantiated.
- Keep fixes bounded to user-facing copy/markup. No engine, combat, enemy,
  character-definition, or persistence-model changes.
- No invented fixes for unverified gaps — flag the gap instead.
- After any edit: re-fetch the served HTML to confirm the edit landed, and
  re-run the game's self-check (`?selftest`) to confirm the engine still passes.
- If the game has an option that gates tutorial/onboarding behavior, treat the
  option gate as the intended design; propose a once-per-save marker only as a
  product decision, never silently change it.

### 9. Persistence hygiene
Playtest runs write to `localStorage` and leave fabricated achievements/unlocks
behind. Clear the save at pass start for a clean slate, and wipe it again at the
end so the checkout is left neutral. Note both resets in the record.

### 10. Report
Open with the graded headline as the FIRST line of the report:
```
GRADES spec=<n> design=<n> correctness=<n> quality=<n>; biggest gap: <a few words>
```
Rubric used by this workflow: grade harshly; grade **correctness** only from
behavior actually exercised (unexercised claims cap it at 6); grade **quality**
against the smallest version of the same behavior; grade **design** against
structure a maintainer would praise — a grown app still living in one or two
files caps design at 5. Then give the observed evidence, the substantiated
defects (fixed vs. recorded), what you deliberately did not do, and the honest
limits of the surface you used.

### 11. Leave a durable record
Write a dated markdown file (e.g. `docs/<pass>-playtest-YYYY-MM-DD.md`) with:
method and its caveats (engine-stepped vs real-time), the per-leg observations,
fixed defects, findings that need a product decision (not fixed), and remaining
verification limits.

## Environment pitfalls at a glance

| Symptom | Likely cause | Response |
|---|---|---|
| Page frozen at first frame, state `play`, `focused:true` | rAF throttled to zero by the preview | Engine-step via `Game.update` batches; label as engine-stepped |
| Evaluate hangs / times out mid-click | Native `confirm()` blocking | Stub `window.confirm` before the click; recover with a forced navigation |
| Live DOM missing an edit that curl shows | Browser cache | Navigate with `?cb=N` cache-buster and re-check |
| Element visible in served HTML, absent from live DOM | Bridge/a11y lag or wrong layer active | Re-read after reload; if still missing, report as served-confirmed / live-unconfirmed |
| Text case mismatches in reads | `text-transform` / tree uppercasing | Match case-insensitively; parse with tolerant regexes |
| Buttons hard to target by label | DOM text is mixed-case while the a11y tree uppercases it | Prefer `data-act`/id handles; enumerate `[data-act]` on the screen when unsure |
| Snapshot unchanged after a click | Click landed elsewhere or queued another screen | Read engine state/visibility after the click, not the paint |
| Game freezes instead of pausing | autoPause on blur/visibility | Check `document.hidden`/`hasFocus`; synthesize focus if needed |

## Out of scope by default
Real-time *feel* (framerate, movement smoothness) can only be confirmed by a
human at a real browser or a true headless browser — say so rather than claiming
it. Networked/co-op modes, human-length runs, and video/media deliverables are
recorded as not-testable-here when the harness cannot reach them.
