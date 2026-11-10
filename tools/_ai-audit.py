"""KI-Audit: haengende und oszillierende Gegner in einer dichten Welle-20.

Instrumentiert `Enemy.prototype.update` (jeder Simulationsschritt) und misst je
Gegner:

- `stuck`   : Sekunden ohne Bewegung (< 1,2 px/s) bei lebendem Ziel > 45 px,
              ohne legitime Sperren (Stun, Freeze, Spawn, Latch, Telegrafie);
- `maxRun`  : laengste zusammenhaengende Phase davon, mit Ort und Distanz;
- `rev`     : echte Richtungsumkehr (Dot < 0, beide Schritte > 25 px/s);
- `turn`    : Sprünge der Bewegungsrichtung > 0,35 rad bei > 40 px/s (Zittern
              an Distanzschwellen, ohne dass sich der Zustand aendert);
- `jitT`    : Sekunden in 1-s-Fenstern mit viel Weg und kaum Netto-Strecke;
- `ch/flips`: Wechsel von `eState`/`state`, davon Rueckfaelle in < 0,4 s;
- `stTime`  : Zeitanteil der Eliten-Zustaende approach/circle/lunge/retreat.

Ablauf: 8 s Stillstand (Gedraenge) + 4x2,5 s Bewegung. Sechs Elite-Walker
werden zusätzlich gesetzt, weil Welle 20 im Lauf keine Eliten liefert und die
`eliteAI`-Zustandsmaschine sonst nie ausgefuehrt wird.

Run:  eval "$(bash tools/setup-browser.sh --env)"
      "$HOME/pwenv/bin/python" tools/_ai-audit.py
"""
import json
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

PORT = 8980
BASE = "http://127.0.0.1:%d/index.html?qa=1&pw=ai" % PORT

INSTALL = """() => {
  const E = Enemy.prototype;
  if (E.__audit) return 'already';
  E.__audit = true;
  window.__audit = { list: [], peak: 0, frames: 0, elites: 0 };
  const origSpawn = E.spawn;
  E.spawn = function () { this.__as = null; return origSpawn.apply(this, arguments); };
  const orig = E.update;
  E.update = function (dt) {
    if (this.dead) { this.__as = null; return orig.call(this, dt); }
    let s = this.__as;
    if (!s) {
      s = this.__as = {
        t: 0, stuck: 0, run: 0, maxRun: 0, ch: 0, flips: 0, lastChange: -9,
        cur: '', pairs: {}, packFlips: 0, rev: 0, turn: 0, turnScore: 0, turnMax: 0,
        jit: 0, jitT: 0, jitRatio: 0, wPath: 0, wT: 0,
        stTime: { approach: 0, circle: 0, lunge: 0, retreat: 0 },
        type: this.boss ? 'boss:' + this.boss.name : ((this.def && (this.def.id || this.def.name)) || '?'),
        elite: !!this.elite, wx: 0, wy: 0, lastD: 0, at: null
      };
      if (this.elite) window.__audit.elites++;
      window.__audit.list.push(this);
    }
    if (!(dt > 0)) return orig.call(this, dt);
    const x0 = this.x, y0 = this.y, pack0 = this.packing;
    const pxv = s.pdx, pyv = s.pdy, pspeed = s.pspeed;
    orig.call(this, dt);
    s.t += dt;
    if (++window.__audit.frames % 20 === 0) {
      let n = 0;
      for (const e of Game.enemies) if (!e.dead) n++;
      if (n > window.__audit.peak) window.__audit.peak = n;
    }
    const dx = this.x - x0, dy = this.y - y0;
    const moved = Math.hypot(dx, dy), speed = moved / dt;
    const d = this.target ? Math.hypot(this.target.x - this.x, this.target.y - this.y) : 1e4;
    s.lastD = d;
    const locked = this.stun > 0 || this.freezeT > 0 || this.spawnScale < .5 ||
                   this.state === 'latch' || this.state === 'charge' ||
                   this.state === 'slam' || this.state === 'aim' ||
                   this.railT > 0 || this.introHold > 0;
    const step = Math.max(.6, 1.2 * dt);
    if (!locked && d > 45 && moved < step) {
      s.run += dt; s.stuck += dt;
      if (s.run > s.maxRun) { s.maxRun = s.run; s.wx = this.x; s.wy = this.y; s.at = d; }
    } else if (moved >= step || locked) s.run = 0;
    if (this.elite && s.stTime[this.eState] !== undefined) s.stTime[this.eState] += dt;
    /* Richtungsumkehr und Zittern an Schwellen */
    if (pxv !== undefined && moved > .2) {
      if (pspeed > 25 && speed > 25 && (dx * pxv + dy * pyv) < 0) s.rev++;
      const jump = Math.abs(Math.atan2(dy, dx) - Math.atan2(pyv, pxv));
      const jd = jump > Math.PI ? Math.abs(jump - 2 * Math.PI) : jump;
      if (pspeed > 40 && speed > 40 && jd > .35) {
        s.turn++;
        s.turnScore = s.turnScore * Math.exp(-dt * 3) + 1;
        if (s.turnScore > s.turnMax) { s.turnMax = s.turnScore; s.tx = this.x; s.ty = this.y; s.td = d; s.tc = s.cur; }
      }
      s.turnScore *= Math.exp(-dt * 3);
    }
    if (moved > .2) { s.pdx = dx; s.pdy = dy; s.pspeed = speed; }
    s.wPath += moved; s.wT += dt;
    if (s.wT >= 1) {
      const net = Math.hypot(this.x - (s.wx0 === undefined ? this.x : s.wx0),
                             this.y - (s.wy0 === undefined ? this.y : s.wy0));
      if (s.wPath > 50 && net < 15) {
        s.jit++; s.jitT += s.wT;
        const r = s.wPath / Math.max(1, net);
        if (r > s.jitRatio) { s.jitRatio = r; s.jx = this.x; s.jy = this.y; s.jd = d; }
      }
      s.wPath = 0; s.wT = 0; s.wx0 = this.x; s.wy0 = this.y;
    }
    if (s.wx0 === undefined) { s.wx0 = this.x; s.wy0 = this.y; }
    if (this.packing !== pack0) s.packFlips++;
    const cur = (this.eState || '') + '/' + (this.state || '');
    if (cur !== s.cur) {
      if (s.cur) {
        s.ch++;
        const key = s.cur + '>' + cur;
        s.pairs[key] = (s.pairs[key] || 0) + 1;
        if (s.t - s.lastChange < .4) s.flips++;
      }
      s.lastChange = s.t; s.cur = cur;
    }
  };
  return 'installed';
}"""

