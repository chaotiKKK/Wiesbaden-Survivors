"""Schwellen-Zittern isoliert: je ein Siren/Summoner/Bomber in seinem Band.

Die drei Typen halten ihr Distanzband per Hysterese (Sirene 246-274,
Summoner 286-314, Bomber 196-224). Der Rig setzt je einen Vertreter in die
Bandmitte (260 / 300 / 210), haelt den Spieler still und protokolliert jede
Richtungsumkehr zusammen mit der Distanz in diesem Bild. Ausgewertet wird der
Anteil der Umkehrungen, die innerhalb von 6 px um die Bandmitte liegen: mit
Hysterese muss er gegen null gehen, weil die Richtung dort gehalten wird.

Run:  eval "$(bash tools/setup-browser.sh --env)"
      "$HOME/pwenv/bin/python" tools/_ai-threshold.py
"""
import json
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

PORT = 8981
BASE = "http://127.0.0.1:%d/index.html?qa=1&pw=thr" % PORT

SETUP = """() => {
  Game.qaGod = true;
  const pl = Game.players[0];
  const mk = (id, a, dist, thr) => {
    const e = Game.spawnEnemyAt(ENEMY_BY_ID[id], pl.x + Math.cos(a) * dist, pl.y + Math.sin(a) * dist);
    if (!e) return null;
    e.hp = e.maxHp = 1e9;
    e.__probe = { thr: thr, revs: [] };
    return id;
  };
  const made = [mk('siren', 0, 260, 260), mk('summoner', 2.1, 300, 300), mk('bomber', 4.2, 210, 210)];
  for (const e of Game.enemies) if (!e.__probe && !e.dead) { e.hp = 0; e.dead = true; }
  setInterval(() => { for (const e of Game.enemies) if (!e.__probe && !e.dead) { e.hp = 0; e.dead = true; } }, 150);
  const E = Enemy.prototype;
  const orig = E.update;
  E.update = function (dt) {
    if (!this.__probe || this.dead) return orig.call(this, dt);
    const p = this.__probe;
    const px = this.pdx, py = this.pdy, ps = this.pspeed;
    const x0 = this.x, y0 = this.y;
    orig.call(this, dt);
    if (!(dt > 0)) return;
    const dx = this.x - x0, dy = this.y - y0, moved = Math.hypot(dx, dy);
    const speed = moved / dt;
    const d = this.target ? Math.hypot(this.target.x - this.x, this.target.y - this.y) : 1e4;
    if (px !== undefined && ps > 25 && speed > 25 && (dx * px + dy * py) < 0)
      p.revs.push({ d: +d.toFixed(1), t: +Game.time.toFixed(2) });
    if (moved > .2) { this.pdx = dx; this.pdy = dy; this.pspeed = speed; }
  };
  return made.filter(Boolean).length;
}"""

REPORT = """() => {
  const out = [];
  for (const e of Game.enemies) {
    if (!e.__probe) continue;
    const p = e.__probe, ds = p.revs.map(r => r.d);
    const near = ds.filter(x => Math.abs(x - p.thr) <= 6).length;
    out.push({ type: e.def.id, thr: p.thr, n: p.revs.length, near: near,
      share: ds.length ? +(near / ds.length).toFixed(2) : 0,
      min: ds.length ? Math.min.apply(null, ds) : null,
      max: ds.length ? Math.max.apply(null, ds) : null,
      dNow: Math.round(Math.hypot(e.target.x - e.x, e.target.y - e.y)),
      sample: p.revs.slice(0, 6) });
  }
  return { time: +Game.time.toFixed(1), probes: out, errors: Game.enemies.filter(e => !e.__probe && !e.dead).length };
}"""


def main():
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
            }""")
            print("probes:", page.evaluate(SETUP))
            page.wait_for_timeout(1000)
            page.wait_for_timeout(6000)
            data = page.evaluate(REPORT)
            data["console_errors"] = errs
            json.dump(data, open("docs/pw/ai-threshold.json", "w"), indent=2)
            print("Laufzeit %.1fs, fremde lebende Gegner: %d" % (data["time"], data["errors"]))
            for pr in data["probes"]:
                print("%-9s Schwelle %3d px: %3d Umkehrungen, davon %3d (%.0f%%) im Band +-6 px; d %s..%s, jetzt %d"
                      % (pr["type"], pr["thr"], pr["n"], pr["near"], pr["share"] * 100,
                         pr["min"], pr["max"], pr["dNow"]))
            print("console errors:", errs)
            browser.close()
    return 0 if not errs else 1


if __name__ == "__main__":
    sys.exit(main())
