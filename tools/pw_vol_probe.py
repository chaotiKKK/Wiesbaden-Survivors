"""Audio-design pass probe (Playwright, headless Chromium): verifies the
perceptual −4-dB volume ladder end to end on the served copy.

  1. fresh save: volume opts sit on exact rungs, label shows dB
  2. stepping: one click = exactly one rung (±4 dB), left-click = louder
     (matching all other range options); clamp at mute and at 100 %
  3. node gains track the option value (Float32 tolerance)
  4. persistence across reload

All state transitions poll real conditions with a deadline (pw_lib.wait_until)
instead of fixed sleeps; each step check is itself the poll target.
"""

import sys

from playwright.sync_api import sync_playwright

from pw_lib import GAME_STATE_JS, Serve, new_page, wait_until

PORT = 8932
URL = "http://127.0.0.1:%d/index.html?pw=vol" % PORT

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS" if ok else "FAIL"), "|", name, ("— " + detail if detail else ""))


GET_STATE = """() => {
  const o = OPT();
  const db = (v) => (v <= 0 ? null : Math.round(20 * Math.log10(v) * 1000) / 1000);
  return {
    master: o.master, sfx: o.sfx, music: o.music,
    masterDb: db(o.master), sfxDb: db(o.sfx),
    nodeMaster: AudioSys.master ? AudioSys.master.gain.value : null,
    nodeSfx: AudioSys.sfxGain ? AudioSys.sfxGain.gain.value : null,
    audioStarted: !!AudioSys.started,
    stepDef: (UI.optDefs.find(d => d.k === 'master') || {}).step,
    label: (() => { const rows = [...document.querySelectorAll('#optList .opt')];
      const r = rows.find(el => el.querySelector('.lbl') && el.querySelector('.lbl').textContent.includes('Gesamtlautstärke'));
      return r ? r.querySelector('.val').textContent.trim() : null; })(),
  };
}"""

STEP_OPTION = """([name, times, dir]) => {
  const rows = [...document.querySelectorAll('#optList .opt')];
  const row = rows.find(el => el.querySelector('.lbl') && el.querySelector('.lbl').textContent.includes(name));
  if (!row) return 'row-not-found: ' + name;
  for (let i = 0; i < times; i++) {
    if (dir < 0) row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    else row.click();
  }
  return 'ok';
}"""


def approx(a, b, eps=1e-6):
    return abs(a - b) <= eps


def step_and_expect(page, name, times, direction, expect_db, what):
    """Click a row N times in a direction, poll until the value lands on the
    expected rung (expect_db=None means mute/0), return the state or None."""
    r = page.evaluate(STEP_OPTION, [name, times, direction])
    if r != "ok":
        check(what, False, r)
        return None

    def landed(v):
        if v is None or v["master"] is None:
            return False
        if expect_db is None:
            return v["master"] == 0
        return approx(v["master"], 10 ** (expect_db / 20), 1e-9)

    ok, st = wait_until(page, GET_STATE, landed, name=what, timeout_s=4.0)
    check(what, ok, "db=%s" % (st["masterDb"] if st else "n/a"))
    return st if ok else None


