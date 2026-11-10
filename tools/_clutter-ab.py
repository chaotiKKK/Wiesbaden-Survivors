"""A/B: clutter inside the player's readability zone, quietR off vs on.

One real wave-20 fight (god mode), two 6 s windows with the zone toggled live:
counts damage numbers and rings currently inside 52 px of the player and
screenshots each state. Same wave, same enemies, same weapon — only the zone
differs, so the delta is the change and nothing else.

Run:  eval "$(bash tools/setup-browser.sh --env)"
      "$HOME/pwenv/bin/python" tools/_clutter-ab.py
"""
import json
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

PORT = 8974
BASE = "http://127.0.0.1:%d/index.html?qa=1&pw=clutter" % PORT

SAMPLE = """(ms) => new Promise(res => {
  const acc = { n: [], r: [], tot: [], en: [] };
  const t0 = performance.now();
  const step = () => {
    const p = Game.players[0];
    let n = 0, r = 0;
    for (const o of FX.numbers.active) {
      if (Math.hypot(o.x - p.x, o.y - p.y) < 52) n++;
    }
    for (const o of FX.rings.active) {
      if (Math.hypot(o.x - p.x, o.y - p.y) < 52) r++;
    }
    acc.n.push(n); acc.r.push(r);
    acc.tot.push(FX.numbers.active.length); acc.en.push(Game.enemies.length);
    if (performance.now() - t0 < ms) requestAnimationFrame(step);
    else res({
      frames: acc.n.length,
      numbers_total_mean: +(acc.tot.reduce((a, b) => a + b, 0) / acc.tot.length).toFixed(1),
      numbers_in_zone_max: Math.max.apply(null, acc.n),
      numbers_in_zone_mean: +(acc.n.reduce((a, b) => a + b, 0) / acc.n.length).toFixed(2),
      rings_in_zone_max: Math.max.apply(null, acc.r),
      rings_in_zone_mean: +(acc.r.reduce((a, b) => a + b, 0) / acc.r.length).toFixed(2),
      enemies_mean: +(acc.en.reduce((a, b) => a + b, 0) / acc.en.length).toFixed(1),
      wave: Game.wave, quietR: FX.quietR
    });
  };
  requestAnimationFrame(step);
})"""


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
            ok, st = wait_until(page, "() => Game.state", lambda v: v == "play", timeout_s=6)
            print("run started:", ok, st)
            page.evaluate("""() => {
                if (document.getElementById('tutHint')) document.getElementById('tutHint').classList.add('hidden');
                Game.hideTutorial && Game.hideTutorial();
                Game.qaGod = true;
                if (Game.qaGo) Game.qaGo(20); else Game.startWave(20);
            }""")
            page.wait_for_timeout(1200)
            phase_wave = page.evaluate("() => ({ wave: Game.wave, boss: !!Game.enemies.find(e => e.boss) })")
            print("phase wave:", phase_wave)

            # Interleaved A/B: the enemy population drifts during a wave, so
            # off/on/off/on in the same fight beats two sequential windows.
            wins = (("off", 0), ("on", 52), ("off", 0), ("on", 52))
            raw = {"off": [], "on": []}
            for i, (label, r) in enumerate(wins):
                page.evaluate("(r) => { FX.quietR = r; FX.clear(); }", r)
                page.wait_for_timeout(120)
                raw[label].append(page.evaluate(SAMPLE, 3000))
                if i < 2:
                    page.screenshot(path="docs/pw/clutter-%s.png" % label)
                print(label, i, json.dumps(raw[label][-1]))
            for label in ("off", "on"):
                ws = raw[label]
                f = sum(w["frames"] for w in ws) or 1
                out[label] = {k: (round(sum(w[k] * w["frames"] for w in ws) / f, 2)
                                  if isinstance(ws[0][k], (int, float)) else ws[0][k])
                              for k in ws[0]}
                out[label]["windows"] = [w["numbers_in_zone_mean"] for w in ws]
            for label in ("off", "on"):
                for w in raw[label]:
                    print("  %s: in-zone %.2f / alive %.1f = %.2f per number"
                          % (label, w["numbers_in_zone_mean"], w["numbers_total_mean"],
                             w["numbers_in_zone_mean"] / max(.01, w["numbers_total_mean"])))

            out["wave"] = phase_wave
            out["console_errors"] = errs
            browser.close()

    t = lambda k: (out["off"][k], out["on"][k])
    print("\nRESULT numbers inside 52px: mean %s -> %s  max %s -> %s" %
          (t("numbers_in_zone_mean")[0], t("numbers_in_zone_mean")[1],
           t("numbers_in_zone_max")[0], t("numbers_in_zone_max")[1]))
    print("RESULT rings inside 52px:   mean %s -> %s  max %s -> %s" %
          (t("rings_in_zone_mean")[0], t("rings_in_zone_mean")[1],
           t("rings_in_zone_max")[0], t("rings_in_zone_max")[1]))
    print("RESULT numbers alive:       mean %s -> %s" % t("numbers_total_mean"))
    print("RESULT enemies:             mean %s -> %s" % t("enemies_mean"))
    print("console errors:", errs)
    json.dump(out, open("docs/pw/clutter-ab.json", "w"), indent=2)
    return 0 if out["off"]["frames"] > 60 and out["on"]["frames"] > 60 else 1


if __name__ == "__main__":
    sys.exit(main())
