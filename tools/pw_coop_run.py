"""A full online co-op run, end to end: two browsers, one game.

Host and guest connect over the real public MQTT broker + WebRTC (room code
typed as shown on the host's screen), then play the way two people would:

  character pick  the host takes "Koop starten (2 Spieler)", confirms player 1;
                  the guest gets the mirrored character menu and picks player 2
  wave 1          both steer (host WASD for player 1, guest WASD for player 2)
  after the wave  level-ups and relics: player 1's on the host's screen, player
                  2's in the guest's mirrored menu, in whatever order they come
  shop            the guest buys for player 2, the host buys for player 1, the
                  guest presses "Bereit - naechste Welle"
  wave 2          starts on the host and shows on the guest

and the risky moments in between:

  pause           the guest pauses (Escape) and resumes ("Weiter" in its menu),
                  then the host pauses and resumes: time stands still, the
                  guest's input does nothing, and the guest is SHOWN the pause
  going down      player 2 goes down late in wave 1 (white-box lever: the game's own
                  Player.down(), as when its HP runs out): the guest's HUD says so,
                  the downed player stays put, the run goes on with player 1; at
                  wave 2 player 2 is back at half health and controllable again
  dropped link    in wave 2 the guest's browser disappears without hanging up:
                  the host pauses within seconds and says why, can play on alone,
                  and is told the partner is gone once WebRTC gives up
  rejoin          a third session: the guest's browser disappears mid-run and the
                  player opens the game again straight away, typing the same
                  code before the host has even noticed; the host reopens the
                  room with that code (shown on its pause screen), the guest
                  gets back in, sees the pause, resumes, and controls the SAME
                  player 2 again (character and weapons unchanged)
  host drops      a second session: mid-run the HOST's browser disappears; the
                  guest is told within seconds ("Host antwortet nicht") instead
                  of staring at a frozen picture, and "Verlassen" takes it to
                  the title right away

and checks that both players SEE the same game (the guest's video matches the
host's canvas, the guest's HUD and menus match the host's state) and CONTROL
the same game (each side's input and choices change that side's player in the
host's simulation, which is the only truth).

"Sees the same frame" is measured, not assumed. The test (white-box, never the
game) stamps a 10-block barcode into the top-left corner of every host frame:
a sync pair around an 8-bit frame counter. The guest decodes it from its video,
which proves it sees the host's LIVE frames, in order, and measures how far
behind it is. A content check on top: the guest's video and the host's canvas,
shrunk to 64x36 luminance, must correlate (median r >= 0.6; measured 0.8-0.9,
the barcode already proves identity, so this only catches a wrong or blank picture). An earlier margin
test against mirrored / 3 s old frames was dropped: its margins depended on how
symmetric the arena happened to be.

Connecting depends on a third-party broker, so only that part is retried (up to
--attempts times with a fresh room); anything after the pair is connected is the
game's fault and fails at once. Test-environment adaptations as in
pw_live_coop: WebRTC mDNS masking off, autoplay allowed, service workers blocked.

Broker outage vs. game bug: in CI this suite blocks the deploy, so a third-party
outage must not hold up releases, but a game bug that stops the pair from
connecting must. With --broker-outage-ok, when connecting fails on every try the
suite asks the public brokers directly (the game's own MqttWire CONNECT, waiting
for CONNACK). None reachable: a loud ::warning, the session is SKIPPED, exit 0.
Any reachable: the brokers are fine, so it is the game - FAIL. The test hook
--simulate-broker-outage points the pages' MQTT WebSockets at a dead address to
prove that path (it changes the browser, never the game).

Usage: python tools/pw_coop_run.py [--serve DIR | --url URL] [--attempts 3]
                                   [--broker-outage-ok] [--simulate-broker-outage]
"""
import argparse
import contextlib
import os
import statistics
import sys
import time

from playwright.sync_api import sync_playwright

from pw_lib import Serve

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ap = argparse.ArgumentParser()
ap.add_argument("--serve", default=None, help="serve this directory (default: the repository)")
ap.add_argument("--url", default=None, help="test a deployed site instead of serving one")
ap.add_argument("--attempts", type=int, default=3)
ap.add_argument("--broker-outage-ok", action="store_true",
                help="skip (warn, exit 0) instead of failing when no public broker is reachable at all")
ap.add_argument("--simulate-broker-outage", action="store_true", help="test hook: MQTT WebSockets go to a dead address")
args = ap.parse_args()
skipped = []
PORT = 8983
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVE = None if args.url else (args.serve or ROOT)
BASE = (args.url.rstrip("/") + "/") if args.url else "http://127.0.0.1:%d/" % PORT
IN_CI = bool(os.environ.get("GITHUB_ACTIONS"))

HOST_ST = """() => ({ state: Game.state, wave: Game.wave, scr: UI.cur, csi: Game.charSelIdx, coop: !!Game.coop,
  n: Game.players.length, sel: Game.sel.slice(), mat: Game.materials,
  lq: (Game.levelQueue || []).map(p => p.index), rq: (Game.relicQueue || []).map(p => p.index) })"""
