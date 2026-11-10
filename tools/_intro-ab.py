"""A/B: boss intro title vs. its own player, quietR off (0) vs on (52).

Places the player at three heights on screen (under the title, clear above,
clear below) by aligning the player's screen y, then reads the geometry the
draw call actually used (`_introGap`, `_introA`, `_introDy`). Negative gap =
the title still covers the player.

The intro timer is held at t = .65 so the fade-in/fade-out do not leak into the
alpha column. The `fade` case calls `Game.introQuiet` with a block taller than
the safe area on purpose: it is the only way a single player can reach the
alpha branch, and it is labelled synthetic because no frame is drawn from it.

Run:  eval "$(bash tools/setup-browser.sh --env)"
      "$HOME/pwenv/bin/python" tools/_intro-ab.py
"""
import json
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

PORT = 8977
BASE = "http://127.0.0.1:%d/index.html?qa=1&pw=intro" % PORT

ARM = """(mode) => {
  const G = Game, p = G.players[0];
  const b = G.enemies.find(e => e.boss);
  if (!b) return null;
  G.qaGod = true;
  b.spd = 0; b.dmg = 0; b.contactCd = 999; b.vx = b.vy = 0;
  G.bossIntroTarget = b; G.bossIntroName = b.boss.name;
  G.bossIntro = G.bossIntroMax * .35;
  window.__iw = mode === 'under' ? .50 : mode === 'above' ? .26 : .80;
  G._iqDy = 0; G._iqT = null;
  p.x = b.x; p.vx = p.vy = 0; p.invuln = 9;
  return { boss: b.boss.name, r: Math.round(b.r), zoom: +G.cam.zoom.toFixed(2) };
}"""

# Aligns the player to a fixed screen height, then reports the last drawn frame.
READ = """() => {
  const G = Game, p = G.players[0];
  const b = G.enemies.find(e => e.boss);
  G.bossIntro = G.bossIntroMax * .35;
  if (b) p.x = b.x;
  for (let i = 0; i < 12; i++) {
    const sy = (p.y - G.cam.y) * G.cam.zoom + G.H / 2 + G.cam.sy;
    const err = G.H * window.__iw - sy;
    if (Math.abs(err) < 1.5) break;
    p.y += err / G.cam.zoom;
  }
  return {
    gap: G._introGap,
    alpha: G._introA == null ? null : +G._introA.toFixed(2),
    dy: +(G._introDy || 0).toFixed(1),
    sy: Math.round((p.y - G.cam.y) * G.cam.zoom + G.H / 2 + G.cam.sy),
    block: G._introBox
  };
}"""

FADE = """() => {
  const G = Game;
  G.bossIntro = G.bossIntroMax * .35;
  G._iqDy = 0; G._iqT = null;
  const box = { top: 0, bot: G.H, halfW: 1e6 };   /* hoeher als der sichere Bereich */
  const q = G.introQuiet(box, G.H * .12);
  return { dy: +q.dy.toFixed(1), dim: +q.dim.toFixed(3), gap: G._introGap };
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
            setup = page.evaluate(ARM, "under")
            print("setup:", setup)

            for label, r in (("off", 0), ("on", 52)):
                page.evaluate("(r) => { FX.quietR = r; }", r)
                out[label] = {}
                for mode in ("under", "above", "below"):
                    page.evaluate(ARM, mode)
                    page.wait_for_timeout(120)
                    for _ in range(10):                 # Eingleiten abwarten
                        page.evaluate(READ)
                        page.wait_for_timeout(60)
                    samples = []
                    for _ in range(5):
                        samples.append(page.evaluate(READ))
                        page.wait_for_timeout(110)
                    last = samples[-1]
                    out[label][mode] = {
                        "gap_settled": last["gap"],
                        "gap_min": min(s["gap"] for s in samples if s["gap"] is not None)
                        if any(s["gap"] is not None for s in samples) else None,
                        "alpha": last["alpha"],
                        "dy": last["dy"],
                        "sy": last["sy"],
                        "want_sy": round(720 * (0.50 if mode == "under" else 0.26 if mode == "above" else 0.80)),
                        "block": last["block"],
                    }
                    print(label, mode, json.dumps(out[label][mode]))
                    if mode == "under":
                        page.evaluate(READ)
                        page.screenshot(path="docs/pw/intro-%s.png" % label)
                out[label]["fade"] = page.evaluate(FADE)
                page.evaluate("(r) => { FX.quietR = r; }", r)
                out[label]["fade"] = page.evaluate(FADE)
                print(label, "fade", json.dumps(out[label]["fade"]))

            out["console_errors"] = errs
            page.evaluate("(r) => { FX.quietR = r; }", 52)
            browser.close()

    json.dump(out, open("docs/pw/intro-ab.json", "w"), indent=2)
    a, b = out["off"], out["on"]
    ok = setup is not None and a["under"]["gap_settled"] is not None and b["under"]["gap_settled"] is not None
    if ok:
        for mode in ("under", "above", "below"):
            print("RESULT %-6s gap %6s -> %6s px | alpha %s -> %s | dy %s -> %s"
                  % (mode, a[mode]["gap_settled"], b[mode]["gap_settled"],
                     a[mode]["alpha"], b[mode]["alpha"], a[mode]["dy"], b[mode]["dy"]))
        print("RESULT fade   synthetic: dim %s -> %s | dy %s -> %s"
              % (a["fade"]["dim"], b["fade"]["dim"], a["fade"]["dy"], b["fade"]["dy"]))
    print("console errors:", errs)
    good = (ok and a["under"]["gap_settled"] < -4 <= b["under"]["gap_settled"]
            and b["above"]["dy"] == 0 and b["below"]["dy"] == 0
            and b["fade"]["dim"] < a["fade"]["dim"])
    return 0 if good else 1


if __name__ == "__main__":
    sys.exit(main())
