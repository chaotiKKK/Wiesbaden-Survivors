"""Critical-loop acceptance walk over the served copy (Playwright, headless Chromium).

Server via tools/pw_lib.py (the with_server.py helper leaked orphaned server
processes on this box). All state transitions poll real conditions with a
deadline (wait_until) instead of fixed sleeps — the skill's first anti-flakiness
rule; screenshots happen only after the condition holds, so artifacts match
assertions.

Checks (each prints PASS/FAIL, exit 1 on any FAIL):
  1. cold load: zero console/page errors, title visible,
     gesture gate: AudioSys.started stays false and the page initiates no
     audio/*.m4a fetch before any user gesture (SW precache is excluded by
     scoping the request listener to the page context)
  2. reload in same context: SW controls the page, still zero errors
  3. critical loop: play -> char select -> charConfirm -> first-run controls
     screen -> controlsOK -> Game.state == 'play' -> bounded Game.update(1/60)
     batches -> pause (Esc/P) -> resume -> re-pause -> quit -> summary -> title
  4. surface contracts: code screen (#scCode/#codePanel/#codeBox) and codex
     (#scCodex, #codexList role=list + listitem rows) open+close from title
"""

import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])  # project root/tools
from pw_lib import Serve, SCREEN_JS, GAME_STATE_JS, wait_until, new_page  # noqa: E402

PORT = 8931
URL = "http://127.0.0.1:%d/index.html?pw=1" % PORT

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS" if ok else "FAIL"), "|", name, ("— " + detail if detail else ""))


def visible(page, sel):
    loc = page.locator(sel)
    return loc.count() > 0 and loc.first.is_visible()


def open_pause(page):
    """Esc, then P fallback; poll for the pause screen instead of sleeping."""
    for key in ("Escape", "p"):
        page.keyboard.press(key)
        ok, _ = wait_until(page, SCREEN_JS, lambda v: v == "scPause", name="scPause", timeout_s=2.0)
        if ok:
            return True
    return False


def to_title_and_open(page, act, screen_js=SCREEN_JS, want=None, timeout_s=4.0):
    """Click a data-act and poll until the wanted screen shows."""
    page.click('[data-act="%s"]' % act)
    return wait_until(page, screen_js, lambda v: v == want, name=want or act, timeout_s=timeout_s)


