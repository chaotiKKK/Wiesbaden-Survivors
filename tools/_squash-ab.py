"""A/B: enemy hit-squash recovery, squashEase off (0, linear) vs on (1, quadratic).

Same peak and same duration by construction; the rig proves that and measures the
shape: how many drawn frames still show the squash, when it crosses half of the
peak, and the integrated deformation inside a fixed 260 ms window (the part the
eye reads as "lingering"). Samples are per rendered frame, so they describe what
reaches the screen at the real frame rate.

Pausing inside the sample window freezes `squash` and turns the measured duration
into the length of the window, so the rig never pauses while sampling. A separate
still-frame pass was dropped: frame jitter made the two variants pause at different
decay values (0.287 vs 0.096), which is no comparison. The curve is the evidence.

Run:  eval "$(bash tools/setup-browser.sh --env)"
      "$HOME/pwenv/bin/python" tools/_squash-ab.py
"""
import json
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

PORT = 8978
BASE = "http://127.0.0.1:%d/index.html?qa=1&pw=squash" % PORT

PREP = """() => {
  const G = Game, p = G.players[0], b = G.enemies.find(e => e.boss);
  if (!b) return null;
  G.state = 'play';
  G.qaGod = true;
  b.spd = 0; b.dmg = 0; b.contactCd = 999; b.hp = 1e9;
  p.invuln = 30;
  return { boss: b.boss.name };
}"""

SAMPLE = """async (ease) => {
  const G = Game, p = G.players[0], b = G.enemies.find(e => e.boss);
  G.state = 'play';
  G.squashEase = ease;
  b.hp = 1e9; b.squash = 0; b.squashT = 0;
  b.hurt(200000, true, p, 'shot');           /* grosser Treffer -> Spitzenwert 0,55 */
  const peak = b.squash, t0 = performance.now();
  const frames = [];
  await new Promise(res => {
    const step = () => {
      const t = performance.now() - t0;
      frames.push([+t.toFixed(1), +b.squash.toFixed(4), +(b.squashT || 0).toFixed(3),
                   +G.timeScale.toFixed(2), +(G.hitstop || 0).toFixed(2), G.state]);
      if (t < 340) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  return { peak: +peak.toFixed(3), frames: frames, fps: Math.round(G.fps) };
}"""



WINDOW_MS = 260.0


def stats(frames, peak):
    first = frames[0][1]
    visible = [f for f in frames if f[1] > 0.0005]
    duration = visible[-1][0] if visible else 0.0
    half = next((f[0] for f in frames if f[1] <= peak / 2), None)
    area = 0.0
    for i in range(len(frames) - 1):
        t0, t1 = frames[i][0], frames[i + 1][0]
        if t0 >= WINDOW_MS:
            break
        t1 = min(t1, WINDOW_MS)
        area += (frames[i][1] + frames[i + 1][1]) / 2 * (t1 - t0)
    return {
        "first_sample": first,
        "frames_visible": len(visible),
        "duration_ms": round(duration, 1),
        "half_ms": half,
        "area_260ms": round(area, 1),
    }


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
            prep = page.evaluate(PREP)
            print("setup:", prep)

            for label, ease in (("linear", 0), ("eased", 1)):
                out[label] = {"ease": ease, "runs": []}
                for _ in range(3):
                    data = page.evaluate(SAMPLE, ease)
                    if not data:
                        print("no boss"); return 1
                    st = stats(data["frames"], data["peak"])
                    st["fps"] = data["fps"]
                    st["peak"] = data["peak"]
                    st["dur_target_ms"] = round(data["peak"] / 3.2 * 1000, 1)
                    out[label]["runs"].append(st)
                    print(label, "peak", data["peak"], "fps", data["fps"], json.dumps(st))
                    print("  frames:", " ".join("%.0f:%.2f(t%.2f)" % (f[0], f[1], f[2])
                                                for f in data["frames"][:9]))
                    page.wait_for_timeout(150)

            out["console_errors"] = errs
            browser.close()

    json.dump(out, open("docs/pw/squash-ab.json", "w"), indent=2)

    def med(label, key):
        vals = sorted(r[key] for r in out[label]["runs"] if r[key] is not None)
        return vals[len(vals) // 2] if vals else None

    off, on = out["linear"], out["eased"]
    ok = bool(off["runs"] and on["runs"])
    if ok:
        print("RESULT peak       %.3f -> %.3f" % (med("linear", "peak"), med("eased", "peak")))
        print("RESULT dauer      %s -> %s ms (Soll %s)" % (med("linear", "duration_ms"),
                                                          med("eased", "duration_ms"),
                                                          off["runs"][0]["dur_target_ms"]))
        print("RESULT sichtbar   %s -> %s Frames" % (med("linear", "frames_visible"),
                                                    med("eased", "frames_visible")))
        print("RESULT halbwert   %s -> %s ms" % (med("linear", "half_ms"), med("eased", "half_ms")))
        print("RESULT flaeche    %s -> %s" % (med("linear", "area_260ms"), med("eased", "area_260ms")))
        print("RESULT 1. Sample  %s -> %s" % (med("linear", "first_sample"), med("eased", "first_sample")))
    print("console errors:", errs)
    good = (ok and all(r["first_sample"] > .30 for r in off["runs"] + on["runs"])
            and abs(med("linear", "duration_ms") - med("eased", "duration_ms")) <= 60
            and med("eased", "area_260ms") < med("linear", "area_260ms") * .85
            and med("eased", "half_ms") < med("linear", "half_ms"))
    return 0 if good else 1


if __name__ == "__main__":
    sys.exit(main())
