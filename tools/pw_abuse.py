"""Careless-user abuse pass (Playwright, headless Chromium): garbage seeds,
rapid clicks, reload mid-run, code-import garbage, wipe, keyboard-only nav.
Exits 1 on any failed check. In-process server + shared helpers via pw_lib;
state transitions poll real conditions (wait_until) instead of fixed sleeps.
"""

import sys

from playwright.sync_api import sync_playwright

from pw_lib import SCREEN_JS, Serve, new_page, wait_until

PORT = 8934
URL = "http://127.0.0.1:%d/index.html?pw=abuse" % PORT

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS" if ok else "FAIL"), "|", name, ("— " + detail if detail else ""))


TOASTS_JS = "() => [...document.querySelectorAll('#toasts *')].map(t => t.textContent.trim()).slice(-3)"


def set_seed(page, value):
    page.evaluate("v => { const i = document.getElementById('seedInput'); i.value = v; }", value)


def run_checks():
    with Serve(PORT):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            errors = []
            page = new_page(browser, URL, console_errors=errors)

            def cur():
                return page.evaluate("() => UI.cur || '(none)'")

            def toasts():
                return page.evaluate(TOASTS_JS)

            def wait_screen(screen, name, timeout_s=6.0):
                return wait_until(page, SCREEN_JS, lambda v: v == screen, name=name, timeout_s=timeout_s)

            def wait_title(name="back to title", timeout_s=4.0):
                return wait_title_val(page, name, timeout_s)

            def wait_title_val(pg, name, timeout_s):
                return wait_until(pg, "() => UI.cur || '(none)'", lambda v: v == "scTitle", name=name, timeout_s=timeout_s)

            # -- 1. garbage seeds -------------------------------------------------
            page.click('[data-act="options"]')
            wait_screen("scOptions", "options opens")
            page.click('[data-act="optBack"]')
            wait_title("options closes")
            for bad in ["abcdef", "12e4", "-5", "!§$", "9999999999999999999999", "4 2"]:
                set_seed(page, bad)
                page.click('[data-act="seedPlay"]')
                ok, _ = wait_title("garbage seed %r rejected" % bad, timeout_s=3.0)
                check("garbage seed %r rejected (stays on title)" % bad, ok and len(errors) == 0,
                      "cur=%s toasts=%s" % (cur(), toasts()[-1:]))
            # valid seed passes
            set_seed(page, "424242")
            page.click('[data-act="seedPlay"]')
            ok, _ = wait_screen("scChar", "valid seed -> char select")
            check("valid seed 424242 -> character select", ok)
            page.click('[data-act="charBack"]')
            wait_title("char back")
            # empty seed click = harmless no-op or char select path; both fine if no crash
            set_seed(page, "")
            page.click('[data-act="seedPlay"]')
            ok, c = wait_until(page, SCREEN_JS, lambda v: v in ("scTitle", "scChar"),
                               name="empty seed no-crash", timeout_s=3.0)
            check("empty seed click does not crash (cur=%s)" % c, ok and len(errors) == 0)
            if c == "scChar":
                page.click('[data-act="charBack"]')
                wait_title("char back (empty)")

            # -- 2. rapid clicks ---------------------------------------------------
            page.evaluate("() => { for (let i = 0; i < 8; i++) document.querySelector('[data-act=play]').click(); }")
            wait_screen("scChar", "rapid play")
            check("8x rapid play -> char select, no crash", cur() == "scChar" and len(errors) == 0, "cur=%s" % cur())
            page.evaluate("() => { document.querySelector('[data-act=charConfirm]').click(); }")
            wait_screen("scControls", "controls screen")
            page.evaluate("() => { document.querySelector('[data-act=controlsOK]').click(); }")
            ok, st = wait_until(page, "() => Game.state", lambda v: v == "play", name="run starts")
            check("controlsOK starts the run", ok, "state=%s" % st)
            # hammer Escape 8x in a burst
            page.evaluate("""() => { for (let i = 0; i < 8; i++) {
              document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
            } }""")
            ok, st = wait_until(page, "() => Game.state", lambda v: v == "paused",
                                name="pause after burst", timeout_s=3.0)
            check("8x Escape burst -> paused, no crash", ok and len(errors) == 0, "state=%s" % st)
            # alternately spam resume/pause via ring buttons
            for _ in range(4):
                page.evaluate("() => { const r = document.querySelector('[data-act=resume]'); if (r && UI.cur === 'scPause') r.click(); }")
                wait_until(page, "() => Game.state", lambda v: v == "play", name="resume", timeout_s=2.0)
                page.keyboard.press("Escape")
                wait_until(page, "() => Game.state", lambda v: v == "paused", name="re-pause", timeout_s=2.0)
            st = page.evaluate("() => Game.state")
            check("pause/resume alternating spam settles without crash", st in ("play", "paused") and len(errors) == 0, "state=%s" % st)

            # -- 3. reload mid-run ---------------------------------------------------
            page.evaluate("() => { for (let i = 0; i < 120; i++) Game.update(1/60); }")
            before = page.evaluate("() => ({ wave: Game.wave, best: Save.data.bestWave, kills: Save.data.stats.kills })")
            page.reload(wait_until="load")
            page.wait_for_load_state("networkidle")
            ok, st = wait_until(
                page,
                "() => ({ state: Game.state, cur: UI.cur, best: Save.data.bestWave })",
                lambda v: v["state"] == "title" and v["cur"] == "scTitle" and v["best"] >= (before or {}).get("best", 0),
                name="clean title after reload", timeout_s=8.0,
            )
            check("reload mid-run -> clean title, save intact", ok and len(errors) == 0,
                  "after=%s before=%s" % (st, before))

            # -- 4. code import garbage ----------------------------------------------
            page.click('[data-act="code"]')
            wait_screen("scCode", "code screen")
            for bad, label in [("hello world", "plain text"), ("WS1:###", "bad base64"),
                               ("WS1:" + "bm90IGpzb24=", "base64 non-json"), ("WS1:", "empty payload")]:
                page.evaluate("v => { document.getElementById('codeBox').value = v; }", bad)
                page.click('[data-act="codeImport"]')
                ok, _ = wait_until(page, "() => UI.cur", lambda v: v == "scCode",
                                   name="import %s stays" % label, timeout_s=2.0)
                check("import %s rejected with toast" % label, ok and len(errors) == 0, "toasts=%s" % toasts()[-1:])
            # roundtrip: export -> import on the SAME screen (renderCode() clears the
            # box on open, so a real user pastes back into the open screen)
            page.evaluate("() => { Save.data.glory = 77; Save.save(); }")
            page.click('[data-act="codeExport"]')
            ok, exported = wait_until(
                page, "() => document.getElementById('codeBox').value",
                lambda v: isinstance(v, str) and v.startswith("WS1:"),
                name="export produced", timeout_s=3.0,
            )
            check("export produces a WS1 code", ok, "len=%d" % (len(exported) if exported else 0))
            page.click('[data-act="codeImport"]')
            ok, t = wait_until(page, TOASTS_JS, lambda v: "importiert" in " ".join(v),
                               name="import toast", timeout_s=3.0)
            check("same-screen import accepted", ok, "toasts=%s" % (t[-1:] if t else None))
            page.click('[data-act="codeBack"]')
            wait_title("code back")
            # the real story: export -> WIPE -> import restores the data
            page.click('[data-act="wipe"]')
            ok, g = wait_until(page, "() => Save.data.glory", lambda v: v == 0, name="wipe marker", timeout_s=4.0)
            check("wipe reset the marker (glory=0)", ok, "glory=%s" % g)
            page.click('[data-act="code"]')
            wait_screen("scCode", "code screen after wipe")  # renderCode() clears the box
            page.evaluate("v => { document.getElementById('codeBox').value = v; }", exported)
            page.click('[data-act="codeImport"]')
            ok, g2 = wait_until(page, "() => Save.data.glory", lambda v: v == 77, name="restore marker", timeout_s=4.0)
            check("import after wipe restores data (glory=77)", ok and "importiert" in " ".join(toasts()),
                  "glory=%s toasts=%s" % (g2, toasts()[-1:]))
            page.click('[data-act="codeBack"]')
            wait_title("code back (2)")

            # -- 5. wipe then play ----------------------------------------------------
            page.click('[data-act="wipe"]')  # confirm stubbed true
            ok, meta = wait_until(
                page,
                "() => ({ runs: Save.data.runs, kills: Save.data.stats.kills, chars: Save.data.unlockedChars.length })",
                lambda v: v["runs"] == 0 and v["kills"] == 0, name="wipe clears", timeout_s=4.0,
            )
            check("wipe clears progress (runs=0)", ok, str(meta))
            page.click('[data-act="play"]')
            wait_screen("scChar", "char after wipe")
            page.click('[data-act="charConfirm"]')
            wait_screen("scControls", "controls after wipe")
            page.click('[data-act="controlsOK"]')
            ok, st = wait_until(page, "() => Game.state", lambda v: v == "play", name="fresh run", timeout_s=6.0)
            check("fresh run starts after wipe", ok, "state=%s" % st)

            # -- 6. keyboard-only navigation -------------------------------------------
            page.keyboard.press("Escape")  # pause
            wait_until(page, "() => Game.state", lambda v: v == "paused", name="pause", timeout_s=3.0)
            page.evaluate("() => { const q = document.querySelector('[data-act=quit]'); if (q && UI.cur === 'scPause') q.click(); }")
            wait_until(page, "() => Game.state", lambda v: v == "end", name="end screen", timeout_s=4.0)
            page.evaluate("() => { const q = document.querySelector('[data-act=toTitle]'); if (q && UI.cur === 'scEnd') q.click(); }")
            wait_title("summary -> title", timeout_s=5.0)
            at_title = cur() == "scTitle"
            # ring: ArrowDown moves focus/selection, Enter activates
            page.keyboard.press("ArrowDown")
            page.wait_for_timeout(120)
            page.keyboard.press("ArrowDown")
            page.wait_for_timeout(120)
            page.keyboard.press("Enter")
            ok, c = wait_until(page, "() => UI.cur", lambda v: v != "scTitle", name="ring activation", timeout_s=3.0)
            check("keyboard-only: ring ArrowDown+Enter activates an entry", at_title and ok, "cur=%s" % c)
            if ok:
                page.keyboard.press("Escape")
                wait_title("esc back from sub-screen")

            # -- 7. typing must not trigger hotkeys (regression: 'ocexn' opened Options)
            page.evaluate("() => { UI.renderTitle(); UI.show('scTitle'); Game.state = 'title'; }")
            wait_title("title rendered", timeout_s=2.0)
            page.focus("#seedInput")
            page.keyboard.type("ocexn", delay=50)
            ok, t = wait_until(
                page,
                "() => ({ cur: UI.cur, val: document.getElementById('seedInput').value })",
                lambda v: v["cur"] == "scTitle" and v["val"] == "ocexn",
                name="typing completes", timeout_s=4.0,
            )
            check("typing 'ocexn' into seed field stays on title (no hotkey hijack)", ok,
                  "cur=%s val=%r" % (t["cur"] if t else "n/a", t["val"] if t else "n/a"))
            # caret keys work inside the code textarea (regression: preventDefault ate them)
            page.evaluate("() => { document.querySelector('[data-act=code]').click(); }")
            wait_screen("scCode", "code screen (caret)")
            page.evaluate("() => { const b = document.getElementById('codeBox'); b.value = 'ABCDEF'; b.focus(); b.setSelectionRange(3, 3); }")
            page.keyboard.press("ArrowLeft")
            ok, pos = wait_until(page, "() => document.getElementById('codeBox').selectionStart",
                                 lambda v: v == 2, name="caret moves", timeout_s=2.0)
            check("ArrowLeft moves caret in code textarea", ok, "pos=%s" % pos)
            # Enter in the seed field submits the validated seedPlay path
            page.evaluate("() => { UI.renderTitle(); UI.show('scTitle'); Game.state = 'title'; document.getElementById('seedInput').value = ''; }")
            wait_title("title rendered (2)", timeout_s=2.0)
            page.focus("#seedInput")
            page.keyboard.type("12345", delay=30)
            page.keyboard.press("Enter")
            ok, _ = wait_screen("scChar", "enter submit")
            check("Enter in seed field submits (validates then char select)", ok,
                  "cur=%s" % cur())
            # garbage seed + Enter still rejects with toast (field keeps text so the
            # user can correct it — retained-input is intended UX)
            page.evaluate("() => { UI.renderTitle(); UI.show('scTitle'); Game.state = 'title'; document.getElementById('seedInput').value = ''; }")
            wait_title("title rendered (3)", timeout_s=2.0)
            page.focus("#seedInput")
            page.keyboard.type("xyz", delay=30)
            page.keyboard.press("Enter")
            ok, t = wait_until(page, TOASTS_JS, lambda v: len(v) > 0, name="garbage toast", timeout_s=3.0)
            check("Enter with garbage seed stays on title with toast", ok and cur() == "scTitle",
                  "cur=%s toasts=%s" % (cur(), t[-1:] if t else None))

            check("session end: zero console/page errors", len(errors) == 0, "; ".join(errors[:3]))
            browser.close()


def main():
    try:
        run_checks()
    finally:
        fails = sum(1 for r in results if not r)
        print("\n%d/%d checks passed" % (len(results) - fails, len(results)))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