GUEST_ST = """() => ({ state: Game.state, scr: UI.cur,
  title: document.getElementById('netMenuTitle').textContent, sub: document.getElementById('netMenuSub').textContent,
  cards: [...document.querySelectorAll('#netMenuCards .lvlCard')].map(c => ({ label: c.querySelector('.v').textContent, sub: c.querySelector('.n').textContent, nav: c.classList.contains('nav') })),
  acts: [...document.querySelectorAll('#netMenuActs button')].map(b => b.textContent),
  hud: [...document.querySelectorAll('#netHud .hbox')].map(b => b.textContent) })"""
PLAYER = "(i) => { const p = Game.players[i]; return p ? { x: p.x, y: p.y, hp: Math.round(p.hp), mx: Math.round(p.maxHp), char: p.char.id, name: p.char.name, alive: !!p.alive, weapons: p.weapons.map(w => w.id + ':' + w.tier), items: Object.keys(p.itemCounts || {}).sort() } : null; }"
THUMB = """([sel, mirror]) => { const src = document.querySelector(sel), c = document.createElement('canvas');
  c.width = 64; c.height = 36; const x = c.getContext('2d');
  if (mirror) { x.translate(64, 0); x.scale(-1, 1); }
  x.drawImage(src, 0, 0, 64, 36); const d = x.getImageData(0, 0, 64, 36).data, out = [];
  for (let i = 0; i < d.length; i += 4) out.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  return out; }"""
KEYS = ["KeyD", "KeyS", "KeyA", "KeyW"]
# Ask the game's brokers directly: WebSocket + the game's own MqttWire CONNECT, wait for CONNACK.
BROKER_PROBE = """async () => Promise.all(NET_BROKERS.map(url => new Promise(res => {
  let ws; const done = ok => { try { ws.close(); } catch (e) {} res(ok ? url : null); };
  const to = setTimeout(() => done(false), 8000);
  try { ws = new WebSocket(url, 'mqtt'); } catch (e) { clearTimeout(to); return res(null); }
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => ws.send(MqttWire.connect('wbnsprobe' + Math.random().toString(36).slice(2, 8)));
  ws.onmessage = ev => { const b = new Uint8Array(ev.data); if ((b[0] >> 4) === 2) { clearTimeout(to); done(true); } };
  ws.onerror = () => { clearTimeout(to); done(false); };
}))).then(r => r.filter(Boolean))"""
OUTAGE = """(() => { const W = window.WebSocket;
  window.WebSocket = function (url, proto) { if (/mqtt/.test(String(url))) url = 'wss://127.0.0.1:9/mqtt'; return new W(url, proto); };
  window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); })();"""
BLOCK = 36   # barcode block size in host canvas pixels (survives WebRTC downscaling to 320 px)
STAMP = """(B) => { if (window.__stamp) return true; window.__stamp = { n: 0 };
  const cv = document.getElementById('game'), o = Game.render;
  Game.render = function (...a) {
    const r = o.apply(this, a), n = (++window.__stamp.n) & 255, x = cv.getContext('2d');
    const bits = [1, ...[7, 6, 5, 4, 3, 2, 1, 0].map(i => (n >> i) & 1), 0];
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
    bits.forEach((b, i) => { x.fillStyle = b ? '#fff' : '#000'; x.fillRect(i * B, 0, B, B); });
    x.restore(); return r; };
  return true; }"""
DECODE = """([B, W, H]) => { const v = document.getElementById('netVideo');
  if (!v || !v.videoWidth) return null;
  const c = document.createElement('canvas'); c.width = W; c.height = B; const x = c.getContext('2d');
  x.drawImage(v, 0, 0, W, H);
  const bits = []; for (let i = 0; i < 10; i++) { const d = x.getImageData(i * B + B / 2 - 3, B / 2 - 3, 6, 6).data;
    let s = 0; for (let k = 0; k < d.length; k += 4) s += d[k] + d[k + 1] + d[k + 2]; bits.push(s / (d.length / 4) / 3 > 128 ? 1 : 0); }
  return bits; }"""

results = []


def check(ok, name, detail=""):
    results.append((name, bool(ok), detail))
    print("%s | %s%s" % ("PASS" if ok else "FAIL", name, (" - " + detail) if detail else ""), flush=True)
    if not ok and IN_CI:
        print("::error title=Co-op run: %s::%s" % (name, (detail or name).replace("\n", " ")))
    return ok


class Broken(Exception):
    """The game failed a step after the pair was connected: not retried."""


def corr(a, b):
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    va = sum((x - ma) ** 2 for x in a) ** .5
    vb = sum((y - mb) ** 2 for y in b) ** .5
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (va * vb or 1)


def until(page, js, pred, secs, step=0.2, arg=None):
    t0, v = time.time(), None
    while time.time() - t0 < secs:
        v = page.evaluate(js, arg) if arg is not None else page.evaluate(js)
        if pred(v):
            return True, v
        time.sleep(step)
    return False, v


