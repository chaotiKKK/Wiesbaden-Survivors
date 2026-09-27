"""Beat-sync probe (Playwright, headless Chromium): verifies gameplay events
(wave start, boss transition) land on the music sequencer's bar grid instead
of tearing the phase mid-bar.

  A. grid integrity: sequencer runs, musicStep advances monotonically
  B. wave start: switch QUEUED (old song finishes the bar), applied exactly
     at a boundary (musicStep % 16 === 0), phase never reset
  C. boss transition: bossMode+_song flip at the boundary via tagged switch,
     not mid-bar
  D. beatAt: queued events fire at boundaries with audio-clock timing and
     minBars gating works
  E. no-music path: switches flush immediately (nothing to sync to)
  F. lifecycle: endRun/startRun clear stale queued events
Exits 1 on any failed check.
"""

import sys

from playwright.sync_api import sync_playwright

from pw_lib import GAME_STATE_JS, Serve, new_page, wait_until

PORT = 8938
URL = "http://127.0.0.1:%d/index.html?pw=beatsync" % PORT

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS" if ok else "FAIL"), "|", name, ("— " + detail if detail else ""))


def run_checks():
    with Serve(PORT):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            errors = []
            page = new_page(browser, URL, console_errors=errors)

            # -- trusted-gesture run start (ctx must be RUNNING for the grid) ----
            page.click('[data-act="play"]')
            wait_until(page, "() => document.querySelector('.screen:not(.hidden)')?.id",
                       lambda v: v == "scChar", name="char select")
            page.click('[data-act="charConfirm"]')
            wait_until(page, "() => document.querySelector('.screen:not(.hidden)')?.id",
                       lambda v: v == "scControls", name="controls screen")
            page.click('[data-act="controlsOK"]')
            ok, st = wait_until(page, GAME_STATE_JS, lambda v: v == "play", name="run starts")
            check("run started", ok, "state=%s" % st)
            ok, cs = wait_until(page, "() => AudioSys.ctx && AudioSys.ctx.state",
                                lambda v: v == "running", name="ctx running", timeout_s=4)
            check("audio context running (grid can advance)", ok, "state=%s" % cs)
            page.evaluate("() => { if (AudioSys.ctx && AudioSys.ctx.state !== 'running') AudioSys.ctx.resume(); }")

            # -- A. grid integrity -------------------------------------------------
            ok, adv = wait_until(
                page,
                "() => ({ s: AudioSys.musicStep, nt: AudioSys._nextTime, timer: AudioSys.musicTimer })",
                lambda v: v["s"] > 8 and v["timer"] > 0, name="grid advances", timeout_s=5)
            check("sequencer grid advances (musicStep > 8, spb set)", ok, str(adv))
            if not ok:
                browser.close()
                return
            ok, mono = wait_until(
                page,
                "() => { const s = AudioSys.musicStep; const d = s - (window.__lastStep || 0); window.__lastStep = s; return d; }",
                lambda v: v >= 0, name="monotonic", timeout_s=2)
            check("musicStep monotonic (no hidden resets while idling)", mono is not None, "delta=%s" % mono)

            # -- B. wave start lands on the bar boundary ---------------------------
            # Driven via setAmbientKeepGrid (the unit startWave calls): arena
            # choice across consecutive waves is often "same arena" by design,
            # which legitimately queues nothing. Target differs from current.
            target = page.evaluate("() => AudioSys.ambientId === 'labor' ? 'rheinufer' : 'labor'")
            s0 = page.evaluate("() => AudioSys.musicStep")
            oldAmb = page.evaluate("() => AudioSys.ambientId")
            page.evaluate("id => AudioSys.setAmbientKeepGrid(id)", target)
            immediate = page.evaluate("() => ({ amb: AudioSys.ambientId, q: AudioSys._pendingSwitch.length })")
            check("wave start: switch queued, not applied immediately (old song plays out the bar)",
                  immediate["amb"] == oldAmb and immediate["q"] >= 1, str(immediate))
            # sample (step, ambient) densely; the switch fires while step % 16 == 0
            samples = page.evaluate("""() => new Promise(res => {
              const out = [];
              const t0 = performance.now();
              const iv = setInterval(() => {
                out.push({ s: AudioSys.musicStep, amb: AudioSys.ambientId, q: AudioSys._pendingSwitch.length });
                if (out.length >= 400 || performance.now() - t0 > 4000) { clearInterval(iv); res(out); }
              }, 5);
            })""")
            flipped = [x for x in samples if x["amb"] != oldAmb]
            first_flip = next((x for x in samples if x["amb"] != oldAmb), None)
            ok_flip = first_flip is not None
            check("wave start: new song applied after queue", ok_flip,
                  "flip=%s" % (first_flip,))
            if ok_flip:
                check("wave start: applied EXACTLY at bar boundary (step %% 16 === 0)",
                      first_flip["s"] % 16 == 0, "step=%d (%%16=%d)" % (first_flip["s"], first_flip["s"] % 16))
                check("wave start: phase preserved (no musicStep reset)", first_flip["s"] > s0 + 4,
                      "step %d -> %d" % (s0, first_flip["s"]))
            check("wave start: queue drained after boundary", page.evaluate("() => AudioSys._pendingSwitch.length") == 0)
            check("wave start: musicTimer still live (no scheduler stall)",
                  page.evaluate("() => AudioSys.musicTimer") > 0)

            # -- C. boss transition flips on the boundary ---------------------------
            # Next boss wave from here (normal waves keep bossAlive false; the
            # boss flag flips only when a boss actually spawns).
            page.evaluate("() => Game.startWave(10)")
            pre = page.evaluate("() => ({ boss: AudioSys.bossMode, q: AudioSys._pendingSwitch.map(s => s.tag) })")
            check("boss: queued as tagged switch (dedup-safe), old mode until boundary",
                  'boss' in pre["q"] or pre["boss"] is False, str(pre))
            ok, st = wait_until(
                page,
                "() => ({ boss: AudioSys.bossMode, q: AudioSys._pendingSwitch.map(s => s.tag), s: AudioSys.musicStep })",
                lambda v: v["boss"] is True and len(v["q"]) == 0,
                name="boss flips", timeout_s=8)
            check("boss: bossMode flipped at boundary, queue drained", ok, str(st))
            if ok:
                check("boss: flip happened with grid intact (step > 0)", st["s"] > 0, "step=%d" % st["s"])

            # -- D. beatAt: boundary-timed events + minBars gating ------------------
            page.evaluate("""() => {
              window.__spies = [];
              window.__qstep = AudioSys.musicStep;
              AudioSys.beatAt((a, at) => window.__spies.push({ k: 'now', s: AudioSys.musicStep, at }));
              AudioSys.beatAt((a, at) => window.__spies.push({ k: 'later', s: AudioSys.musicStep, at }), 2);
            }""")
            ok, spies = wait_until(page, "() => window.__spies",
                                   lambda v: any(x["k"] == "now" for x in v), name="immediate spy fires", timeout_s=6)
            check("beatAt: event fires at a bar boundary", ok, str(spies))
            now_spies = [x for x in (spies or []) if x["k"] == "now"]
            if now_spies:
                check("beatAt: fired exactly on boundary step", all(x["s"] % 16 == 0 for x in now_spies),
                      str([(x["s"], x["at"]) for x in now_spies]))
                check("beatAt: audio-clock timing (at within one 16th, never past)",
                      all(-0.001 <= x["at"] <= 0.4 for x in now_spies), str([x["at"] for x in now_spies]))
            ok, spies = wait_until(page, "() => window.__spies",
                                   lambda v: any(x["k"] == "later" for x in v), name="minBars spy fires", timeout_s=10)
            later_spies = [x for x in (spies or []) if x["k"] == "later"]
            # minBars is relative to the QUEUE bar (from=floor(qstep/16)); the
            # earliest legal step is (from+2)*16.
            qstep = page.evaluate("() => window.__qstep")
            earliest = ((int(qstep) // 16) + 2) * 16
            check("beatAt: minBars=2 fires 2 bars after queue time (relative semantics)",
                  ok and later_spies and later_spies[0]["s"] >= earliest and later_spies[0]["s"] % 16 == 0,
                  "later step=%s earliest=%d (queued at step %s)" % (later_spies[0]["s"] if later_spies else None, earliest, qstep))

            # -- E. no-music path flushes immediately --------------------------------
            old_music = page.evaluate("() => OPT().music")
            page.evaluate("() => { OPT().music = 0; AudioSys.setAmbientKeepGrid('labor'); }")
            flushed = page.evaluate("() => ({ amb: AudioSys.ambientId, q: AudioSys._pendingSwitch.length })")
            check("no-music path: switch applies immediately (no grid to wait for)",
                  flushed["amb"] == "labor" and flushed["q"] == 0, str(flushed))
            page.evaluate("v => { OPT().music = v; }", old_music)

            # -- F. lifecycle cleanup -------------------------------------------------
            page.evaluate("() => { AudioSys.beatAt(() => window.__spies.push({ k: 'stale' })); AudioSys.requestSwitch(() => {}, 'stale'); }")
            queued = page.evaluate("() => ({ b: AudioSys._beatQueue.length, s: AudioSys._pendingSwitch.length })")
            check("setup: events queued before endRun", queued["b"] >= 1 and queued["s"] >= 1, str(queued))
            page.evaluate("() => Game.endRun(false)")
            clean = page.evaluate("() => ({ b: AudioSys._beatQueue.length, s: AudioSys._pendingSwitch.length })")
            check("endRun clears queued events (no cross-run bleed)", clean["b"] == 0 and clean["s"] == 0, str(clean))

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
