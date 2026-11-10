"""Wave-20 playtest on a real headless Chromium: real keys, real mouse, real rAF.

What this measures, and what it cannot:

  movement   key -> velocity latency, ramp to top speed, stop latency, diagonal
             normalisation, dash/roll distance + i-frames
  aiming     auto-aim snap error and re-acquire frames; manual-aim jitter;
             weapon turret slew (deg error per frame, time to < 5 deg)
  feedback   hitstop length/duty, time-scale dip, camera trauma, enemy hit-flash
             frames, sfx calls per name, kills, combo, frame pacing
  frames     docs/pw/playtest-w20-{combat,dash}.png

Caveat, stated up front: input is synthetic CDP input into the game's real
Input layer, and a headless renderer emits frames on its own schedule. This is
the ENGINE's response to input, not a human's perception of it. Frame spacing
(~16.7 ms) bounds latency resolution, so every latency is reported in frames as
well as ms.

Run:  eval "$(bash tools/setup-browser.sh --env)"
      "$HOME/pwenv/bin/python" tools/_playtest-w20.py
"""
import json
import math
import statistics
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

PORT = 8973
BASE = "http://127.0.0.1:%d/index.html?qa=1&pw=w20play" % PORT

INSTALL = r"""() => {
  if (window.__pt) return 'already';
  const s = window.__pt = { run: false, frames: [], keys: [], sfx: {}, fb: {}, err: [] };
  addEventListener('keydown', e => { if (!e.repeat) s.keys.push({ t: performance.now(), c: e.code, d: 1 }); }, true);
  addEventListener('keyup',   e => s.keys.push({ t: performance.now(), c: e.code, d: 0 }), true);
  addEventListener('error', e => s.err.push(String(e.message)));
  const osfx = AudioSys.sfx.bind(AudioSys);
  AudioSys.sfx = function (n) { s.sfx[n] = (s.sfx[n] || 0) + 1; return osfx.apply(null, arguments); };
  const ofb = Game.feedback.bind(Game);
  Game.feedback = function (x, y, st) { s.fb[st] = (s.fb[st] || 0) + 1; return ofb.apply(null, arguments); };
  s.reset = () => { s.frames.length = 0; s.keys.length = 0; s.sfx = {}; s.fb = {}; return true; };
  s.start = () => {
    s.run = true;
    (function loop() {
      if (!s.run) return;
      const p = Game.players && Game.players[0];
      if (p) {
        const w = p.weapons && p.weapons[0];
        s.frames.push({
          t: Math.round(performance.now() * 10) / 10,
          x: +p.x.toFixed(2), y: +p.y.toFixed(2),
          vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2),
          aim: +p.aim.toFixed(4),
          sp: +p.speed().toFixed(1), hp: Math.round(p.hp),
          ne: (() => { let b = null, bd = 1e18;
            for (const e of Game.enemies) { if (e.dead) continue;
              const d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
              if (d < bd) { bd = d; b = e; } }
            return b ? +Math.atan2(b.y - p.y, b.x - p.x).toFixed(4) : null; })(),
          wa: w ? +w.angle.toFixed(4) : null,
          hs: +(Game.hitstop || 0).toFixed(3),
          ts: +(Game.timeScale || 1).toFixed(3),
          tr: +((Game.cam && Game.cam.trauma) || 0).toFixed(3),
          en: Game.enemies.length,
          hf: Game.enemies.reduce((a, e) => a + (e.hitFlash > 0 ? 1 : 0), 0),
          k: Game.run ? Game.run.kills : 0,
          cb: Game.combo || 0,
          inv: +(p.invuln || 0).toFixed(2),
          hfl: +(p.hitFlash || 0).toFixed(2),
          cv: +(Game.critVis || 0).toFixed(3),
          ro: +(p.rollT || 0).toFixed(3), dsh: +(p.dashT || 0).toFixed(3),
          st: Game.state, cur: (window.UI && UI.cur) || ''
        });
      }
      requestAnimationFrame(loop);
    })();
    return 'started';
  };
  s.stop = () => { s.run = false; return { frames: s.frames.length, keys: s.keys.length }; };
  return 'installed';
}"""