def need(ok, name, detail=""):
    if not check(ok, name, detail):
        raise Broken(name)


class Run:
    def __init__(self, p):
        self.browser = p.chromium.launch(headless=True, args=["--disable-features=WebRtcHideLocalIpsWithMdns",
                                                              "--autoplay-policy=no-user-gesture-required"])
        self.errors = []
        self.frames = []
        self.codes = []    # (decoded counter or None, host counter at that moment)
        self.k = 0
        self.ctx = {}

    def page(self, name):
        self.ctx[name] = self.browser.new_context(service_workers="block", viewport={"width": 1280, "height": 720})
        pg = self.ctx[name].new_page()
        pg.on("pageerror", lambda e: self.errors.append("%s: %s" % (name, str(e)[:160])))
        pg.on("console", lambda m: self.errors.append("%s console: %s" % (name, m.text[:160])) if m.type == "error" else None)
        pg.add_init_script("window.confirm = () => true;")
        if args.simulate_broker_outage:
            pg.add_init_script(OUTAGE)
        pg.goto(BASE + "index.html", wait_until="domcontentloaded", timeout=90000)
        pg.wait_for_function("typeof Net === 'object' && typeof Game === 'object' && !!Game.state", timeout=60000)
        return pg

    # ---- connecting (the only retried part) ----------------------------------
    def connect(self):
        h, g = self.page("host"), self.page("guest")
        self.h, self.g = h, g
        h.click('[data-act="netOpen"]')
        h.click('[data-act="netHost"]')
        ok, _ = until(h, "() => [Net.status, Net.phase]", lambda v: v[0].startswith("Raum offen") or v[1] == "error", 30)
        ok = h.evaluate("() => Net.status").startswith("Raum offen")
        if not ok:
            return False, "room did not open: " + h.evaluate("() => Net.status")
        shown = h.inner_text("#netCodeOut").strip()
        g.click('[data-act="netOpen"]')
        g.click('[data-act="netJoinMode"]')
        g.locator("#netCodeIn").press_sequentially(shown, delay=30)
        g.click('[data-act="netJoinGo"]')
        okh, _ = until(h, "() => Net.phase", lambda s: s in ("connected", "error"), 60)
        okg, _ = until(g, "() => Net.phase", lambda s: s in ("connected", "error"), 20)
        hp, gp = h.evaluate("() => Net.phase"), g.evaluate("() => Net.phase")
        if hp != "connected" or gp != "connected":
            return False, "host %s (%s) / guest %s (%s)" % (hp, h.evaluate("() => Net.status"), gp, g.evaluate("() => Net.status"))
        self.code_shown = shown
        return True, shown

    # ---- helpers during play --------------------------------------------------
    def sample_frame(self):
        a = self.h.evaluate(THUMB, ["#game", False])
        c = self.g.evaluate(THUMB, ["#netVideo", False])
        self.frames.append(corr(a, c))
        bits = self.g.evaluate(DECODE, [BLOCK, self.W, self.H])
        now = self.h.evaluate("() => window.__stamp.n & 255")
        ok = bits is not None and bits[0] == 1 and bits[9] == 0
        self.codes.append((int("".join(map(str, bits[1:9])), 2) if ok else None, now))

    def steer(self, secs=0.6):
        """Both players move, in different directions, so neither stands still in the swarm."""
        hk, gk = KEYS[self.k % 4], KEYS[(self.k + 2) % 4]
        self.h.keyboard.down(hk); self.g.keyboard.down(gk)
        time.sleep(secs)
        self.h.keyboard.up(hk); self.g.keyboard.up(gk)
        self.k += 1

    def moved_right(self, page, idx):
        before = self.h.evaluate(PLAYER, idx)["x"]
        page.keyboard.down("KeyD")
        ok, after = until(self.h, PLAYER, lambda p: p["x"] - before > 25, 3, arg=idx)
        page.keyboard.up("KeyD")
        return ok, after["x"] - before

    def steer_host(self, secs=0.6):
        k = KEYS[self.k % 4]
        self.h.keyboard.down(k); time.sleep(secs); self.h.keyboard.up(k)
        self.k += 1

    def toast(self, page):
        return page.evaluate("() => { const t = [...document.querySelectorAll('.toast')].pop(); return t ? t.textContent : ''; }")

    # ---- the risky moments ------------------------------------------------------
    def pause_checks(self):
        h, g = self.h, self.g
        g.keyboard.press("Escape")
        ok, st = until(h, "() => [Game.state, UI.cur]", lambda v: v == ["paused", "scPause"], 3)
        need(ok, "the guest's Escape pauses the host's game", str(st))
        ok, gs = self.guest_menu("Pause", 3)
        need(ok and any(a.lower() == "weiter" for a in gs["acts"]), "the guest is shown the pause", "%s / %s" % (gs["title"], gs["acts"]))
        t0, x0 = h.evaluate("() => Game.waveTimer"), h.evaluate(PLAYER, 1)["x"]
        g.keyboard.down("KeyD"); time.sleep(1.2); g.keyboard.up("KeyD")
        t1, x1 = h.evaluate("() => Game.waveTimer"), h.evaluate(PLAYER, 1)["x"]
        need(t1 == t0 and x1 == x0, "while paused, time stands still and the guest's input does nothing",
             "wave timer %.2f -> %.2f, player 2 x %d -> %d" % (t0, t1, x0, x1))
        g.locator("#netMenuActs button").filter(has_text="Weiter").click()
        ok, st = until(h, "() => Game.state", lambda v: v == "play", 3)
        need(ok, "the guest's 'Weiter' resumes the game", st)
        ok, gs = until(g, GUEST_ST, lambda v: v["scr"] is None, 3)
        check(ok, "the guest's pause menu closes on resume", str(gs["scr"]))
        h.keyboard.press("Escape")
        ok, st = until(h, "() => Game.state", lambda v: v == "paused", 3)
        need(ok, "the host's Escape pauses the game", st)
        ok, gs = self.guest_menu("Pause", 3)
        need(ok, "the guest is shown the host's pause", gs["title"])
        h.click('[data-act="resume"]')
        ok, st = until(h, "() => Game.state", lambda v: v == "play", 3)
        need(ok, "the host resumes", st)
        ok, gs = until(g, GUEST_ST, lambda v: v["scr"] is None, 3)
        check(ok, "the guest's pause menu closes when the host resumes", str(gs["scr"]))

    def down_checks(self):
        h, g = self.h, self.g
        for _ in range(2):   # a Cyborg survives the first hit on emergency power
            h.evaluate("() => Game.players[1].down()")
            if not h.evaluate(PLAYER, 1)["alive"]:
                break
        p2 = h.evaluate(PLAYER, 1)
        need(not p2["alive"], "player 2 goes down", "%s %d/%d" % (p2["name"], p2["hp"], p2["mx"]))
        ok, gs = until(g, GUEST_ST, lambda v: any("AUSSER GEFECHT" in x for x in v["hud"]), 3)
        need(ok, "the guest's HUD shows player 2 out of action", " | ".join(gs["hud"]))
        g.keyboard.down("KeyD"); time.sleep(1.0); g.keyboard.up("KeyD")
        check(h.evaluate(PLAYER, 1)["x"] == p2["x"], "a downed player 2 does not move")
        ok, dx = self.moved_right(h, 0)
        need(ok and h.evaluate("() => Game.state") == "play", "the run goes on with player 1", "+%d px" % dx)

    def revive_checks(self):
        h, g = self.h, self.g
        p2 = h.evaluate(PLAYER, 1)
        need(p2["alive"] and 0 < p2["hp"] <= p2["mx"] * 0.5 + 1, "player 2 is back for wave 2, at half health (co-op revive)",
             "%s %d/%d" % (p2["name"], p2["hp"], p2["mx"]))
        ok, gs = until(g, GUEST_ST, lambda v: not any("AUSSER GEFECHT" in x for x in v["hud"]), 3)
        check(ok, "the guest's HUD shows player 2 back in action", " | ".join(gs["hud"]))
        ok, dx = self.moved_right(g, 1)
        need(ok, "the guest controls player 2 again", "+%d px" % dx)

    def drop_checks(self):
        h = self.h
        need(h.evaluate("() => Game.state") == "play", "wave 2 is running when the link drops")
        t0 = time.time()
        self.ctx["guest"].close()          # no hang-up: the guest's browser just goes away
        ok, st = until(h, "() => [Game.state, UI.cur]", lambda v: v == ["paused", "scPause"], 12)
        dt = time.time() - t0
        need(ok and dt <= 6, "the host pauses within seconds when the guest drops", "%.1f s, %s" % (dt, st))
        msg = self.toast(h)
        check("antwortet nicht" in msg, "the host is told why", msg)
        h.click('[data-act="resume"]')
        ok, dx = self.moved_right(h, 0)
        need(ok and h.evaluate("() => Game.state") == "play", "the host can play on alone", "+%d px" % dx)
        t0 = time.time()
        while time.time() - t0 < 40 and h.evaluate("() => Net.phase") == "connected":
            if h.evaluate("() => Game.state") == "play":
                self.steer_host(0.5)
            else:
                time.sleep(0.5)
        st = h.evaluate("() => ({ phase: Net.phase, status: Net.status, state: Game.state })")
        msg = self.toast(h)
        check(st["phase"] != "connected" and "getrennt" in msg and "wieder offen" in msg,
              "once WebRTC gives up, the host is told the partner is gone and reopens the room",
              "after %.0f s more: %s, %s, toast '%s'" % (time.time() - t0, st["phase"], st["status"], self.toast(h)))

    def rejoin(self):
        """Third session: the guest drops hard and comes straight back with the same code."""
        h, g = self.h, self.g
        h.click('[data-act="netBack"]')
        h.click('[data-act="coop"]')
        h.click('[data-act="charConfirm"]')
        ok, gs = self.guest_menu("Spieler 2")
        need(ok, "rejoin: the guest picks player 2", gs["title"])
        g.locator("#netMenuCards .lvlCard.nav").nth(2).click()
        h.click('[data-act="charConfirm"]')
        if until(h, "() => UI.cur", lambda v: v == "scControls", 3)[0]:
            h.click('[data-act="controlsOK"]')
        ok, st = until(h, "() => Game.state", lambda v: v == "play", 10)
        need(ok, "rejoin: the run is under way", st)
        ok, how = self.moved(g, 1)
        need(ok, "rejoin: the guest controls player 2 before the drop", how)
        before = h.evaluate(PLAYER, 1)
        self.ctx["guest"].close()          # the guest's browser goes away without a hang-up
        t0 = time.time()
        g = self.g = self.page("guest again")   # and the player opens the game again at once
        g.click('[data-act="netOpen"]')
        g.click('[data-act="netJoinMode"]')
        g.locator("#netCodeIn").press_sequentially(self.code_shown, delay=30)
        g.click('[data-act="netJoinGo"]')
        joined_at = time.time() - t0
        shown_code, t1 = "", time.time()
        while time.time() - t1 < 45:
            if h.evaluate("() => Net.phase") == "connected" and g.evaluate("() => Net.phase") == "connected":
                break
            txt = h.evaluate("() => { const e = document.getElementById('pauseNet'); return e && !e.classList.contains('hidden') ? e.textContent : ''; }")
            if self.code_shown in txt:
                shown_code = txt
            time.sleep(0.4)
        check(bool(shown_code), "while waiting, the host's pause screen shows the same code", shown_code or "(never shown)")
        hp, gp = h.evaluate("() => Net.phase"), g.evaluate("() => Net.phase")
        need(hp == "connected" and gp == "connected", "the guest gets back in with the same code",
             "joined %.1f s after the drop, back after %.1f s; host %s, guest %s (%s)" % (joined_at, time.time() - t0, hp, gp, g.evaluate("() => Net.status")))
        ok, gs = self.guest_menu("Pause", 5)
        need(ok, "back in, the guest sees the game is paused", gs["title"] or str(gs["scr"]))
        g.locator("#netMenuActs button").filter(has_text="Weiter").click()
        ok, st = until(h, "() => Game.state", lambda v: v == "play", 3)
        need(ok, "the returning guest's 'Weiter' resumes the run", st)
        after = h.evaluate(PLAYER, 1)
        need(after["char"] == before["char"] and after["weapons"] == before["weapons"], "it is the same player 2",
             "%s %s -> %s %s" % (before["name"], before["weapons"], after["name"], after["weapons"]))
        ok, how = self.moved(g, 1)
        need(ok, "the returning guest controls player 2 again", how)
        check(not self.errors, "rejoin: no page errors", "; ".join(self.errors[:3]))

    def host_drop(self):
        """Second session: the host's browser goes away mid-run."""
        h, g = self.h, self.g
        h.click('[data-act="netBack"]')
        h.click('[data-act="coop"]')
        h.click('[data-act="charConfirm"]')
        ok, gs = self.guest_menu("Spieler 2")
        need(ok, "host drop: the guest picks player 2", gs["title"])
        g.locator("#netMenuCards .lvlCard.nav").first.click()
        h.click('[data-act="charConfirm"]')
        if until(h, "() => UI.cur", lambda v: v == "scControls", 3)[0]:
            h.click('[data-act="controlsOK"]')
        ok, st = until(h, "() => Game.state", lambda v: v == "play", 10)
        need(ok, "host drop: the run is under way", st)
        time.sleep(2)
        t0 = time.time()
        self.ctx["host"].close()           # no hang-up: the host's browser just goes away
        ok, gs = until(g, GUEST_ST, lambda v: v["scr"] == "scNetMenu" and v["title"] == "Host antwortet nicht", 12)
        dt = time.time() - t0
        need(ok and dt <= 6, "the guest is told within seconds when the host drops", "%.1f s: %s" % (dt, gs["title"] or gs["scr"]))
        need(any(a.lower() == "verlassen" for a in gs["acts"]), "the guest can leave right away", ", ".join(gs["acts"]))
        g.locator("#netMenuActs button").filter(has_text="Verlassen").click()
        ok, st = until(g, "() => [UI.cur, Net.phase, Game.state]", lambda v: v == ["scTitle", "idle", "title"], 3)
        need(ok, "'Verlassen' takes the guest back to the title", str(st))
        check(not self.errors, "host drop: no page errors", "; ".join(self.errors[:3]))

    def moved(self, page, idx):
        """Control, not a direction: try right, and left if right is blocked (arena edge)."""
        for key in ("KeyD", "KeyA"):
            before = self.h.evaluate(PLAYER, idx)["x"]
            page.keyboard.down(key)
            ok, after = until(self.h, PLAYER, lambda p: abs(p["x"] - before) > 25, 2, arg=idx)
            page.keyboard.up(key)
            if ok:
                return True, "%+d px (%s)" % (after["x"] - before, key[-1])
        return False, "no movement with D or A (x %d)" % before

    def guest_menu(self, title_prefix, secs=10):
        return until(self.g, GUEST_ST, lambda s: s["scr"] == "scNetMenu" and s["title"].startswith(title_prefix), secs)

    # ---- the run --------------------------------------------------------------
    def play(self):
        h, g = self.h, self.g

        # character pick
        h.click('[data-act="netBack"]')
        h.click('[data-act="coop"]')
        h.click('[data-act="charConfirm"]')
        ok, gs = self.guest_menu("Spieler 2")
        need(ok, "guest gets the character menu for player 2", "%s, %d cards" % (gs["title"], len(gs["cards"])))
        default = h.evaluate(HOST_ST)["sel"][1]
        # the guest's cards are CHARS filtered by the host's unlocks, in order (buildMenu)
        chars =h.evaluate("() => CHARS.filter(c => Save.data.unlockedChars.includes(c.id) || !c.unlock).map(c => c.id)")
        pick = next(i for i, cid in enumerate(chars) if cid != default and gs["cards"][i]["nav"])
        want = chars[pick]
        g.locator("#netMenuCards .lvlCard").nth(pick).click()
        ok, st = until(h, HOST_ST, lambda s: s["sel"][1] == want, 5)
        need(ok, "the guest's pick becomes player 2 on the host", "picked %s (default was %s)" % (want, default))
        h.click('[data-act="charConfirm"]')
        if until(h, "() => UI.cur", lambda s: s == "scControls", 3)[0]:
            h.click('[data-act="controlsOK"]')
        ok, st = until(h, HOST_ST, lambda s: s["state"] == "play", 10)
        need(ok and st["n"] == 2, "the run starts with two players", "state=%s players=%d" % (st["state"], st["n"]))
        p2 = h.evaluate(PLAYER, 1)
        need(p2["char"] == want, "player 2 plays the character the guest picked", p2["name"])
        ok, gs = until(g, GUEST_ST, lambda s: s["scr"] is None and any(x.startswith("WELLE 1") for x in s["hud"]), 5)
        check(ok, "guest's menu closes and its HUD shows wave 1", " | ".join(gs["hud"]))

        # white-box frame stamp on the host (see docstring), then control checks
        self.h.evaluate(STAMP, BLOCK)
        self.W, self.H = self.h.evaluate("() => [document.getElementById('game').width, document.getElementById('game').height]")

        # control: each side moves its own player
        ok, dx = self.moved_right(h, 0)
        need(ok, "host input moves player 1", "+%d px" % dx)
        ok, dx = self.moved_right(g, 1)
        need(ok, "guest input moves player 2 in the host's game", "+%d px" % dx)

        # the risky moments of wave 1: a pause from each side now, player 2 goes down near the end
        # (late, so player 1 only has to hold out alone for a few seconds)
        self.pause_checks()

        # wave 1 until the game leaves play
        t0, downed = time.time(), False
        while h.evaluate("() => Game.state") == "play" and time.time() - t0 < 90:
            if not downed and h.evaluate("() => Game.waveTimer") < 6:
                self.down_checks(); downed = True
                continue
            self.sample_frame()
            self.steer()
        need(downed, "player 2 went down before wave 1 ended")
        st = h.evaluate(HOST_ST)
        need(st["state"] != "play", "wave 1 ends", "state=%s after %.0f s" % (st["state"], time.time() - t0))
        need(h.evaluate(PLAYER, 0)["alive"], "player 1 carried wave 1 alone")

        # level-ups and relics, in whatever order they come, until the shop
        queue = h.evaluate("() => (Game.levelQueue || []).map(p => p.index)")
        h.evaluate("() => { const o = Game.chooseUpgrade; window.__ups = []; Game.chooseUpgrade = function (p, c) { window.__ups.push(p.index); return o.call(this, p, c); }; }")
        p1_picks = p2_picks = 0
        t0 = time.time()
        while time.time() - t0 < 60:
            st = h.evaluate(HOST_ST)
            if st["state"] == "shop":
                break
            if st["state"] == "levelup" and st["lq"]:
                if st["lq"][0] == 0:
                    h.locator("#lvlCards > *").first.click(); p1_picks += 1
                else:
                    ok, gs = self.guest_menu("Stufe")
                    need(ok and any(c["nav"] for c in gs["cards"]), "guest gets player 2's level-up choices", gs["title"])
                    before = len(h.evaluate("() => Game.levelQueue"))
                    g.locator("#netMenuCards .lvlCard.nav").first.click(); p2_picks += 1
                    need(until(h, "() => (Game.levelQueue || []).length", lambda n: n < before or h.evaluate("() => Game.state") != "levelup", 5)[0],
                         "the guest's level-up pick is applied by the host")
            elif st["state"] == "relic" and st["rq"]:
                if st["rq"][0] == 0:
                    h.click('[data-act="relicSkip"]')
                else:
                    ok, gs = self.guest_menu("Relikt")
                    need(ok, "guest gets player 2's relic choice", gs["title"])
                    g.locator("#netMenuCards .lvlCard.nav").first.click()
            time.sleep(0.4)
        st = h.evaluate(HOST_ST)
        need(st["state"] == "shop", "the shop opens after the wave", "state=%s" % st["state"])
        ups = h.evaluate("() => window.__ups")
        check(ups == queue and p1_picks == queue.count(0) and p2_picks == queue.count(1),
              "every level-up was chosen by its own player", "queue %s, applied %s (host picked %d for P1, guest %d for P2)" % (queue, ups, p1_picks, p2_picks))

        # shop: guest buys for player 2, host for player 1
        ok, gs = self.guest_menu("Shop")
        need(ok and gs["title"] == "Shop - Welle 1", "guest sees the shop", gs["title"])
        mat0 = st["mat"]
        # the HUD snapshot goes out once a second, so give it that long to catch up
        ok, gs = until(g, GUEST_ST, lambda s: ("Material: %d" % mat0) in s["sub"] and ("%d MATERIAL" % mat0) in s["hud"], 3)
        check(ok, "guest's shop and HUD show the host's material", "%s | %s | host %d" % (gs["sub"], " / ".join(gs["hud"]), mat0))
        buyable = [i for i, c in enumerate(gs["cards"]) if c["nav"]]
        while not buyable:
            # Nothing affordable after this wave: do what a player would, sell a weapon first.
            sell = next((i for i, a in enumerate(gs["acts"]) if a.startswith("verkaufen")), None)
            need(sell is not None, "the guest can raise material by selling", "%d MAT, offers: %s" % (mat0, [c["sub"] for c in gs["cards"]]))
            sold, before = gs["acts"][sell], mat0
            g.locator("#netMenuActs button").nth(sell).click()
            ok, mat0 = until(h, "() => Game.materials", lambda m: m > before, 5)
            need(ok, "the guest's sale lands on player 2", "%s: %d -> %d MAT" % (sold, before, mat0))
            ok, gs = until(g, GUEST_ST, lambda s: ("Material: %d" % mat0) in s["sub"], 5)
            buyable = [i for i, c in enumerate(gs["cards"]) if c["nav"]]
        need(buyable, "the guest can afford something", "%d MAT, offers: %s" % (mat0, [c["sub"] for c in gs["cards"]]))
        p2b = h.evaluate(PLAYER, 1)
        label = gs["cards"][buyable[0]]["label"]
        g.locator("#netMenuCards .lvlCard").nth(buyable[0]).click()
        ok, mat1 = until(h, "() => Game.materials", lambda m: m < mat0, 5)
        p2a = h.evaluate(PLAYER, 1)
        need(ok and (p2a["items"] != p2b["items"] or p2a["weapons"] != p2b["weapons"]),
             "the guest's purchase lands on player 2", "%s: %d -> %d MAT, items %s, weapons %s" % (label, mat0, mat1, p2a["items"], p2a["weapons"]))
        ok, gs = until(g, GUEST_ST, lambda s: ("Material: %d" % mat1) in s["sub"], 5)
        check(ok, "guest's shop updates to the new material", gs["sub"])
        p1b = h.evaluate(PLAYER, 0)
        cheapest = h.evaluate("() => Math.min(...ShopSystem.offers.filter((o, i) => !ShopSystem.bought[i]).map(o => o.price))")
        if cheapest > mat1:
            print("NOTE | the host cannot afford anything for player 1 (%d MAT, cheapest %d) - host purchase not tested this run" % (mat1, cheapest), flush=True)
        else:
            offers = h.locator("#shopItems .item:not(.bought)")
            for i in range(offers.count()):
                offers.nth(i).click()
                if until(h, "() => Game.materials", lambda m: m < mat1, 1)[0]:
                    break
            p1a = h.evaluate(PLAYER, 0)
            check(p1a["items"] != p1b["items"] or p1a["weapons"] != p1b["weapons"], "the host's purchase lands on player 1",
                  "items %s, weapons %s" % (p1a["items"], p1a["weapons"]))
        need(h.evaluate(PLAYER, 1)["items"] == p2a["items"] and h.evaluate(PLAYER, 1)["weapons"] == p2a["weapons"],
             "the host's purchase does not touch player 2")

        # the guest starts wave 2
        acts = gs["acts"]
        nxt = next((i for i, a in enumerate(acts) if a.startswith("Bereit")), None)
        need(nxt is not None, "guest has the 'ready' button", ", ".join(acts))
        g.locator("#netMenuActs button").nth(nxt).click()
        ok, st = until(h, HOST_ST, lambda s: s["state"] == "play" and s["wave"] == 2, 8)
        need(ok, "the guest's 'ready' starts wave 2 on the host", "state=%s wave=%s" % (st["state"], st["wave"]))
        ok, gs = until(g, GUEST_ST, lambda s: s["scr"] is None and any(x.startswith("WELLE 2") for x in s["hud"]), 5)
        need(ok, "guest's menu closes and its HUD shows wave 2", " | ".join(gs["hud"]))
        self.revive_checks()
        for _ in range(8):
            self.sample_frame()
            self.steer(0.4)
        hud = g.evaluate(GUEST_ST)["hud"]
        p2 = h.evaluate(PLAYER, 1)
        check(any(x.startswith(p2["name"] + " ") and x.endswith("/%d" % p2["mx"]) for x in hud),
              "guest's HUD shows player 2 as the host has it", "%s | host: %s %d/%d" % (" | ".join(hud), p2["name"], p2["hp"], p2["mx"]))

        # both see the same picture: the host's live frames, in order, a little behind
        got = [(d, n) for d, n in self.codes if d is not None]
        lags = [(n - d) % 256 for d, n in got]
        steps = [(b[0] - a[0]) % 256 for a, b in zip(got, got[1:])]
        in_order = sum(1 for s in steps if 0 < s < 200)
        check(len(self.codes) >= 15 and len(got) >= 0.9 * len(self.codes) and in_order >= 0.9 * max(1, len(steps))
              and len(got) and max(lags) <= 90,
              "the guest sees the host's live frames, in order",
              "%d/%d frames decoded, %d/%d steps forward, lag median %d / max %d frames (~%d ms at 60 fps)"
              % (len(got), len(self.codes), in_order, len(steps), statistics.median(lags) if lags else -1,
                 max(lags) if lags else -1, (statistics.median(lags) if lags else 0) * 1000 / 60))
        med = statistics.median(self.frames) if self.frames else float("nan")
        check(med >= 0.6, "the guest's picture is the host's game picture", "median r %.2f over %d frames" % (med, len(self.frames)))

        check(not self.errors, "no page errors on host or guest", "; ".join(self.errors[:3]))

        # last: the link drops mid-run (ends the guest's session, so it goes after every guest check)
        self.drop_checks()
        check(not self.errors, "no page errors on the host after the drop", "; ".join(self.errors[:3]))
        h.evaluate("() => Net.hangUp()")

    def close(self):
        self.browser.close()


