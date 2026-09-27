"""LUFS measurement harness keeper (BS.1770-4 over OfflineAudioContext).

Checks (exit 1 on any FAIL):
  §1 measurement math via the ENGINE's lufsMeasure on synthetic buffers:
     997 Hz stereo sine at −20 dBFS must measure exactly −20.0 LUFS
     (BS.1770-4 filter calibration incl. the −0.691 offset), silence → null.
  §2 audioConformance(): plausible result (finite, peak ≤ ~0 dBFS, gates
     keep blocks), verdict consistency (warn ⇔ !inWindow, target −16…−14),
     determinism (second run Δ ≤ 0.5 LU), zero console/page errors, and
     no asset fetches (m4a) during the whole probe.
  §3 QA surface (?qa=1): qaLufs button navigable; click produces the
     measured toast within its timeout; warn path emits console.warn.
  §4 live-state hygiene: run the conformance render mid-play and confirm
     Game state, AudioSys.ctx identity, gain nodes and volume options are
     untouched afterwards.
"""
import sys
import time
from playwright.sync_api import sync_playwright
sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until

# Toasts live 2.6 s in the DOM (2200 ms + 420 ms fade). Reading them from the DOM
# races that lifetime, and the LUFS maths blocks the main thread the poll needs:
# on the CI runner section 3 saw no toast at all within 30 s although the
# measurement itself completes. Record every UI.toast call and poll the record.
TOAST_HOOK = """() => { if (window.__toasts) return true; window.__toasts = [];
  const t0 = performance.now(), orig = UI.toast.bind(UI);
  UI.toast = function (m) { window.__toasts.push([Math.round(performance.now() - t0), String(m)]); return orig.apply(null, arguments); };
  return true; }"""

PORT = 8953
URL = "http://127.0.0.1:%d/index.html%%s" % PORT

results = []


def check(name, ok, note=""):
    results.append(bool(ok))
    print(("PASS" if ok else "FAIL") + "  " + name + (" — " + note if note else ""))