DISMISS_JS = """() => {
  const id = document.querySelector('.screen:not(.hidden)')?.id;
  if (id === 'scLevel') { const c = document.querySelector('#lvlCards .lvlCard'); if (c) { c.click(); return 'lvl'; } }
  if (id === 'scRelic') { const c = document.querySelector('#relicCards .lvlCard'); if (c) { c.click(); return 'relic'; } }
  if (id === 'scShop') { const b = document.querySelector('#scShop [data-act="nextWave"]'); if (b) { b.click(); return 'shop'; } }
  return id || null;
}"""


def angdiff(a, b):
    d = (a - b + math.pi) % (2 * math.pi) - math.pi
    return d


def deg(x):
    return round(math.degrees(x), 2)


def frame_after(frames, t):
    for f in frames:
        if f["t"] >= t:
            return f
    return None


def movement_report(frames, keys, sp):
    out = {"each": [], "stop": [], "diag_ratio": None, "dash": None}
    presses = [k for k in keys if k["c"] == "KeyD" and k["d"] == 1]
    releases = [k for k in keys if k["c"] == "KeyD" and k["d"] == 0]
    for kd, ku in zip(presses, releases):
        on = [f for f in frames if kd["t"] <= f["t"] <= ku["t"]]
        if not on:
            continue
        hit = next((f for f in on if abs(f["vx"]) > 0.15 * sp), None)
        fast = next((f for f in on if abs(f["vx"]) >= 0.95 * sp), None)
        off = [f for f in frames if f["t"] >= ku["t"]]
        stop = next((f for f in off if abs(f["vx"]) < 0.05 * sp), None)
        out["each"].append({
            "latency_ms": round(hit["t"] - kd["t"], 1) if hit else None,
            "latency_frames": (on.index(hit) if hit else None),
            "ramp_ms": round(fast["t"] - kd["t"], 1) if fast else None,
            "top_speed": round(max(abs(f["vx"]) for f in on), 1),
        })
        out["stop"].append({
            "latency_ms": round(stop["t"] - ku["t"], 1) if stop else None,
            "frames": (off.index(stop) if stop else None),
        })

    # diagonal window: both KeyW and KeyD held inside one window
    w_down = next((k for k in keys if k["c"] == "KeyW" and k["d"] == 1), None)
    w_up = next((k for k in keys if k["c"] == "KeyW" and k["d"] == 0), None)
    if w_down and w_up:
        d_on = [f for f in frames if abs(f["vx"]) > 0.9 * sp]
        diag = [f for f in frames if w_down["t"] <= f["t"] <= w_up["t"]]
        if diag and d_on:
            out["diag_ratio"] = round(
                max(math.hypot(f["vx"], f["vy"]) for f in diag) / max(abs(f["vx"]) for f in d_on), 3)

    # dash/roll: frames where rollT or dashT is live
    act = [f for f in frames if f["ro"] > 0 or f["dsh"] > 0]
    if act:
        x0, y0 = act[0]["x"], act[0]["y"]
        x1, y1 = act[-1]["x"], act[-1]["y"]
        out["dash"] = {
            "kind": "roll" if act[0]["ro"] > 0 else "dash",
            "frames": len(act),
            "duration_ms": round(act[-1]["t"] - act[0]["t"], 1),
            "distance": round(math.hypot(x1 - x0, y1 - y0), 1),
            "invuln_max": max(f["inv"] for f in act),
        }
    return out