def session(p, label, scenario):
    """Connect (retried: the broker is a third party), then run one scenario (not retried)."""
    for i in range(args.attempts):
        run = Run(p)
        try:
            ok, info = run.connect()
            if not ok:
                print("%s try %d/%d: connecting failed (%s)" % (label, i + 1, args.attempts, info), flush=True)
                if IN_CI:
                    print("::warning title=Co-op run (%s): connect try %d failed::%s" % (label, i + 1, info))
                if i + 1 == args.attempts:
                    reachable = run.h.evaluate(BROKER_PROBE)
                    if not reachable and args.broker_outage_ok:
                        msg = "%s: no public broker reachable (%d tries) - a third-party outage, not the game; session skipped" % (label, args.attempts)
                        print("SKIP | " + msg, flush=True)
                        if IN_CI:
                            print("::warning title=Co-op run skipped: broker outage::" + msg)
                        skipped.append(label)
                    else:
                        check(False, "%s: host and guest connect" % label,
                              "%s | brokers reachable: %s%s" % (info, ", ".join(reachable) or "none",
                                                               " - so the game is at fault" if reachable else ""))
                continue
            check(True, "%s: host and guest connect" % label, "room code %s typed as shown" % info)
            scenario(run)
            return
        except Broken:
            return
        except Exception as e:
            check(False, "%s: the scenario completed" % label, str(e).splitlines()[0][:200])
            return
        finally:
            run.close()


with (Serve(PORT, directory=SERVE) if SERVE else contextlib.nullcontext()), sync_playwright() as p:
    print("site: %s" % BASE, flush=True)
    session(p, "run", Run.play)
    session(p, "rejoin", Run.rejoin)
    session(p, "host drop", Run.host_drop)

fails = [r for r in results if not r[1]]
print("\n%d/%d checks passed" % (len(results) - len(fails), len(results)) + (" | skipped (broker outage): " + ", ".join(skipped) if skipped else ""))
path = os.environ.get("GITHUB_STEP_SUMMARY")
if path:
    with open(path, "a", encoding="utf-8") as f:
        f.write("## Online co-op run: %s\n\n" % ("FAILED" if fails else "SKIPPED (broker outage)" if skipped and not results else "OK"))
        if skipped:
            f.write("Skipped because no public broker was reachable: %s\n\n" % ", ".join(skipped))
        f.write("| Step | | Detail |\n|---|---|---|\n")
        for n, ok, d in results:
            f.write("| %s | %s | %s |\n" % (n, "✅" if ok else "❌", d.replace("|", "/")))
sys.exit(1 if fails or not (results or skipped) else 0)
