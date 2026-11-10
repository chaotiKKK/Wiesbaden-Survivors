"""Presentation gate in a REAL Chromium (Playwright).

This is the Python/Playwright counterpart of the presentation leg in
tools/verify.mjs. The page-side probes and the thresholds are NOT duplicated
here: both gates read them from tools/lib/presentation.mjs, so the two can never
measure different things (on 2026-10-29 the Python copy drifted and reported a
working vignette as broken because it sampled a dead player).

Measured contracts:
  1. `?selftest` verdict is PASS (read as textContent — innerText returns "" when
     no font stack is present, which looks exactly like "the suite never ran").
  2. Text actually LAYS OUT: `#hudWave` has a non-zero box.
  3. `AudioSys.audioConformance()` lands in the LUFS window with true peak in spec.
  4. Crit vignette tints the BORDER of a LIVE player while the centre stays clean.
  5. Arena fields use the cached soft-edge gradient.
  6. Zero console/page errors.

Run (needs the sysroot from tools/setup-browser.sh):
  eval "$(tools/setup-browser.sh --env)"
  python tools/pw_gate.py
Exit code 1 on any failure.
"""

import json
import re
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

SPEC_PATH = "tools/lib/presentation.mjs"
PORT = 8991
BASE = "http://127.0.0.1:%d/index.html" % PORT


def _raw_block(src, name):
    """Extract `export const NAME = String.raw`...`;` — the documented contract."""
    marker = "export const %s = String.raw`" % name
    i = src.index(marker) + len(marker)
    j = src.index("`;", i)
    return src[i:j]


def _load_spec():
    src = open(SPEC_PATH, encoding="utf-8").read()
    # The module header documents this exact shape in a comment, so the first
    # regex hit is prose. Take the first object that actually parses as JSON.
    thresholds, last_err = None, None
    for m in re.finditer(r"export const THRESHOLDS = (\{[^\n]*\});", src):
        try:
            thresholds = json.loads(m.group(1))
            break
        except json.JSONDecodeError as e:
            last_err = e
    if thresholds is None:
        raise SystemExit("presentation.mjs: no parseable THRESHOLDS object (%s)" % last_err)
    missing = [k for k in ("lufsMin", "lufsMax", "truePeakMaxDb", "hudTextMinHeight",
                           "borderLiftMin", "centreLiftMax", "critVisMin") if k not in thresholds]
    if missing:
        raise SystemExit("presentation.mjs: THRESHOLDS missing %s" % missing)
    return {
        "SELFTEST_JS": _raw_block(src, "SELFTEST_JS"),
        "BAND_JS": _raw_block(src, "BAND_JS"),
        "DISMISS_JS": _raw_block(src, "DISMISS_JS"),
        "THRESHOLDS": thresholds,
    }


SPEC = _load_spec()
T = SPEC["THRESHOLDS"]
SELFTEST_RE = re.compile(r"selftest\s+(\d+)/(\d+)\s*\u00b7\s*(PASS|FAIL)", re.I)

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS" if ok else "FAIL"), "|", name, ("— " + detail if detail else ""))
    return ok


def advance(page, frames, chunk=30):
    done = 0
    while done < frames:
        n = min(chunk, frames - done)
        page.evaluate("(n) => { for (let i = 0; i < n; i++) Game.update(1/60); }", n)
        done += n
        for _ in range(6):
            if not page.evaluate(SPEC["DISMISS_JS"]):
                break
            page.wait_for_timeout(60)


def run_selftest(browser):
    errs = []
    page = new_page(browser, BASE + "?selftest&qa=1", console_errors=errs)
    deadline = time.time() + 90
    txt, m = "", None
    while time.time() < deadline:
        txt = page.evaluate(SPEC["SELFTEST_JS"])
        m = SELFTEST_RE.search(txt or "")
        if m and m.group(3).upper() == "PASS":
            break
        page.wait_for_timeout(250)
    ok = bool(m) and m.group(3).upper() == "PASS" and m.group(1) == m.group(2)
    check("selftest verdict PASS", ok, m.group(0) if m else (txt or "")[-160:].replace("\n", " / "))
    if m:
        check("selftest assertion count >= 100", int(m.group(1)) >= 100, m.group(1))
    check("selftest: zero console errors", len(errs) == 0, "; ".join(errs[:3]))
    page.close()


