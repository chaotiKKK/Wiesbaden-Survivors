"""Danger-layer probe (Playwright, headless Chromium): verifies the danger-
adaptive music layer's new three-input intensity curve end to end.

  A. curve math: Game._dangerChan() matches the spec for synthetic states
  B. integration: Game.update feeds setDanger — crowd builds intensity at
     full HP (the gap the old HP-only curve left), HP-critical pins 1.0
  C. lerp: AudioSys._dangerNow converges toward _dangerWant
  D. exit reset: endRun(0) drops _dangerWant to 0 immediately
Exits 1 on any failed check.
"""

import sys

from playwright.sync_api import sync_playwright

from pw_lib import GAME_STATE_JS, Serve, new_page, wait_until

PORT = 8937
URL = "http://127.0.0.1:%d/index.html?pw=danger" % PORT

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS" if ok else "FAIL"), "|", name, ("— " + detail if detail else ""))


def approx(a, b, eps=0.02):
    return abs(a - b) <= eps


CHAN = """([hp, close, far, wave]) => {
  Game.enemies = [];
  for (let i = 0; i < close; i++) {
    const o = new Enemy(); o.spawn(ENEMY_BY_ID.runner, Game.players[0].x + 30 + (i % 7) * 8, Game.players[0].y + (i % 5) * 8, 1, null);
    Game.enemies.push(o);
  }
  for (let i = 0; i < far; i++) { const o = new Enemy(); o.spawn(ENEMY_BY_ID.runner, 5000 + i, 5000, 1, null); Game.enemies.push(o); }
  const p = Game.players[0];
  p.alive = true; p.hp = hp; p.maxHp = 100;
  Game.wave = wave;
  return Game._dangerChan();
}"""


