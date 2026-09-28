"""Post-deploy check: two real players connect over co-op on the LIVE site.

Runs after every GitHub Pages deploy (CI job `live-coop`), against the public
URL, the way two people would do it:

  0. freshness: poll until the CDN serves byte-exactly what the deploy job just
     published (sha1 of index.html / data.js / sw.js via --expect). Pages caches
     for up to 10 minutes and ignores query strings, so testing too early would
     test the previous release.
  1. host: title -> "Online-Koop" -> "Raum erstellen", reads the room code off
     the screen (#netCodeOut, grouped like "K7RM 2XQP")
  2. guest: title -> "Online-Koop" -> "Raum beitreten", types that code as shown,
     "Verbinden"
  3. both reach Net.phase 'connected' over the real public MQTT broker + WebRTC,
     and game traffic flows both ways: the guest holds D and the host sees
     player 2's stick move right; the host's picture reaches the guest's video
  4. no page error on either side

The broker is a third party and can hiccup, so a try that fails while the
room is being set up or the pair is connecting is repeated with a fresh room, up
to --attempts tries; each such failure is still reported as a ::warning, so
flakiness stays visible. Once the pair IS connected, the broker is out of the
picture: a failure after that is the game's fault and fails at once. When the
job goes red it says why in ::error annotations and a table in the job summary.

Test-environment adaptations (they change the browser, never the game): service
workers are blocked so the page is fetched fresh from the CDN; WebRTC mDNS
masking is off, as in pw_netseal, because CI runners cannot resolve .local
candidates between two browser contexts.

Usage: python tools/pw_live_coop.py [--url URL] [--expect index.html=<sha1>,...]
                                    [--wait-min 15] [--attempts 3]
"""
import argparse
import hashlib
import os
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ap = argparse.ArgumentParser()
ap.add_argument("--url", default=os.environ.get("LIVE_URL") or "https://chaotikkk.github.io/Wiesbaden-Survivors/")
ap.add_argument("--expect", default=os.environ.get("EXPECT_SHA1", ""),
                help="comma-separated file=sha1 pairs the live site must serve before testing")
ap.add_argument("--wait-min", type=float, default=15)
ap.add_argument("--attempts", type=int, default=3)
args = ap.parse_args()
BASE = args.url if args.url.endswith("/") else args.url + "/"
IN_CI = bool(os.environ.get("GITHUB_ACTIONS"))

STATE_JS = "() => ({ phase: Net.phase, status: Net.status, role: Net.role, coop: !!Game.coop })"
summary = []   # (step, ok, detail) of the deciding run


def annotate(kind, title, msg):
    if IN_CI:
        print("::%s title=%s::%s" % (kind, title, msg.replace("\n", " ")))