def aim_report(frames, swap_t=None, settle_ms=250):
    """Auto-aim accuracy measured against the ENGINE's current nearest target
    angle (`ne`, sampled every frame), never against a hardcoded expectation:
    the rig's idea of "nearest" is what was wrong twice before this."""
    aim_frames = [f for f in frames if f["aim"] is not None and f.get("ne") is not None]
    out = {"snap_err_deg_max": None, "snap_err_deg_mean": None,
           "reaq_ms": None, "reaq_frames": None, "samples": len(aim_frames)}
    if not aim_frames:
        return out
    t0 = aim_frames[0]["t"]
    settled = [f for f in aim_frames if f["t"] >= t0 + settle_ms and (swap_t is None or f["t"] < swap_t)]
    if settled:
        errs = [abs(deg(angdiff(f["aim"], f["ne"]))) for f in settled]
        out["snap_err_deg_max"] = round(max(errs), 2)
        out["snap_err_deg_mean"] = round(statistics.mean(errs), 3)
    if swap_t:
        after = [f for f in aim_frames if f["t"] >= swap_t]
        hit = next((f for f in after if abs(deg(angdiff(f["aim"], f["ne"]))) <= 3), None)
        out["reaq_ms"] = round(hit["t"] - swap_t, 1) if hit else None
        out["reaq_frames"] = after.index(hit) if hit else None
    return out


def slew_report(frames, flip_t):
    after = [f for f in frames if f["t"] >= flip_t and f["wa"] is not None]
    if not after:
        return {"slew_deg_per_frame": [], "slew_to_5deg_ms": None}
    errs = [abs(deg(angdiff(f["wa"], f["aim"]))) for f in after]
    hit = next((f for f in after if abs(deg(angdiff(f["wa"], f["aim"]))) <= 5), None)
    return {
        "slew_deg_per_frame": [round(e, 1) for e in errs[:10]],
        "slew_to_5deg_ms": round(hit["t"] - flip_t, 1) if hit else None,
    }


def combat_report(frames, sfx, fb):
    if not frames:
        return {}
    deltas = [frames[i]["t"] - frames[i - 1]["t"] for i in range(1, len(frames))]
    deltas.sort()
    hit_frames = [f for f in frames if f["hs"] > 0]
    events = sum(1 for i in range(1, len(frames))
                 if frames[i]["hs"] > 0 and frames[i - 1]["hs"] == 0)
    dsh = [f for f in frames if f["dsh"] > 0 or f["ro"] > 0]
    return {
        "frames": len(frames),
        "fps_p50": round(1000 / statistics.median(deltas), 1) if deltas else None,
        "frame_p50_ms": round(statistics.median(deltas), 1) if deltas else None,
        "frame_p95_ms": round(deltas[int(len(deltas) * 0.95)], 1) if deltas else None,
        "frame_max_ms": round(max(deltas), 1) if deltas else None,
        "hitstop_events": events,
        "hitstop_max_s": max((f["hs"] for f in frames), default=0),
        "hitstop_duty": round(len(hit_frames) / len(frames), 3),
        "timeScale_min": min((f["ts"] for f in frames), default=1),
        "trauma_max": max((f["tr"] for f in frames), default=0),
        "trauma_mean": round(statistics.mean([f["tr"] for f in frames]), 3),
        "enemy_hitflash_frames": sum(f["hf"] for f in frames),
        "kills": max((f["k"] for f in frames), default=0) - min((f["k"] for f in frames), default=0),
        "combo_max": max((f["cb"] for f in frames), default=0),
        "enemies_max": max((f["en"] for f in frames), default=0),
        "dash_frames": len(dsh),
        "sfx": dict(sorted(sfx.items(), key=lambda kv: -kv[1])[:10]),
        "feedback_calls": fb,
    }