def run_checks():
    with Serve(PORT):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            errors = []
            page = new_page(browser, URL, console_errors=errors)

            # sandbox run with a player and RNG
            page.evaluate("() => { Game.startRun(); Game.enemies = []; }")
            ok, st = wait_until(page, GAME_STATE_JS, lambda v: v == "play", name="sandbox run", timeout_s=6)
            check("sandbox run started", ok, "state=%s" % st)
            if not ok:
                browser.close()
                return

            # -- A. curve math ------------------------------------------------
            # (hp, close, far, wave): far enemies weigh 0.35 each, so 40 far
            # chaff alone give (40*.35/55)^2 = .065 — the soft pre-warn for
            # distant swarms approaching.
            cases = [
                ([100, 0, 0, 1], 0.0, "full HP, no enemies, wave 1 -> 0 (silent base)"),
                ([100, 55, 40, 1], 1.0, "full HP + 55 close (+40 far) -> 1.0 (new channel closes the gap)"),
                ([100, 20, 0, 1], 0.132, "full HP + 20 close -> (20/55)^2 = .132"),
                ([100, 0, 40, 1], 0.065, "40 far enemies alone -> (14/55)^2 = .065 (soft pre-warn)"),
                ([100, 0, 0, 8], 0.1, "wave 8 alone -> (8-4)/14*.35 = .1"),
                ([100, 0, 0, 20], 0.35, "wave 20+ alone -> capped at .35 (never full intensity)"),
                ([100, 0, 40, 20], 0.35, "depth cap dominates far crowd (max .35 vs .065)"),
                ([60, 0, 0, 1], 0.0, "HP 60 -> 0 (above the .45 threshold — old behavior)"),
                ([40, 0, 0, 1], 0.125, "HP 40 -> (.45-.4)/.4 = .125 (old curve preserved)"),
                ([20, 0, 0, 1], 0.625, "HP 20 -> (.45-.2)/.4 = .625 (old curve preserved)"),
                ([8, 0, 0, 1], 0.925, "HP 8 -> (.45-.08)/.4 = .925 (old curve preserved)"),
                ([4, 0, 0, 1], 1.0, "HP 5% -> 1.0 pin"),
                ([8, 55, 0, 30], 1.0, "all channels hot -> still 1.0 (clamped)"),
                ([100, 95, 40, 25], 1.0, "crowd+depth saturate -> 1.0"),
            ]
            for args, want, label in cases:
                got = page.evaluate(CHAN, args)
                check("curve: %s" % label, approx(got, want, 0.03), "got=%.3f want=%.3f" % (got, want))

            # -- B. integration: update() feeds the layer ----------------------
            page.evaluate("() => { Game.enemies = []; const p = Game.players[0]; p.alive = true; p.hp = p.maxHp = 100; Game.wave = 1; Game.update(1/60); }")
            ok, want = wait_until(page, "() => AudioSys._dangerWant", lambda v: v is not None and v < 0.01,
                                  name="want ~0 at calm", timeout_s=2)
            check("integration: calm state keeps want at 0", ok, "want=%s" % want)
            page.evaluate("() => { for (let i = 0; i < 55; i++) { const o = new Enemy(); o.spawn(ENEMY_BY_ID.runner, Game.players[0].x + 30 + i, Game.players[0].y, 1, null); Game.enemies.push(o); } Game.update(1/60); }")
            # NOTE: the player's auto-firing weapons kill part of the swarm in the
            # same tick, so 'want' settles below 1.0 — the claim under test is that
            # the crowd channel drives intensity AT FULL HP (want > 0.3 = far above
            # the 0 the HP-only curve would give), not a specific headcount.
            ok, want = wait_until(page, "() => AudioSys._dangerWant", lambda v: v is not None and v > 0.3,
                                  name="want rises under swarm", timeout_s=2)
            check("integration: update() feeds crowd channel at full HP (want > 0.3)", ok, "want=%s" % want)

            # -- C. lerp convergence (driven directly: tests AudioSys's lerp,
            #      decoupled from the live battlefield) -------------------------
            page.evaluate("() => AudioSys.setDanger(1)")
            ok, now = wait_until(page, "() => AudioSys._dangerNow", lambda v: v is not None and v > 0.5,
                                 name="now rises", timeout_s=4)
            check("layer: _dangerNow converges toward want (rise)", ok, "now=%s" % now)
            # pause the sim first: while state=play, Game.update keeps re-feeding
            # setDanger from the live field and would overwrite the 0 we set.
            page.evaluate("() => { Game.state = 'paused'; AudioSys.setDanger(0); }")
            ok, now = wait_until(page, "() => AudioSys._dangerNow", lambda v: v is not None and v < 0.05,
                                 name="now falls", timeout_s=8)
            check("layer: _dangerNow decays back after setDanger(0)", ok, "now=%s" % now)

            # -- D. exit reset ---------------------------------------------------
            page.evaluate("() => { Game.state = 'play'; const p = Game.players[0]; p.alive = true; p.hp = 8; p.maxHp = 100; Game.enemies = []; Game.update(1/60); }")
            ok, want = wait_until(page, "() => AudioSys._dangerWant", lambda v: v is not None and v > 0.9,
                                  name="want re-raised", timeout_s=2)
            check("setup: want re-raised to ~1 (HP critical)", ok, "want=%s" % want)
            page.evaluate("() => Game.endRun(false)")
            ok, want = wait_until(page, "() => AudioSys._dangerWant", lambda v: v is not None and v == 0,
                                  name="want zero after endRun", timeout_s=2)
            check("exit: endRun drops _dangerWant to 0 immediately", ok, "want=%s" % want)
            check("exit: state=end, end screen shown", page.evaluate("() => Game.state") == "end")

            check("zero console/page errors", len(errors) == 0, "; ".join(errors[:3]))
            browser.close()


def main():
    try:
        run_checks()
    finally:
        fails = sum(1 for r in results if not r)
        print("\n%d/%d checks passed" % (len(results) - fails, len(results)))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
