# Real-browser playtesting: agent-browser + headless Edge CDP — fast-start handoff

Goal: get a real, rAF-firing browser surface on a served copy of the game in
under a minute, and keep the automation deterministic. Everything here was
verified live on this machine (2026-09-03); `tools/verify.mjs` and
`tools/touch-playtest.mjs` encode the same recipe and are the reference
implementations. The deeper environment notes also live in `AGENTS.md`; this
file is the cheat sheet to read first.

## Why real Edge at all

- The preview bridge never fires `requestAnimationFrame` — engine time is
  frozen there and playtesters must step `Game.update()` batches. Real headless
  Edge fires rAF, so real-time play and input are verifiable.
- `file://` cannot run the service worker or expose `location.search` cleanly;
  serve the workspace over HTTP (127.0.0.1:8080 is the usual served copy;
  `node tools/verify.mjs` self-serves on a random port).

## Fastest path (30–60 s)

```bash
# 1. Serve if nothing is up yet (reuse an existing 8080 if alive):
#    curl -s -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/index.html
#    → 200 means a server is already running; otherwise start one yourself.

# 2. Launch scratch headless Edge (bash; PowerShell gets separate argv below).
PORT=9355
SCRATCH="C:/Users/HP/AppData/Local/Temp/fbplay-$PORT"
powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' -ArgumentList '--headless=new --remote-debugging-port=$PORT --user-data-dir=$SCRATCH --disable-extensions --no-first-run --no-default-browser-check --disable-features=msEdgeFirstRunExperience about:blank'"

# 3. Attach, open a cache-busted page, activate OUR tab, probe.
agent-browser connect $PORT
agent-browser open "http://127.0.0.1:8080/index.html?cb=play$(date +%s)"
agent-browser tab list              # find [tN] whose row contains our URL
agent-browser tab tN                # deterministically activate it
agent-browser eval --json "location.href"          # → {success,data:{result},error}
agent-browser eval --json "document.body.innerText.split(String.fromCharCode(32))[1]||0"   # prints e.g. 122/122; pass==total when all green
```

That is the entire manual loop. For regression instead of manual play:
`node tools/verify.mjs` (~15 s: selftest n/n all-green in real Edge + a second
`?selftest&qa=1` pass proving the positive QA-Nav branch + 10k BalanceSim sync/
chunked + a throttled 4x/6x leg — all over ONE raw-CDP WebSocket bound to the
page target; the gate no longer uses agent-browser at all. Non-zero exit on
failure). For mobile/touch: `node tools/touch-playtest.mjs
http://127.0.0.1:8080/index.html` (390×844 + touch emulation via raw CDP —
15/15 PASS as of 2026-09-03).

## Non-interactive details that must be exact

- **agent-browser eval result shape**: `JSON.parse(stdout)` → `{success:true,
  data:{result:<value>}, error}`. Wrap complex scripts in an IIFE and
  `JSON.stringify` the payload; object literals, backticks and `\n` regexes in
  the script text upset the CLI parser.
- **Node cannot run the `agent-browser` shim** (extension-less npm shim; spawn
  fails via CreateProcess). Resolve the real exe first:
  `%APPDATA%\npm\node_modules\agent-browser\bin\agent-browser-win32-*.exe`
  (the gate itself no longer uses agent-browser — it speaks raw CDP directly;
  resolve the exe only for manual probes like the ones above).
- **Cold daemon hangs under Node with piped stdio** (>2 min verified). Pre-warm
  detached with ignored stdio, then calls are ~20 ms:
  `spawn(AB_BIN, ['--version'], {detached:true, stdio:'ignore'}).unref()`.
- **Never `spawnSync` agent-browser while an in-process static server shares the
  Node process** — spawnSync blocks the event loop and the page load of your own
  server deadlocks. Use async spawn for every agent-browser call.
- **PowerShell**: pass `-NoProfile`, `-Command`, script as *separate argv*
  entries and keep the script single-quote-only (double quotes get re-parsed
  and silently no-op the launch). `Start-Process` is the only reliable way to
  get a detached background Edge here.

## Pitfalls: symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| Evals answer from the wrong page / look like “feature missing” | Fresh Edge profile drifts the active tab to `edge://sync-confirmation-dialog/` | Launch with `--disable-features=msEdgeFirstRunExperience`; before trusting any eval, check `location.href`; then `tab list` + `tab tN` to activate your page |
| Page shows stale code after an edit | Preview/daemon serves or caches an old copy | Navigate with `?cb=<N>` and verify an edit marker string is present in the live DOM before trusting reads |
| Launch looks successful but nothing listens on the port | Edge never started (arg quoting mangled by PowerShell) | Reproduce with the exact generated command; keep single quotes only, `-NoProfile -Command` as separate args |
| Second run can’t delete/relaunch Edge profile | A stale Edge instance locks the profile dir | Kill only msedge processes whose command line contains that profile path, wait ~1 s, then delete the dir (see `killEdgeByProfile()` in verify.mjs) |
| Automation hangs on a dialog | Native `confirm()` blocks headless | Stub `window.confirm = () => true` before driving flows |
| `agent-browser connect/open` returns empty streams + exit ≠ 0 | Daemon session state or not pre-warmed | `close --all` not needed if warm; one retry after 1–1.5 s usually clears first-call flake |
| Game seems broken (no movement, inputs dead) in a fresh session | Full-screen overlay (studio splash `#intro`, z-200) intercepts the first pointer gesture — by design | Dismiss it with a real tap first (it is the audio-unlock gesture); any touch probe must do this before measuring |
| Probe dies mid-run with `ReferenceError: Game is not defined` | A page global (`Game`/`UI`/`Save`/`Input`) referenced in **Node code outside** an eval template (e.g. inside a `note()`/`res()` detail string) | Page globals only exist inside `ev(…)/cdp(…)` strings; read everything else through eval results. The error message is identical to a page-context failure — check the Node stack (`at main …:col`) before suspecting the browser |

## Handy CDP extras (Node ≥ 21 has global WebSocket; no deps)

For device/touch work the CLI alone is not enough (`device <name>` is viewport
only; `tap` is iOS-only). Open `http://127.0.0.1:<port>/json/list`, take the
page target's `webSocketDebuggerUrl`, and send raw commands — see
`tools/touch-playtest.mjs`:

- `Emulation.setDeviceMetricsOverride {width:390, height:844, deviceScaleFactor:2, mobile:true}`
- `Emulation.setTouchEmulationEnabled {enabled:true, maxTouchPoints:5}`
- `Input.dispatchTouchEvent` for `touchStart/touchMove/touchEnd` (CSS-pixel coords)
- `Runtime.evaluate` with `returnByValue:true` for probes

## Session artifacts that already implement this

- `tools/verify.mjs` — full regression gate: flag tripwire + selftest + second `?selftest&qa=1` QA-Nav positive pass + BalanceSim sync/chunked in Edge (~7 s)
- `tools/touch-playtest.mjs` — mobile-emulation twin-stick probe (15 checks); `diag` arg prints the event-target capture log
- `AGENTS.md` → “Tooling / environment” holds the permanent environment notes this cheat sheet condenses