def main():
    results = {}
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

            page.evaluate("""() => { OPT().tutorial = false; AudioSys.init(); }""")
            page.click('[data-act="play"]')
            wait_until(page, "() => UI.cur", lambda v: v == "scChar", timeout_s=6)
            page.click('[data-act="charConfirm"]')
            wait_until(page, "() => UI.cur", lambda v: v == "scControls", timeout_s=6)
            page.click('[data-act="controlsOK"]')
            ok, st = wait_until(page, "() => Game.state", lambda v: v == "play", timeout_s=6)
            print("run started:", ok, st)
            # tutorial may still pop after the controls screen
            page.evaluate("() => { if (document.getElementById('tutHint')) document.getElementById('tutHint').classList.add('hidden'); Game.hideTutorial && Game.hideTutorial(); }")
            print("instrument:", page.evaluate(INSTALL))

            # ---------------------------------------------------------------- movement
            sp = page.evaluate("""() => { const G = Game, p = G.players[0];
                G.spawnQueue.length = 0; G.enemies.length = 0; G.waveTimer = 999;
                p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.invuln = 0; G.hitstop = 0; G.timeScale = 1;
                window.__pt.reset(); window.__pt.start(); return p.speed(); }""")
            for _ in range(3):
                page.keyboard.down("KeyD")
                page.wait_for_timeout(700)
                page.keyboard.up("KeyD")
                page.wait_for_timeout(650)
            page.keyboard.down("KeyD")
            page.keyboard.down("KeyW")
            page.wait_for_timeout(700)
            page.keyboard.up("KeyW")
            page.keyboard.up("KeyD")
            page.wait_for_timeout(450)
            page.evaluate("() => { const p = Game.players[0]; p.rollCd = 0; p.x = 0; p.y = 0; }")
            page.keyboard.down("ShiftLeft")
            page.wait_for_timeout(120)
            page.keyboard.up("ShiftLeft")
            page.wait_for_timeout(600)
            page.evaluate("() => window.__pt.stop()")
            mv = page.evaluate("() => ({ frames: window.__pt.frames, keys: window.__pt.keys })")
            results["movement"] = movement_report(mv["frames"], mv["keys"], sp)
            results["movement"]["player_speed_stat"] = sp

            # ---------------------------------------------------------------- aiming: auto
            page.evaluate("""() => { const G = Game, p = G.players[0];
                p.x = 0; p.y = 0; p.vx = p.vy = 0; p.invuln = 30; G.qaGod = true;
                G.enemies.length = 0; G.spawnQueue.length = 0; G.enemyBullets && (G.enemyBullets.length = 0);
                OPT().aim = 'auto';
                /* Enemy is pooled-constructed and `spawn`ed (pw_danger.py pattern);
                   Game.spawnEnemy no longer exists. spd=0 pins it, huge hp keeps it
                   alive long enough to measure aim against a stationary target. */
                const mk = (x) => { const o = new Enemy(); o.spawn(ENEMY_BY_ID.runner, x, 0, 1, null);
                  o.hp = 1e9; o.maxHp = 1e9; o.spd = 0; o.dead = false; G.enemies.push(o); return o; };
                mk(200); mk(-400);   /* a is clearly nearest; b swaps in later */
                window.__pt.reset(); window.__pt.start();
                return G.enemies.length; }""")
            page.wait_for_timeout(500)
            swap_t = page.evaluate("""() => { const G = Game;
                const b = G.enemies[1]; b.x = -150; b.y = 0; /* 150 < 200: becomes nearest */
                window.__swapT = performance.now(); return window.__swapT; }""")
            page.wait_for_timeout(500)
            page.evaluate("() => window.__pt.stop()")
            fr = page.evaluate("() => window.__pt.frames")
            results["aim_auto"] = aim_report(fr, swap_t)
            results["aim_auto"]["mode"] = page.evaluate("() => OPT().aim")

            # ---------------------------------------------------------------- aiming: manual
            page.evaluate("""() => { const G = Game; OPT().aim = 'manual';
                G.enemies.length = 0; G.spawnQueue.length = 0;
                window.__pt.reset(); window.__pt.start(); }""")
            page.mouse.move(900, 360)
            page.wait_for_timeout(400)
            page.evaluate("() => { window.__pt.reset(); }")
            page.wait_for_timeout(450)                      # fixed mouse: jitter window
            jit = page.evaluate("() => window.__pt.frames")
            aims = [f["aim"] for f in jit]
            results["aim_manual"] = {
                "jitter_deg": round(deg(statistics.pstdev(aims)), 3) if len(aims) > 2 else None,
                "samples": len(aims),
            }
            page.mouse.move(300, 360)                       # ~180 deg flip
            flip_t = page.evaluate("() => performance.now()")
            page.wait_for_timeout(450)
            page.evaluate("() => window.__pt.stop()")
            fr2 = page.evaluate("() => window.__pt.frames")
            results["aim_manual"].update(slew_report(fr2, flip_t))

            # ---------------------------------------------------------------- player damage (white-box)
            page.evaluate("""() => { const p = Game.players[0]; Game.qaGod = false;
                p.hp = p.maxHp; p.hitFlash = 0; p.invuln = 0; Game.critVis = 0;
                window.__pt.reset(); window.__pt.start();
                p.damage(Math.max(4, p.maxHp * 0.06), 0); }""")
            page.wait_for_timeout(700)
            page.evaluate("() => window.__pt.stop()")
            pf = page.evaluate("() => window.__pt.frames")
            results["player_hit"] = {
                "hitflash_frames": sum(1 for f in pf if f["hfl"] > 0),
                "hitflash_max": max((f["hfl"] for f in pf), default=0),
                "invuln_frames": sum(1 for f in pf if f["inv"] > 0),
                "critvis_max": max((f["cv"] for f in pf), default=0),
                "hp_after": min((f.get("hp") for f in pf if f.get("hp") is not None), default=None),
            }

            # ---------------------------------------------------------------- combat: live wave 20
            page.evaluate("""() => { const G = Game; OPT().aim = 'auto'; G.qaGod = true;
                G.startWave(20); window.__pt.reset(); window.__pt.start(); }""")
            t0 = time.time()
            pattern = ["KeyD", "KeyW", "KeyA", "KeyS"]
            i = 0
            shot = False
            while time.time() - t0 < 15:
                page.keyboard.down(pattern[i % 4])
                page.keyboard.down(pattern[(i + 1) % 4])
                page.wait_for_timeout(500)
                page.keyboard.up(pattern[i % 4])
                page.keyboard.up(pattern[(i + 1) % 4])
                i += 1
                for _ in range(3):
                    if not page.evaluate(DISMISS_JS):
                        break
                    page.wait_for_timeout(80)
                if not shot and time.time() - t0 > 5:
                    page.screenshot(path="docs/pw/playtest-w20-combat.png")
                    shot = True
            page.evaluate("() => window.__pt.stop()")
            cb = page.evaluate("() => ({ frames: window.__pt.frames, sfx: window.__pt.sfx, fb: window.__pt.fb })")
            results["combat"] = combat_report(cb["frames"], cb["sfx"], cb["fb"])
            results["combat"]["wave"] = page.evaluate("() => Game.wave")
            results["combat"]["state"] = page.evaluate("() => Game.state")
            results["combat"]["boss_present"] = page.evaluate("() => Game.enemies.some(e => e.boss)")

            # dash frame in the live wave
            page.screenshot(path="docs/pw/playtest-w20-wave.png")
            page.keyboard.down("ShiftLeft")
            page.wait_for_timeout(90)
            page.screenshot(path="docs/pw/playtest-w20-dash.png")
            page.keyboard.up("ShiftLeft")

            results["console_errors"] = errs[:6]
            results["engine_errors"] = page.evaluate("() => window.__pt.err.slice(0, 6)")
            browser.close()

    print(json.dumps(results, indent=2, ensure_ascii=False))
    with open("docs/pw/playtest-w20.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
