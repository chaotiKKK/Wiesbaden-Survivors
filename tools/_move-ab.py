"""Movement ramp/stop on real keys, dry asphalt vs. rain (wave-20 weather).

The main harness measures its movement leg before jumping to wave 20, i.e. on
dry ground. Wave 20 rolls weather mods, and rain uses a longer time constant,
so this probe measures both paths in one run: real KeyD down/up through the
game's Input layer, per-frame |v| sampling.

Run:  eval "$(bash tools/setup-browser.sh --env)"
      "$HOME/pwenv/bin/python" tools/_move-ab.py
"""
import json
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

PORT = 8976
BASE = "http://127.0.0.1:%d/index.html?qa=1&pw=move" % PORT

MODE = """(regen) => {
  const G = Game;
  if (!window.__modIs) window.__modIs = G.modIs.bind(G);
  G.modIs = (m) => (m === 'regen' ? regen : window.__modIs(m));
  return G.modIs('regen');
}"""

START = """() => {
  const G = Game, p = G.players[0];
  G.enemies.length = 0; G.spawnQueue.length = 0; G.waveTimer = 999;
  p.x = 0; p.y = 0; p.vx = p.vy = 0; p.invuln = 30; G.hitstop = 0; G.timeScale = 1;
  const mv = window.__mv = { fr: [], tDown: 0, tUp: 0, run: true };
  const kd = e => { if (e.code === 'KeyD' && !e.repeat) mv.tDown = performance.now(); };
  const ku = e => { if (e.code === 'KeyD') mv.tUp = performance.now(); };
  addEventListener('keydown', kd, true); addEventListener('keyup', ku, true);
  (function loop() {
    if (!mv.run) { removeEventListener('keydown', kd, true); removeEventListener('keyup', ku, true); return; }
    mv.fr.push([performance.now(), Math.hypot(p.vx, p.vy)]);
    requestAnimationFrame(loop);
  })();
  return { top: +p.speed().toFixed(1) };
}"""

STOP = """() => {
  const mv = window.__mv, top = Game.players[0].speed();
  mv.run = false;
  const hi = top * .95, lo = top * .05;
  const first = mv.fr.find(f => f[1] > top * .02);
  const rampFrame = mv.fr.find(f => f[0] >= mv.tDown && f[1] >= hi);
  const stopFrame = mv.fr.find(f => f[0] >= mv.tUp && f[1] <= lo);
  return {
    latency_ms: first ? +(first[0] - mv.tDown).toFixed(1) : null,
    ramp_ms: rampFrame ? +(rampFrame[0] - mv.tDown).toFixed(1) : null,
    stop_ms: stopFrame ? +(stopFrame[0] - mv.tUp).toFixed(1) : null,
    top_speed: +top.toFixed(1),
    peak_speed: +Math.max.apply(null, mv.fr.map(f => f[1])).toFixed(1),
    frames: mv.fr.length
  };
}"""


def leg(page):
    page.evaluate(START)
    page.keyboard.down("KeyD")
    page.wait_for_timeout(900)
    page.keyboard.up("KeyD")
    page.wait_for_timeout(600)
    return page.evaluate(STOP)


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
            page.wait_for_timeout(1200)
            print("wave:", page.evaluate("() => ({ wave: Game.wave, mods: (Game.mods || []).map(m => m.id || m.name) })"))

            for label, regen in (("trocken", False), ("regen", True)):
                page.evaluate(MODE, regen)
                runs = [leg(page), leg(page)]
                out[label] = runs
                print(label, json.dumps(runs))

            out["console_errors"] = errs
            browser.close()

    json.dump(out, open("docs/pw/move-ab.json", "w"), indent=2)
    for label in ("trocken", "regen"):
        r = [x["ramp_ms"] for x in out[label] if x["ramp_ms"]], [x["stop_ms"] for x in out[label] if x["stop_ms"]]
        print("RESULT %-7s ramp %s ms | stop %s ms" % (label, r[0], r[1]))
    print("console errors:", errs)
    return 0 if all(x["ramp_ms"] and x["stop_ms"] for k in ("trocken", "regen") for x in out[k]) else 1


if __name__ == "__main__":
    sys.exit(main())