def run_checks():
    with Serve(PORT):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            errors = []
            page = new_page(browser, URL, console_errors=errors)

            # -- fresh save: rungs + step def (poll until opts readable) --------
            ok, st = wait_until(
                page, GET_STATE,
                lambda v: v is not None and v["master"] is not None and v["stepDef"] is not None,
                name="options state readable",
            )
            check("fresh save: state readable", ok)
            if not ok:
                browser.close()
                return
            check("fresh save: master on −4 dB rung (exact rung value)",
                  approx(st["master"], 10 ** (-4 / 20), 1e-9), "db=%s" % st["masterDb"])
            check("fresh save: sfx on −4 dB rung", approx(st["sfx"], 10 ** (-4 / 20), 1e-9), "db=%s" % st["sfxDb"])
            check("option def uses rung step", approx(st["stepDef"], 0.04), "step=%s" % st["stepDef"])
            check("audio not started pre-gesture", st["audioStarted"] is False)

            # -- gesture-init audio (title -> char -> controls -> run) ----------
            page.click('[data-act="play"]')
            wait_until(page, "() => document.querySelector('.screen:not(.hidden)')?.id", lambda v: v == "scChar",
                       name="char select")
            page.click('[data-act="charConfirm"]')
            wait_until(page, "() => document.querySelector('.screen:not(.hidden)')?.id", lambda v: v == "scControls",
                       name="controls screen")
            page.click('[data-act="controlsOK"]')
            ok, st2 = wait_until(page, GAME_STATE_JS, lambda v: v == "play", name="run starts")
            check("run started after controls", ok, "state=%s" % st2)
            ok, st = wait_until(page, GET_STATE, lambda v: v is not None and v["audioStarted"] is True,
                                name="audio started")
            check("audio initialized after gesture", ok)
            check("master node gain == option value (exact rung)",
                  ok and approx(st["nodeMaster"], st["master"], 1e-6),
                  "node=%s opt=%s (float32)" % (st["nodeMaster"] if st else "n/a", st["master"] if st else "n/a"))

            # -- open options from the pause overlay ----------------------------
            page.keyboard.press("Escape")
            wait_until(page, "() => document.querySelector('.screen:not(.hidden)')?.id",
                       lambda v: v == "scPause", name="pause overlay")
            page.click('[data-act="pauseOptions"]')
            ok, _ = wait_until(page, "() => document.querySelector('.screen:not(.hidden)')?.id",
                               lambda v: v == "scOptions", name="options screen")
            ok2, st = wait_until(page, GET_STATE, lambda v: v is not None and v["label"] is not None,
                                 name="dB label rendered")
            check("options row shows dB label", ok and ok2 and "dB" in st["label"], "label=%r" % (st["label"] if st else None))

            # -- stepping: left-click = LOUDER, contextmenu = QUIETER -----------
            st = step_and_expect(page, "Gesamtlautstärke", 1, 1, 0, "one click up = exactly +4 dB")
            check("master node gain tracks step up",
                  st is not None and approx(st["nodeMaster"], st["master"], 1e-6))

            step_and_expect(page, "Gesamtlautstärke", 1, -1, -4, "one click down = exactly −4 dB")

            # walk all the way down: sit at MUTE and stay there
            st = step_and_expect(page, "Gesamtlautstärke", 10, -1, None, "bottom of ladder = mute (0)")
            check("master node gain = 0 (silent)", st is not None and approx(st["nodeMaster"], 0, 1e-9))

            # clamp: more down-clicks at mute must hold 0
            page.evaluate(STEP_OPTION, ["Gesamtlautstärke", 3, -1])
            page.wait_for_timeout(0)
            ok, st = wait_until(page, GET_STATE, lambda v: v is not None and v["master"] == 0,
                                name="clamped at mute", timeout_s=2.0)
            check("clamped at mute (no wrap/overshoot)", ok)

            # two clicks up from mute: mute->−40 is step one, so 2 clicks = −36
            st = step_and_expect(page, "Gesamtlautstärke", 2, 1, -36, "two clicks up from mute = −36 dB rung")
            check("master node gain tracks again", st is not None and approx(st["nodeMaster"], st["master"], 1e-6))

            # top clamp: 10 clicks up from −36... wait for 0 dB exactly
            page.evaluate(STEP_OPTION, ["Gesamtlautstärke", 10, 1])
            ok, st = wait_until(page, GET_STATE, lambda v: v is not None and approx(v["master"], 1.0, 1e-9),
                                name="top of ladder", timeout_s=3.0)
            check("top of ladder = 0 dB (100 %), clamped", ok, "db=%s" % (st["masterDb"] if st else "n/a"))

            # artifact while the options screen is open (matches the assertions)
            page.screenshot(path="docs/pw/vol-options.png")

            # -- persistence ------------------------------------------------------
            page.evaluate(STEP_OPTION, ["Gesamtlautstärke", 1, -1])  # -> −4 dB
            before_ok, before = wait_until(page, GET_STATE,
                                           lambda v: v is not None and approx(v["master"], 10 ** (-4 / 20), 1e-9),
                                           name="stepped back to −4 dB")
            check("stepped back to −4 dB before reload", before_ok)
            page.reload(wait_until="load")
            page.wait_for_load_state("networkidle")
            ok, after = wait_until(
                page, GET_STATE,
                lambda v: v is not None and v["master"] is not None
                and before is not None and approx(v["master"], before["master"], 1e-9),
                name="persisted master after reload", timeout_s=8.0,
            )
            check("persisted across reload (master)", ok,
                  "before=%s after=%s" % (before["master"] if before else "n/a", after["master"] if after else "n/a"))
            check("no console/page errors during probe", len(errors) == 0, "; ".join(errors[:3]))

            browser.close()


def main():
    with Serve(PORT):
        run_checks()
    fails = sum(1 for r in results if not r)
    print("\n%d/%d checks passed" % (len(results) - fails, len(results)))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