def run_presentation(browser):
    errs = []
    page = new_page(browser, BASE + "?pw=gate&qa=1", console_errors=errs)

    r = page.evaluate("() => (async () => await AudioSys.audioConformance())()")
    lufs, peak = r.get("masterLufs"), r.get("peakDb")
    check("mix in %s..%s LUFS" % (T["lufsMin"], T["lufsMax"]),
          bool(r.get("inWindow")) and T["lufsMin"] <= (lufs if lufs is not None else -99) <= T["lufsMax"],
          "measured %s LUFS" % lufs)
    check("true peak <= %s dBTP" % T["truePeakMaxDb"],
          peak is not None and peak <= T["truePeakMaxDb"], "measured %s dBFS" % peak)

    page.click('[data-act="play"]')
    wait_until(page, "() => UI.cur", lambda v: v == "scChar")
    page.click('[data-act="charConfirm"]')
    wait_until(page, "() => UI.cur", lambda v: v == "scControls")
    page.click('[data-act="controlsOK"]')
    ok, st = wait_until(page, "() => Game.state", lambda v: v == "play")
    check("run reaches state=play", ok and st == "play", str(st))

    h = page.evaluate("() => document.getElementById('hudWave').getBoundingClientRect().height")
    check("HUD text lays out (font stack present)", h and h > T["hudTextMinHeight"], "#hudWave height=%s" % h)

    page.evaluate("() => { Game.qaGod = true; }")
    advance(page, 400)

    f = page.evaluate("""() => { const fs = Game.level.fields || [];
        return fs.length ? { n: fs.length, cached: fs.every(x => !!x._g) } : { n: 0, cached: null }; }""")
    check("arena fields use cached soft-edge gradient",
          f["n"] == 0 or f["cached"] is True, str(f))

    page.evaluate("""() => { Game.enemies.length = 0; Game.spawnQueue.length = 0;
        const pl = Game.players[0]; pl.hp = pl.maxHp; for (let i = 0; i < 60; i++) Game.update(1/60); }""")
    page.wait_for_timeout(150)
    healthy = page.evaluate(SPEC["BAND_JS"])
    page.evaluate("""() => { const pl = Game.players[0];
        for (let i = 0; i < 90; i++) { pl.hp = pl.maxHp * .07; Game.update(1/60); } }""")
    page.wait_for_timeout(150)
    crit = page.evaluate(SPEC["BAND_JS"])
    st = page.evaluate("() => { const p = Game.players[0]; return { alive: !!p.alive, critVis: +(Game.critVis || 0).toFixed(3) }; }")

    lift = max(crit["edge"]["r"] - healthy["edge"]["r"], crit["right"]["r"] - healthy["right"]["r"])
    mid = abs(crit["centre"]["r"] - healthy["centre"]["r"])
    check("vignette measured on a live player",
          st["alive"] and st["critVis"] >= T["critVisMin"],
          "alive=%s, critVis=%s" % (st["alive"], st["critVis"]))
    check("crit vignette tints the border", lift >= T["borderLiftMin"], "border lift %+.1f red" % lift)
    check("crit vignette leaves the centre readable", mid <= T["centreLiftMax"], "centre lift %+.1f red" % mid)

    check("presentation run: zero console errors", len(errs) == 0, "; ".join(errs[:3]))
    page.close()


def main():
    with Serve(PORT):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=[
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
            ])
            run_selftest(browser)
            run_presentation(browser)
            browser.close()
    bad = results.count(False)
    print("\n%d/%d checks passed" % (len(results) - bad, len(results)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
