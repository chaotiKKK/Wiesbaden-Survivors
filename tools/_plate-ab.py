"""A/B: boss nameplate vs. its own player, quietR off (0) vs on (52).

Pins the player right under the boss plate, then reads the plate geometry the
draw call actually used (`_plateY`) and the alpha it used (`_plateA`), so the
numbers describe the drawn frame, not a re-implementation of the formula.
Negative clearance = plate still overlapping the player's silhouette.

Run:  eval "$(bash tools/setup-browser.sh --env)"
      "$HOME/pwenv/bin/python" tools/_plate-ab.py
"""
import json
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

PORT = 8975
BASE = "http://127.0.0.1:%d/index.html?qa=1&pw=plate" % PORT

SETUP = """() => {
  const G = Game, p = G.players[0];
  G.qaGod = true;
  const b = G.enemies.find(e => e.boss);
  if (!b) return null;
  b.spd = 0; b.dmg = 0; b.contactCd = 999;
  window.__pb = { x: b.x, y: b.y };
  p.x = b.x; p.y = b.y;
  p.vx = p.vy = 0;
  return { boss: b.boss.name, r: Math.round(b.r) };
}"""

PIN = """(mode) => {
  const G = Game, p = G.players[0];
  const b = G.enemies.find(e => e.boss);
  if (!b || !window.__pb) return null;
  b.x = window.__pb.x; b.y = window.__pb.y; b.vx = b.vy = 0;
  const off = mode === 'center' ? 0 : mode === 'top' ? b.r : b.r + 28;
  p.x = b.x; p.y = b.y - off; p.vx = p.vy = 0; p.invuln = 5;
  return true;
}"""

READ = """() => {
  const G = Game, p = G.players[0];
  const b = G.enemies.find(e => e.boss);
  if (!b || b._plateY == null) return null;
  const top = p.y - p.r, bottom = b._plateY + 14;
  return {
    plate_y: +b._plateY.toFixed(1),
    plate_alpha: +b._plateA.toFixed(2),
    player_top: +top.toFixed(1),
    player_r: +p.r.toFixed(1),
    plate_bottom: +bottom.toFixed(1),
    clearance: +(top - bottom).toFixed(1),
    dx: +(p.x - b.x).toFixed(1)
  };
}"""


def main():
    out = {}
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
            page.evaluate("() => { OPT().tutorial = false; AudioSys.init(); }")
            page.click('[data-act="play"]')
            wait_until(page, "() => UI.cur", lambda v: v == "scChar", timeout_s=6)
            page.click('[data-act="charConfirm"]')
            wait_until(page, "() => UI.cur", lambda v: v == "scControls", timeout_s=6)
            page.click('[data-act="controlsOK"]')
            wait_until(page, "() => Game.state", lambda v: v == "play", timeout_s=6)
            page.evaluate("""() => {
                if (document.getElementById('tutHint')) document.getElementById('tutHint').classList.add('hidden');
                Game.hideTutorial && Game.hideTutorial();
                Game.qaGod = true;
                if (Game.qaGo) Game.qaGo(20); else Game.startWave(20);
            }""")
            page.wait_for_timeout(1500)
            setup = page.evaluate(SETUP)
            print("setup:", setup)

            for label, r in (("off", 0), ("on", 52)):
                page.evaluate("(r) => { FX.quietR = r; }", r)
                out[label] = {}
                for mode in ("center", "top", "plate-line"):
                    for _ in range(5):
                        page.evaluate(PIN, mode)
                        page.wait_for_timeout(80)
                    out[label][mode] = page.evaluate(READ)
                    print(label, mode, json.dumps(out[label][mode]))
                page.evaluate(PIN, "plate-line")
                page.wait_for_timeout(120)
                page.screenshot(path="docs/pw/plate-%s.png" % label)

            out["console_errors"] = errs
            browser.close()

    json.dump(out, open("docs/pw/plate-ab.json", "w"), indent=2)
    a, b = out["off"], out["on"]
    ok = setup is not None and all(a.get(k) and b.get(k) for k in ("center", "top", "plate-line"))
    if ok:
        for mode in ("center", "top", "plate-line"):
            print("RESULT %-10s clearance %6s -> %6s px | alpha %s -> %s"
                  % (mode, a[mode]["clearance"], b[mode]["clearance"],
                     a[mode]["plate_alpha"], b[mode]["plate_alpha"]))
    print("console errors:", errs)
    return 0 if ok and b["plate-line"]["clearance"] > 0 and b["top"]["plate_alpha"] < 1 else 1


if __name__ == "__main__":
    sys.exit(main())
