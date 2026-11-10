"""Menu-Navigation als Stapel: push/pop, inkl. Optionen ueber der Pause.

Prueft nach jedem Schritt `UI.cur`, den ganzen `UI.stack` und dass genau ein
Bildschirm sichtbar ist. Der Pause-Tastendruck wird wie im Loop ausgeloest
(Input.pressed setzen, handleGlobalInput aufrufen, sofort loeschen), damit kein
zweiter Frame die Pause wieder umschaltet.

Run:  eval "$(bash tools/setup-browser.sh --env)"
      "$HOME/pwenv/bin/python" tools/_screenstack.py
"""
import json
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

PORT = 8979
BASE = "http://127.0.0.1:%d/index.html?qa=1&pw=stack" % PORT

STATE = """() => ({
  cur: UI.cur, depth: UI.stack.length, coop: Game.coop, charSelIdx: Game.charSelIdx,
  stack: UI.stack.slice(), state: Game.state,
  shown: UI.screens.filter(s => !document.getElementById(s).classList.contains('hidden'))
})"""

PRESS_PAUSE = """() => {
  const k = Input.key('pause');
  Input.pressed[k] = true;
  Game.handleGlobalInput();
  Input.pressed[k] = false;
  return { state: Game.state, cur: UI.cur };
}"""


def main():
    results = []

    def check(name, got, cur, stack, coop=None, idx=None):
        ok = (got["cur"] == cur and got["stack"] == stack
              and got["depth"] == len(stack)
              and got["shown"] == ([cur] if cur else []))
        if coop is not None:
            ok = ok and got["coop"] is coop
        if idx is not None:
            ok = ok and got["charSelIdx"] == idx
        results.append(ok)
        print("%s %-34s cur=%-10s depth=%d stack=%s shown=%s"
              % ("OK  " if ok else "FAIL", name, got["cur"], got["depth"], got["stack"], got["shown"]))
        if not ok:
            print("      erwartet cur=%s depth=%d stack=%s coop=%s idx=%s"
                  % (cur, len(stack), stack, coop, idx))

    with Serve(PORT):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=[
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows",
            ])
            errs = []
            page = new_page(browser, BASE, console_errors=errs)
            page.evaluate("() => { localStorage.clear(); }")
            page.reload(wait_until="load")
            page.wait_for_load_state("networkidle")
            page.bring_to_front()
            page.evaluate("() => { OPT().tutorial = false; AudioSys.init(); UI.renderTitle(); UI.show('scTitle'); }")
            page.wait_for_timeout(200)

            check("start", page.evaluate(STATE), "scTitle", ["scTitle"])

            page.click('[data-act="options"]')
            page.wait_for_timeout(120)
            check("Titel -> Optionen", page.evaluate(STATE), "scOptions", ["scTitle", "scOptions"])

            page.click('[data-act="openTune"]')
            page.wait_for_timeout(120)
            check("Optionen -> Tuning", page.evaluate(STATE), "scTune", ["scTitle", "scOptions", "scTune"])

            page.click('[data-act="tuneBack"]')
            page.wait_for_timeout(120)
            check("Tuning -> Optionen (pop)", page.evaluate(STATE), "scOptions", ["scTitle", "scOptions"])

            page.click('[data-act="optBack"]')
            page.wait_for_timeout(120)
            check("Optionen -> Titel (pop)", page.evaluate(STATE), "scTitle", ["scTitle"])

            page.click('[data-act="play"]')
            page.wait_for_timeout(120)
            check("Titel -> Figuren", page.evaluate(STATE), "scChar", ["scTitle", "scChar"])

            page.click('[data-act="openMusic"]')
            page.wait_for_timeout(120)
            check("Figuren -> Musik", page.evaluate(STATE), "scMusic", ["scTitle", "scChar", "scMusic"])

            page.click('[data-act="musicBack"]')
            page.wait_for_timeout(120)
            check("Musik -> Figuren (pop)", page.evaluate(STATE), "scChar", ["scTitle", "scChar"])

            page.click('[data-act="charConfirm"]')
            page.wait_for_timeout(120)
            check("Figuren -> Steuerung", page.evaluate(STATE), "scControls",
                  ["scTitle", "scChar", "scControls"])

            page.click('[data-act="controlsBack"]')
            page.wait_for_timeout(120)
            check("Steuerung -> Figuren (pop)", page.evaluate(STATE), "scChar", ["scTitle", "scChar"])

            page.click('[data-act="charBack"]')
            page.wait_for_timeout(120)
            check("Figuren -> Titel (pop)", page.evaluate(STATE), "scTitle", ["scTitle"])

            # Koop: Spieler 2 -> Spieler 1 -> Titel, Tiefe nach jedem Schritt
            page.click('[data-act="coop"]')
            page.wait_for_timeout(120)
            check("Koop: Titel -> Figuren (P1)", page.evaluate(STATE),
                  "scChar", ["scTitle", "scChar"], coop=True, idx=0)

            page.click('[data-act="charConfirm"]')
            page.wait_for_timeout(120)
            check("Koop: P1 bestaetigt -> P2", page.evaluate(STATE),
                  "scChar", ["scTitle", "scChar"], coop=True, idx=1)

            page.click('[data-act="charBack"]')
            page.wait_for_timeout(120)
            check("Koop: P2 zurueck -> P1", page.evaluate(STATE),
                  "scChar", ["scTitle", "scChar"], coop=True, idx=0)

            page.click('[data-act="charBack"]')
            page.wait_for_timeout(120)
            check("Koop: P1 zurueck -> Titel", page.evaluate(STATE),
                  "scTitle", ["scTitle"], idx=0)

            # Run starten und in Welle 20 gehen
            page.click('[data-act="play"]')
            page.wait_for_timeout(120)
            page.click('[data-act="charConfirm"]')
            page.wait_for_timeout(120)
            page.click('[data-act="controlsOK"]')
            page.wait_for_timeout(400)
            page.evaluate("() => { if (Game.qaGo) Game.qaGo(20); }")
            page.wait_for_timeout(500)
            check("Run gestartet (Wurzel)", page.evaluate(STATE), None, [])

            page.evaluate(PRESS_PAUSE)
            page.wait_for_timeout(120)
            check("Pause per Taste", page.evaluate(STATE), "scPause", ["scPause"])

            page.click('[data-act="pauseOptions"]')
            page.wait_for_timeout(120)
            check("Pause -> Optionen", page.evaluate(STATE), "scOptions", ["scPause", "scOptions"])

            page.click('[data-act="optBack"]')
            page.wait_for_timeout(120)
            check("Optionen -> Pause (pop)", page.evaluate(STATE), "scPause", ["scPause"])

            page.click('[data-act="pauseOptions"]')
            page.wait_for_timeout(120)
            page.evaluate(PRESS_PAUSE)
            page.wait_for_timeout(120)
            check("Esc aus Optionen -> Pause", page.evaluate(STATE), "scPause", ["scPause"])

            page.click('[data-act="resume"]')
            page.wait_for_timeout(150)
            got = page.evaluate(STATE)
            check("Fortsetzen (Wurzel leer)", got, None, [])
            results.append(got["state"] == "play")
            print("     Zustand nach Fortsetzen:", got["state"])

            out = {"results": results, "console_errors": errs}
            json.dump(out, open("docs/pw/screenstack.json", "w"), indent=2)
            print("console errors:", errs)
            browser.close()

    passed = sum(1 for r in results if r)
    print("STACK %d/%d" % (passed, len(results)))
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