def run_checks():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        errors, audio_reqs = [], []
        page = new_page(browser, URL, console_errors=errors, audio_reqs=audio_reqs)
        page.wait_for_timeout(400)

        # -- 1. cold load ----------------------------------------------------
        check("cold load: title screen visible", visible(page, "#scTitle"))
        check("cold load: zero console/page errors", len(errors) == 0, "; ".join(errors[:3]))
        ok, astate = wait_until(
            page,
            "(typeof AudioSys !== 'undefined') ? !!AudioSys.started : 'n/a'",
            lambda v: v is False, name="AudioSys.started==false", timeout_s=1.5,
        )
        check("gesture gate: AudioSys.started false before first gesture", ok, "AudioSys.started=%s" % astate)
        check("gesture gate: no page-initiated audio/*.m4a fetch pre-gesture", len(audio_reqs) == 0,
              "fetched: %s" % audio_reqs[:3])
        page.screenshot(path="docs/pw/walk-1-title.png")

        # -- 2. reload in same context (SW register -> controller) ------------
        page.reload(wait_until="load")
        page.wait_for_load_state("networkidle")
        ok, swc = wait_until(
            page,
            "!!(navigator.serviceWorker && navigator.serviceWorker.controller)",
            lambda v: v is True, name="SW controller", timeout_s=4.0,
        )
        check("reload: service worker controls page", ok, "sw=%s" % swc)
        check("reload: still zero console/page errors", len(errors) == 0, "; ".join(errors[:3]))

        # -- 3. critical loop --------------------------------------------------
        ok, _ = to_title_and_open(page, "play", want="scChar")
        check("play -> character select visible", ok)
        page.screenshot(path="docs/pw/walk-2-char.png")

        page.click('[data-act="charConfirm"]')
        ok, scr = wait_until(page, SCREEN_JS, lambda v: v == "scControls", name="scControls")
        check("charConfirm -> first-run controls screen", ok, "screen=%s" % scr)

        page.click('[data-act="controlsOK"]')
        ok, st = wait_until(page, GAME_STATE_JS, lambda v: v == "play", name="state=play")
        check("controlsOK -> run starts", ok and st == "play", "Game.state=%s" % st)

        stepped = page.evaluate(
            "() => { let n = 0; try { while (n < 300) { Game.update(1/60); n++; } }"
            " catch (e) { return { n, err: String(e) }; } return { n, err: null, state: Game.state }; }"
        )
        check("300x Game.update(1/60) without exception",
              stepped.get("err") is None and stepped.get("n") == 300, str(stepped)[:140])
        page.screenshot(path="docs/pw/walk-4-game.png")

        check("pause overlay opens (Esc or P)", open_pause(page))
        page.click('[data-act="resume"]')
        ok, st = wait_until(page, GAME_STATE_JS, lambda v: v == "play" , name="resume->play")
        check("resume closes pause overlay", ok and st == "play", "Game.state=%s" % st)

        check("re-pause works (Esc or P)", open_pause(page))
        page.click('[data-act="quit"]')  # native confirm() stubbed true
        ok, st = wait_until(page, GAME_STATE_JS, lambda v: v == "end", name="state=end")
        # designed flow: 'quit' == endRun(false) -> defeat summary screen, title is next step
        check("quit -> run-abort summary screen (#scEnd, state=end)", ok and visible(page, "#scEnd"), "Game.state=%s" % st)
        page.screenshot(path="docs/pw/walk-5-end.png")

        page.click('[data-act="toTitle"]')
        ok, scr = wait_until(page, SCREEN_JS, lambda v: v == "scTitle", name="back to title")
        check("summary -> Hauptmenü returns to title", ok, "screen=%s" % scr)

        # -- 4. surface contracts from title -----------------------------------
        page.click('[data-act="code"]')
        ok, _ = wait_until(page, SCREEN_JS, lambda v: v == "scCode", name="scCode")
        check("code screen opens (#scCode)", ok)
        check("#codePanel visible inside code screen", visible(page, "#codePanel"))
        check("#codeBox textarea present", page.locator("#codeBox").count() == 1)
        page.screenshot(path="docs/pw/walk-6-code.png")
        page.click('[data-act="codeBack"]')
        ok, _ = wait_until(page, SCREEN_JS, lambda v: v == "scTitle", name="code->title")
        check("code screen closes back to title", ok)

        page.click('[data-act="codex"]')
        ok, _ = wait_until(page, SCREEN_JS, lambda v: v == "scCodex", name="scCodex")
        check("codex opens (#scCodex)", ok)
        ok, codex = wait_until(
            page,
            """() => { const list = document.getElementById('codexList');
               if (!list) return null;
               const rows = list.querySelectorAll('[role="listitem"]');
               return { role: list.getAttribute('role'), rows: rows.length }; }""",
            lambda v: v and v.get("role") == "list" and v.get("rows", 0) > 0, name="codex rows",
        )
        check("codex #codexList role=list with listitem rows", ok, str(codex)[:120])
        page.screenshot(path="docs/pw/walk-7-codex.png")
        page.click('[data-act="codexBack"]')
        ok, _ = wait_until(page, SCREEN_JS, lambda v: v == "scTitle", name="codex->title")
        check("codex closes back to title", ok)

        # -- final ---------------------------------------------------------------
        check("session end: zero console/page errors overall", len(errors) == 0, "; ".join(errors[:3]))
        browser.close()


def main():
    with Serve(PORT) as _:
        run_checks()
    fails = sum(1 for r in results if not r)
    print("\n%d/%d checks passed" % (len(results) - fails, len(results)))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