def write_summary(verdict, attempts_log):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    lines = ["## Live co-op check: %s" % verdict, "", "Site: %s" % BASE, ""]
    if attempts_log:
        lines += ["| Try | Result |", "|---|---|"] + ["| %d | %s |" % (i + 1, r) for i, r in enumerate(attempts_log)] + [""]
    if summary:
        lines += ["| Step | | Detail |", "|---|---|---|"]
        lines += ["| %s | %s | %s |" % (s, "✅" if ok else "❌", d.replace("|", "/")) for s, ok, d in summary]
    with open(path, "a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


# ---- 0. freshness ----------------------------------------------------------
def live_sha1(name):
    req = urllib.request.Request(BASE + name + "?live=" + str(time.time_ns()),
                                 headers={"Cache-Control": "no-cache", "Pragma": "no-cache"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return hashlib.sha1(r.read()).hexdigest()


expect = dict(p.split("=", 1) for p in args.expect.split(",") if "=" in p)
if expect:
    deadline = time.time() + args.wait_min * 60
    while True:
        try:
            got = {f: live_sha1(f) for f in expect}
        except Exception as e:
            got = {"error": str(e)[:120]}
        stale = [f for f in expect if got.get(f) != expect[f]]
        if not stale:
            print("PASS | live site serves the deployed build (%s)" % ", ".join("%s %s" % (f, expect[f][:10]) for f in expect))
            break
        if time.time() > deadline:
            msg = "after %g min the live site still does not serve the deployed build: %s" % (
                args.wait_min, ", ".join("%s live=%s want=%s" % (f, str(got.get(f))[:10], expect[f][:10]) for f in stale))
            print("FAIL | " + msg)
            annotate("error", "Live site is not the deployed build", msg)
            summary.append(("live site serves the deployed build", False, msg))
            write_summary("FAILED", [])
            sys.exit(1)
        print("wait | CDN still serves the previous build for %s — retrying in 20 s" % ", ".join(stale), flush=True)
        time.sleep(20)
else:
    print("note | no --expect given: testing whatever the live site serves right now")


# ---- 1-4. one co-op attempt ------------------------------------------------
def wait_js(page, js, pred, secs, step=0.25):
    t0, v = time.time(), None
    while time.time() - t0 < secs:
        v = page.evaluate(js)
        if pred(v):
            return True, v
        time.sleep(step)
    return False, page.evaluate(js)


def attempt(p):
    steps = []

    def check(ok, name, detail=""):
        steps.append((name, bool(ok), detail))
        print("%s | %s%s" % ("PASS" if ok else "FAIL", name, (" - " + detail) if detail else ""), flush=True)
        return ok

    browser = p.chromium.launch(headless=True, args=["--disable-features=WebRtcHideLocalIpsWithMdns",
                                                     "--autoplay-policy=no-user-gesture-required"])
    errors, pages = [], {}
    try:
        for name in ("host", "guest"):
            pg = browser.new_context(service_workers="block").new_page()
            pg.on("pageerror", lambda e, n=name: errors.append("%s: %s" % (n, str(e)[:160])))
            pg.on("console", lambda m, n=name: errors.append("%s console: %s" % (n, m.text[:160])) if m.type == "error" else None)
            pg.goto(BASE, wait_until="domcontentloaded", timeout=90000)
            pg.wait_for_function("typeof Net === 'object' && typeof Game === 'object' && !!Game.state", timeout=60000)
            pages[name] = pg
        host, guest = pages["host"], pages["guest"]

        # host opens a room through the menus and reads the code off the screen
        host.click('[data-act="netOpen"]')
        host.click('[data-act="netHost"]')
        ok, st = wait_js(host, STATE_JS, lambda v: v["status"].startswith("Raum offen") or v["phase"] == "error", 30)
        if not check(ok and st["status"].startswith("Raum offen"), "host opens a room", st["status"]):
            return steps
        shown = host.inner_text("#netCodeOut").strip()
        code = host.evaluate("() => Net.code")
        if not check(len(code) >= 6 and Net_norm(shown) == code, "the room code is on the host's screen", shown):
            return steps

        # guest types the code as shown and joins
        guest.click('[data-act="netOpen"]')
        guest.click('[data-act="netJoinMode"]')
        guest.locator("#netCodeIn").press_sequentially(shown, delay=40)
        guest.click('[data-act="netJoinGo"]')
        okh, hs = wait_js(host, STATE_JS, lambda v: v["phase"] in ("connected", "error"), 60)
        okg, gs = wait_js(guest, STATE_JS, lambda v: v["phase"] in ("connected", "error"), 20)
        if not check(hs["phase"] == "connected" and gs["phase"] == "connected", "host and guest connect",
                     "host: %s | guest: %s" % (hs["status"], gs["status"])):
            return steps
        check(hs["coop"] and gs["role"] == "client", "the host runs co-op with the guest as player 2",
              "coop=%s guest role=%s" % (hs["coop"], gs["role"]))

        # guest -> host: player 2's input arrives
        guest.keyboard.down("KeyD")
        okm, mx = wait_js(host, "() => Net.remote.mx", lambda v: v is not None and v > 0.5, 8)
        guest.keyboard.up("KeyD")
        check(okm, "guest input reaches the host (holding D moves player 2 right)", "remote.mx=%s" % mx)

        # host -> guest: the host's picture and control traffic arrive
        okv, vid = wait_js(guest, """() => { const v = document.getElementById('netVideo');
            return { w: v ? v.videoWidth : 0, t: v ? v.currentTime : 0, rx: Date.now() - Net.lastRx }; }""",
                           lambda v: v["w"] > 0 and v["t"] > 0.5, 12)
        check(okv and vid["rx"] < 3000, "the host's picture reaches the guest",
              "video %dpx wide, %.1f s played, last packet %d ms ago" % (vid["w"], vid["t"], vid["rx"]))

        host.evaluate("() => Net.hangUp()")
        guest.evaluate("() => Net.hangUp()")
        time.sleep(0.5)
        check(not errors, "no page errors on host or guest", "; ".join(errors[:3]))
        return steps
    except Exception as e:
        check(False, "scenario ran to completion", str(e).splitlines()[0][:200])
        return steps
    finally:
        browser.close()


def Net_norm(s):
    return "".join(ch for ch in s.upper() if ch.isalnum())


# Steps that depend on the third-party broker; anything after them is the game.
NETWORK_STEPS = {"host opens a room", "host and guest connect", "scenario ran to completion"}

log = []
with sync_playwright() as p:
    for i in range(args.attempts):
        print("\n--- try %d/%d ---" % (i + 1, args.attempts), flush=True)
        steps = attempt(p)
        failed = [s for s in steps if not s[1]]
        if steps and not failed:
            log.append("passed")
            summary[:] = steps
            break
        first = failed[0] if failed else ("scenario", False, "no steps ran")
        log.append("failed: %s (%s)" % (first[0], first[2][:120]))
        summary[:] = steps
        if first[0] not in NETWORK_STEPS:
            print("not retried: the pair was connected, so this is the game, not the broker", flush=True)
            break
        if i + 1 < args.attempts:
            annotate("warning", "Live co-op try %d failed" % (i + 1), "%s — %s; retrying with a fresh room" % (first[0], first[2][:200]))
            time.sleep(10)

ok = log and log[-1] == "passed"
print("\nLIVE CO-OP %s after %d tr%s" % ("OK" if ok else "FAILED", len(log), "y" if len(log) == 1 else "ies"))
if not ok:
    for s, good, d in summary:
        if not good:
            annotate("error", "Live co-op broken: " + s, d or s)
write_summary("OK" if ok else "FAILED", log)
sys.exit(0 if ok else 1)