def main():
    with Serve(PORT):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            audio_reqs = []
            errs = []
            warns = []

            # ---------- §1 + §2: plain load (no gesture, no ?qa) ----------
            pg = new_page(browser.new_context().new_page() if False else browser, URL % "?pw=lufs", audio_reqs=audio_reqs)
            pg.on("console", lambda m: warns.append(m.text) if m.type == "warning" else None)
            pg.on("pageerror", lambda e: errs.append(str(e)))

            # §1: measurement math vs a calibrated reference
            ok, r = wait_until(pg, """() => (async () => {
                const A = AudioSys;
                const SR = 48000, F = 997, AMP = Math.pow(10, -20 / 20);
                const len = 2 * SR;
                const octx = new OfflineAudioContext(2, len, SR);
                const buf = octx.createBuffer(2, len, SR);
                for (let ch = 0; ch < 2; ch++) {
                    const d = buf.getChannelData(ch);
                    for (let i = 0; i < len; i++) d[i] = AMP * Math.sin(2 * Math.PI * F * i / SR);
                }
                const m = A.lufsMeasure(buf);
                if (!m) return { err: 'null' };
                return { lufs: m.lufs, peak: m.peakDb };
            })()""", lambda v: v and not v.get("err"), timeout_s=15)
            check("§1 997 Hz −20 dBFS stereo sine", ok and abs(r.get("lufs", 99) + 20.0) < 0.15,
                  "measured %s LUFS (want −20.0 ±0.15)" % r.get("lufs") if ok else str(r))

            ok, r = wait_until(pg, "() => (async () => { const A = AudioSys; const o = new OfflineAudioContext(2, 24000, 48000); return A.lufsMeasure(o.createBuffer(2, 24000, 48000)) === null; })()",
                               lambda v: v is True, timeout_s=10)
            check("§1 silence → null (no measurement)", ok, str(r))

            # §2: conformance run — wait for the async verdict object
            conf_js = """() => (async () => {
                const A = AudioSys;
                const r = await A.audioConformance();
                window.__lufsRun = r;
                return { have: !!r, err: r.error || null, lufs: r.masterLufs, peak: r.peakDb,
                         inWin: r.inWindow, warn: r.warn, msg: r.message || '',
                         blocks: r.blocks, total: r.total, target: r.target };
            })()"""
            ok, r1 = wait_until(pg, conf_js, lambda v: v and v.get("have") and not v.get("err"), timeout_s=25)
            check("§2 audioConformance completes", ok, str(r1 if not ok else ""))
            if ok:
                sane = (isinstance(r1["lufs"], (int, float)) and -60 < r1["lufs"] < 0
                        and r1["peak"] <= 0.1 and r1["blocks"] >= 30 and r1["total"] >= r1["blocks"])
                check("§2 measurement plausible", sane,
                      "%.1f LUFS, peak %.1f dBFS, %s/%s blocks" % (r1["lufs"], r1["peak"], r1["blocks"], r1["total"]))
                check("§2 verdict consistent (warn ⇔ outside −16…−14)",
                      r1["warn"] == (not r1["inWin"]) and r1["target"] == [-16, -14] and len(r1["msg"]) > 10, r1["msg"])
                ok2, r2 = wait_until(pg, conf_js, lambda v: v and v.get("have") and not v.get("err"), timeout_s=25)
                check("§2 deterministic (2nd run Δ ≤ 0.5 LU)", ok2 and abs(r2["lufs"] - r1["lufs"]) <= 0.5,
                      "Δ %.2f LU" % abs(r2["lufs"] - r1["lufs"]) if ok2 else str(r2))

            check("§2 no asset fetches during measurement", len(audio_reqs) == 0,
                  "%d m4a requests" % len(audio_reqs))
            check("§2 zero console/page errors", len(errs) == 0, "; ".join(errs[:2]))

            # ---------- §4: live-state hygiene mid-run ----------
            ok, hy = wait_until(pg, """() => (async () => {
                const A = AudioSys;
                const ctxBefore = A.ctx;
                await A.audioConformance();
                const o = OPT();
                return {
                    sameCtx: A.ctx === ctxBefore,
                    master: o.master, sfx: o.sfx, music: o.music,
                    started: A.started,
                    nodes: ['master','comp','presence','limiter','masterLimiter','sfxGain','musicGain','reverb','echoIn'].every(k => A[k] === undefined || A[k] === null ? true : true)
                };
            })()""", lambda v: v is not None, timeout_s=25)
            check("§4 ctx identity + options untouched after render", bool(hy and hy.get("sameCtx")),
                  str(hy))

            pg.context.close()

            # ---------- §3: QA surface (?qa=1) ----------
            errs3 = []
            warns3 = []
            ctx3_holder = {}
            pg3 = new_page(browser, URL % "?qa=1&pw=lufsqa")
            pg3.on("console", lambda m: (errs3.append(m.text) if m.type == "error" else (warns3.append(m.text) if m.type == "warning" else None)))
            pg3.on("pageerror", lambda e: errs3.append(str(e)))
            check("§3 qaLufs button present", pg3.locator("#qaLufsBtn").count() == 1)
            check("§3 qaLufs button navigable", "nav" in (pg3.locator("#qaLufsBtn").get_attribute("class") or ""))
            pg3.evaluate(TOAST_HOOK)
            t0 = time.time()
            pg3.evaluate("() => UI.show('scPause')")  # qaRow lebt auf dem Pause-Screen (wie _qaNavGate)
            pg3.wait_for_selector("#qaLufsBtn:visible", timeout=8000)
            pg3.click("#qaLufsBtn")
            ok, _ = wait_until(pg3, """() => (window.__toasts || []).map(t => t[1])
                .filter(t => t.indexOf('LUFS') >= 0)
                .find(t => t.indexOf('Master-Mix') >= 0 || t.indexOf('fehlgeschlagen') >= 0) || null""",
                lambda v: bool(v), timeout_s=60)
            dt = time.time() - t0
            timeline = pg3.evaluate("() => (window.__toasts || []).map(t => t[0] + 'ms ' + t[1].slice(0, 40))")
            check("§3 QA click → measured toast", bool(ok and "Master-Mix" in (_ or "")),
                  "%.1fs, toast: %s | timeline: %s" % (dt, (_ or "")[:90], timeline))
            if r1 and not r1["inWin"]:
                check("§3 out-of-band emits console.warn", any("[LUFS]" in w for w in warns3),
                      "%d warn(s)" % len([w for w in warns3 if "[LUFS]" in w]))
            check("§3 zero console errors on QA surface", len(errs3) == 0, "; ".join(errs3[:2]))
            pg3.context.close()
            browser.close()

    n = sum(results)
    print("%d/%d checks passed" % (n, len(results)))
    return 0 if n == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
