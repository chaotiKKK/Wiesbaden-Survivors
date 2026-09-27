# Playwright Suite Hardening — Best-Practices Pass (2026-09-11)

GRADES spec=4 design=4 correctness=4 quality=4; biggest gap: the keepers are still plain scripts, not a pytest runner — no per-test retries/reporting artifacts; fine for a single-page game, would not scale to a matrix.

## Trigger

`playwright-best-practices` skill activation. Relevant references applied to this repo's four keeper suites (`pw_recon`, `pw_walk`, `pw_vol_probe`, `pw_abuse`): **assertions-waiting** (fixed sleeps are the classic UI-flakiness cause → poll conditions) and **flaky-tests** (shared setup, stability proof by repeat runs). The repo has no `playwright.config` / test runner by design (AGENTS.md: single-page game, lean tooling), so the skill's pytest/config machinery was deliberately not imported — its *rules* were mapped onto the existing script style.

## What changed

- **New `tools/pw_lib.py`** — the shared core all assertion suites now import:
  - `Serve` — in-process `ThreadingHTTPServer` context manager (replaces each suite's hand-rolled copy; still no orphan processes, the `with_server.py` lesson from 2026-09-11 holds).
  - `wait_until(page, js, want, …)` — poll a page-side JS expression with a deadline instead of sleeping a guess.
  - `new_page(browser, url, …)` — fresh context with the standard instrumentation (console/pageerror capture, `.m4a` request log, `confirm` stub).
  - Shared probes: `SCREEN_JS`, `GAME_STATE_JS`, `run_ui_hotkey_check`.
- **`pw_walk.py`** — rewritten against the lib; every transition (char select, controls, run start, pause, end, title, code/codex screens) is now a polled condition. 23/23.
- **`pw_vol_probe.py`** — rewritten; stepping checks poll until the value lands on the expected rung (helper `step_and_expect`), reload-persistence polls the saved value. 21/21.
- **`pw_abuse.py`** — rewritten; garbage-seed, import-reject, toast, wipe and Enter-submit checks all poll. 29/29 (one check re-counted as its own line: `controlsOK starts the run`).
- **`pw_recon.py`** — left as-is: it is the throwaway-by-design DOM discovery probe, not an assertion suite.
- `index.html` untouched this pass → no sw.js re-stamp needed.

## Stability proof (skill rule: run critical suites repeatedly)

3 consecutive runs of each suite, all green, zero console/page errors every run:

| suite | run 1 | run 2 | run 3 |
|---|---|---|---|
| `pw_walk.py` | 23/23 | 23/23 | 23/23 |
| `pw_vol_probe.py` | 21/21 | 21/21 | 21/21 |
| `pw_abuse.py` | 29/29 | 29/29 | 29/29 |

Cross-check: `node tools/verify.mjs` → VERIFY OK (selftest banner green, ≥ 100). Git state: only session artifacts (`docs/`, `tools/pw_*.py`, `sw.js` stamp, index.html session changes); `git ls-files -v index.html` = `H`.

## Honest scope notes

- Polls have deadlines (2–8 s), so a genuine regression now fails *fast and named* instead of passing vacuously after a lucky sleep — the walk's pause check previously could pass on a stale overlay read.
- One residual `wait_for_timeout` remains in `pw_abuse.py` §6 (keyboard ring): the ring's focus motion has no page-observable state to poll (focus is a DOM side effect of `paintNav`), so two short beat waits bracket the two ArrowDowns. Documented, not hidden.
- Not done, deliberately: screenshots/trace-on-failure artifacts, parallel workers, CI wiring — nothing here needs them yet; adding them would be scaffolding without an observed failure.