SPAWN_ELITES = """() => {
  const pl = Game.players[0];
  let n = 0;
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    const e = Game.spawnEnemyAt(ENEMY_BY_ID['walker'],
      pl.x + Math.cos(a) * 330, pl.y + Math.sin(a) * 330);
    if (e) { e.makeElite(); n++; }
  }
  return n;
}"""

REPORT = """() => {
  const A = window.__audit;
  const out = { peak: A.peak, frames: A.frames, elites: A.elites, enemies: 0,
                arena: { w: Game.level.w, h: Game.level.h },
                player: { x: Math.round(Game.players[0].x), y: Math.round(Game.players[0].y) },
                alive: Game.enemies.filter(e => !e.dead).length,
                stuck: [], turn: [], rev: [], jit: [], byType: {}, packFlips: 0 };
  for (const e of A.list) {
    const s = e.__as;
    if (!s || s.t < 2) continue;
    out.enemies++;
    const key = s.type + (s.elite ? ' (Elite)' : '');
    const b = out.byType[key] || (out.byType[key] = { n: 0, t: 0, stuck: 0, maxRun: 0, rev: 0, turn: 0, jitT: 0, ch: 0, flips: 0, stTime: { approach: 0, circle: 0, lunge: 0, retreat: 0 } });
    b.n++; b.t += s.t; b.stuck += s.stuck; b.rev += s.rev; b.turn += s.turn;
    b.jitT += s.jitT; b.ch += s.ch; b.flips += s.flips;
    if (s.maxRun > b.maxRun) b.maxRun = s.maxRun;
    for (const k in s.stTime) b.stTime[k] += s.stTime[k];
    out.packFlips += s.packFlips;
    const pair = Object.keys(s.pairs).sort((x, y) => s.pairs[y] - s.pairs[x])[0] || '';
    if (s.maxRun >= .8) out.stuck.push({ type: key, run: +s.maxRun.toFixed(2), stuck: +s.stuck.toFixed(2),
      t: +s.t.toFixed(1), d: Math.round(s.at || 0), wx: Math.round(s.wx), wy: Math.round(s.wy), pair });
    if (s.turnMax >= 2.5) out.turn.push({ type: key, max: +s.turnMax.toFixed(1), n: s.turn,
      t: +s.t.toFixed(1), d: Math.round(s.td || 0), wx: Math.round(s.tx), wy: Math.round(s.ty), cur: s.tc });
    if (s.rev / s.t >= .8) out.rev.push({ type: key, rev: s.rev, rate: +(s.rev / s.t).toFixed(2), t: +s.t.toFixed(1) });
    if (s.jitT >= 1) out.jit.push({ type: key, secs: +s.jitT.toFixed(1), n: s.jit,
      ratio: +s.jitRatio.toFixed(1), d: Math.round(s.jd || 0), wx: Math.round(s.jx), wy: Math.round(s.jy) });
    if (s.flips >= 2) out.stuck.push({ type: key + ' [FLIPS]', run: s.flips, stuck: 0, t: +s.t.toFixed(1), d: 0, wx: 0, wy: 0, pair });
  }
  out.stuck.sort((a, b) => b.run - a.run);
  out.turn.sort((a, b) => b.max - a.max);
  out.rev.sort((a, b) => b.rate - a.rate);
  out.jit.sort((a, b) => b.secs - a.secs);
  out.byTypeList = Object.keys(out.byType).map(k => {
    const b = out.byType[k];
    return { type: k, n: b.n, seconds: +b.t.toFixed(1), stuck_s: +b.stuck.toFixed(1),
             worst_run: +b.maxRun.toFixed(2), rev: b.rev, turn: b.turn,
             jit_s: +b.jitT.toFixed(1), ch: b.ch, flips: b.flips,
             st: Object.keys(b.stTime).map(x => x + ' ' + Math.round(b.stTime[x])).join(' / ') };
  }).sort((a, b) => b.stuck_s - a.stuck_s);
  return out;
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
                Game.qaGod = true;
                if (Game.qaGo) Game.qaGo(20); else Game.startWave(20);
            }""")
            page.wait_for_timeout(1200)
            print("install:", page.evaluate(INSTALL))
            print("elites:", page.evaluate(SPAWN_ELITES))

            page.wait_for_timeout(8000)
            for key in ("KeyW", "KeyS", "KeyA", "KeyD"):
                page.keyboard.down(key)
                page.wait_for_timeout(2500)
                page.keyboard.up(key)
                page.wait_for_timeout(150)

            data = page.evaluate(REPORT)
            data["console_errors"] = errs
            data["wave"] = page.evaluate("() => ({ wave: Game.wave, danger: Game.danger, fps: Math.round(Game.fps) })")
            json.dump(data, open("docs/pw/ai-audit.json", "w"), indent=2)

            print("wave:", data["wave"], "peak:", data["peak"], "frames:", data["frames"],
                  "alive:", data["alive"], "arena:", data["arena"], "player:", data["player"])
            print("erfasst: %d Gegner / %d Eliten, %d Gegnersekunden, %d Rudelwechsel"
                  % (data["enemies"], data["elites"],
                     sum(t["seconds"] for t in data["byTypeList"]), data["packFlips"]))
            print("--- Typen ---")
            for t in data["byTypeList"]:
                print("%-26s n=%2d %6.1fs stuck %5.1fs worst %4.2fs rev %3d turn %3d jit %5.1fs ch %3d flips %2d | %s"
                      % (t["type"], t["n"], t["seconds"], t["stuck_s"], t["worst_run"],
                         t["rev"], t["turn"], t["jit_s"], t["ch"], t["flips"], t["st"]))
            print("--- Haengephasen ---")
            for s in data["stuck"][:10]:
                print("%-26s %5.2fs (sum %4.1fs) d=%4d (%d,%d) %s"
                      % (s["type"], s["run"], s["stuck"], s["d"], s["wx"], s["wy"], s["pair"]))
            print("--- Richtungszittern (turnMax) ---")
            for t in data["turn"][:10]:
                print("%-26s turnMax %4.1f n=%3d in %4.1fs d=%4d (%d,%d) %s"
                      % (t["type"], t["max"], t["n"], t["t"], t["d"], t["wx"], t["wy"], t["cur"]))
            print("--- Umkehrrate ---")
            for r in data["rev"][:8]:
                print("%-26s rev %3d = %.2f/s (%ss)" % (r["type"], r["rev"], r["rate"], r["t"]))
            print("--- Zittern auf der Stelle ---")
            for j in data["jit"][:8]:
                print("%-26s %5.1fs n=%2d ratio %5.1f d=%4d (%d,%d)"
                      % (j["type"], j["secs"], j["n"], j["ratio"], j["d"], j["wx"], j["wy"]))
            print("console errors:", errs)
            browser.close()

    return 0 if data["enemies"] >= 20 and not errs else 1


if __name__ == "__main__":
    sys.exit(main())
