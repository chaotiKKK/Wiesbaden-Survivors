"""Locked-60 A/B: linear vs quadratic squash recovery, stepped at exactly 1/60 s.

Temporary analysis rig. It uses the real `Game.update(1/60)` path on an isolated
wave-20 boss, samples at fixed frame boundaries, and renders the same time-aligned
boss frames with the verified offscreen renderer from `_squash-stills.py`.

Output:
  docs/pw/squash-ab-60.json
  (rendered comparison frames go to a temporary directory)
"""
import base64
import importlib.util
import json
import os
import statistics
import sys
import tempfile
from datetime import date

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_PATH = os.path.join(ROOT, "docs", "pw", "squash-ab-60.json")
OLD_PATH = os.path.join(ROOT, "docs", "pw", "squash-ab.json")
OLD_LIVE_PATH = os.path.join(ROOT, "docs", "pw", "squash-stills", "live.json")
PORT = 8982
BASE = "http://127.0.0.1:%d/index.html?qa=1&pw=squash-ab60" % PORT
PEAK = 0.55
DT = 1.0 / 60.0
STEPS = 12
MODES = (("linear", 0), ("eased", 1))
RUNS = 3
WINDOW_MS = 260.0


def load_stills():
    path = os.path.join(ROOT, "tools", "_squash-stills.py")
    spec = importlib.util.spec_from_file_location("_squash_stills", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


STILLS = load_stills()
SETUP_JS = STILLS.SETUP_JS
RENDER_JS = """([squash, ease, p]) => {
  const b = window.__squashStill.b;
  b.x = 0; b.y = 0; b.squashAng = 0;
  return (%s)([squash, ease, p]);
}""" % STILLS.render_js()

SAMPLE_JS = """(ease) => {
  const G = Game, b = window.__squashStill.b, p = G.players[0];
  G.state = 'paused';
  G.squashEase = ease;
  G.qaGod = true;
  G.time = 1.0; G.timeScale = 1; G.hitstop = 0; G.speedMul = 1; G.speedBase = 1;
  G.waveTimer = 9999; G.waveDuration = 9999; G.waveEnding = false;
  G.spawnQueue = []; G.hazObjs = []; G.pickups = []; G.powerups = [];
  G.runes = []; G.petDrops = [];
  if (G.level) G.level.hazards = [];
  G.enemies = [b];
  Projectiles.clear(); EnemyBullets.clear(); FX.clear();
  p.x = 500; p.y = -300; p.vx = p.vy = 0; p.invuln = 30;
  p.weapons.length = 0; p.turrets.length = 0; p.pet = null;
  b.x = 0; b.y = 0; b.hp = 1e9; b.dead = false; b.deathHandled = false; b.deathAnim = 0;
  b.spd = 0; b.dmg = 0; b.contactCd = 999; b.attackCd = 999; b.shotCd = 999;
  b.stun = 0; b.freezeT = 0; b.shockT = 0; b.slowT = 0; b.burnT = 0; b.poisonT = 0;
  b.charmT = 0; b.hitFlash = 0; b.hitFlashMax = 0; b.hitFlashVis = 0;
  b.squash = 0; b.squash0 = 0; b.squashT = 0; b.squashAng = 0;
  b.spawnScale = 1; b.phaseIdx = 0; b.coreOpen = false; b.elite = false;
  b.target = { x: 0, y: -100 };

  b.hurt(200000, true, p, 'shot');
  const peak = b.squash0;
  const out = [];
  const rec = (step) => {
    const q = b.squashT * 3.2 / Math.max(.0001, b.squash0);
    out.push({
      step: step,
      t: step * 1000 / 60,
      squash: b.squash,
      squashT: b.squashT,
      p: q
    });
  };
  rec(0);
  for (let i = 1; i <= 12; i++) {
    G.update(1 / 60);
    rec(i);
  }
  G.squashEase = 2; G.state = 'paused';
  return { peak: peak, samples: out, boss: b.boss ? b.boss.name : null };
}"""


def stats(samples, peak):
    frames = [s for s in samples if s["step"] >= 1]
    visible = [f for f in frames if f["squash"] > 0.0005]
    first = frames[0]["squash"]
    half = next((f["t"] for f in frames if f["squash"] <= peak / 2), None)
    # Match tools/_squash-ab.py: integrate from the first post-impact sample,
    # not from the impact frame at t=0. The old rAF samples had no t=0 row.
    area = 0.0
    for i in range(1, len(samples) - 1):
        a, b = samples[i], samples[i + 1]
        if a["t"] >= WINDOW_MS:
            break
        t1 = min(b["t"], WINDOW_MS)
        area += (a["squash"] + b["squash"]) / 2 * (t1 - a["t"])
    def at(ms):
        return min(frames, key=lambda f: abs(f["t"] - ms))["squash"]
    return {
        "first_sample": round(first, 6),
        "frames_visible": len(visible),
        "duration_ms": round(visible[-1]["t"], 1) if visible else 0.0,
        "half_ms": round(half, 1) if half is not None else None,
        "area_260ms": round(area, 2),
        "at_50ms": round(at(50), 6),
        "at_100ms": round(at(100), 6),
        "at_150ms": round(at(150), 6),
        "peak": round(peak, 6),
        "dur_target_ms": round(peak / 3.2 * 1000, 1),
    }


def decode(data_url, path):
    head = "data:image/png;base64,"
    if not data_url.startswith(head):
        raise RuntimeError("unexpected canvas payload")
    with open(path, "wb") as fh:
        fh.write(base64.b64decode(data_url[len(head):]))


def diff_pixels(a_path, b_path):
    a = Image.open(a_path).convert("RGBA")
    b = Image.open(b_path).convert("RGBA")
    if a.size != b.size:
        raise RuntimeError("render size mismatch")
    diff = ImageChops.difference(a, b)
    count = 0
    max_delta = 0
    for px in diff.getdata():
        d = max(px)
        if d:
            count += 1
            max_delta = max(max_delta, d)
    return {"pixels": count, "max_delta": max_delta, "bbox": diff.getbbox()}


def med(runs, key):
    vals = sorted(r[key] for r in runs if r[key] is not None)
    return statistics.median(vals) if vals else None


def continuous_stats(samples, peak):
    """Interpolated values including the exact impact point, matching the live
    43-58 fps summary (`summarize` in tools/_squash-live.py)."""
    pts = [(0.0, peak)] + [(s["t"], s["squash"]) for s in samples]
    half = None
    for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
        if v0 >= peak / 2 and v1 <= peak / 2 and v1 != v0:
            half = t0 + (v0 - peak / 2) * (t1 - t0) / (v0 - v1)
            break
    area = 0.0
    for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
        if t0 >= WINDOW_MS:
            break
        t1 = min(t1, WINDOW_MS)
        area += (v0 + v1) / 2 * (t1 - t0)
    return {
        "half_ms": round(half, 1) if half is not None else None,
        "area_260ms": round(area, 2),
    }


def old_summary():
    with open(OLD_PATH, encoding="utf-8") as fh:
        old = json.load(fh)
    out = {}
    for label in ("linear", "eased"):
        runs = old[label]["runs"]
        out[label] = {
            "runs": [
                {k: r[k] for k in ("fps", "first_sample", "frames_visible", "duration_ms",
                                   "half_ms", "area_260ms")}
                for r in runs
            ],
            "median": {
                k: med(runs, k)
                for k in ("fps", "first_sample", "frames_visible", "duration_ms",
                          "half_ms", "area_260ms")
            },
        }
    out["half_gap_ms"] = round(out["linear"]["median"]["half_ms"] - out["eased"]["median"]["half_ms"], 1)
    out["area_gap"] = round(out["linear"]["median"]["area_260ms"] - out["eased"]["median"]["area_260ms"], 2)
    out["first_gap"] = round(out["linear"]["median"]["first_sample"] - out["eased"]["median"]["first_sample"], 6)
    return out


def old_live_summary():
    with open(OLD_LIVE_PATH, encoding="utf-8") as fh:
        old = json.load(fh)
    out = {}
    for label in ("linear", "eased"):
        out[label] = {
            "runs": [
                {k: r[k] for k in ("half_ms", "area_260ms", "last_positive_ms",
                                   "first_zero_ms", "frames")}
                for r in old["recovery"][label]["runs"]
            ],
            "median": {
                k: old["recovery"][label]["median"][k]
                for k in ("half_ms", "area_260ms", "last_positive_ms", "first_zero_ms", "frames")
            },
        }
    out["half_gap_ms"] = round(out["linear"]["median"]["half_ms"] - out["eased"]["median"]["half_ms"], 1)
    out["area_gap"] = round(out["linear"]["median"]["area_260ms"] - out["eased"]["median"]["area_260ms"], 2)
    return out


def main():
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    errors = []
    setup = None
    all_runs = {}
    rendered = {}
    tmp = tempfile.mkdtemp(prefix="squash60-")

    with Serve(PORT):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=[
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows",
            ])
            page = new_page(browser, BASE, console_errors=errors)
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
            }""")
            page.wait_for_timeout(900)
            setup = page.evaluate(SETUP_JS)
            if not setup:
                raise RuntimeError("could not create the fixed boss")
            page.evaluate("() => { Game.state = 'paused'; }")
            print("setup:", setup)

            for label, ease in MODES:
                runs = []
                samples_by_run = []
                first = None
                for run in range(RUNS):
                    data = page.evaluate(SAMPLE_JS, ease)
                    if first is None:
                        first = data
                    samples_by_run.append(data["samples"])
                    runs.append(stats(data["samples"], data["peak"]))
                    print(label, "run", run + 1, json.dumps(runs[-1]))
                sigs = {tuple(round(s["squash"], 12) for s in row) for row in samples_by_run}
                all_runs[label] = {
                    "ease": ease,
                    "runs": runs,
                    "samples": first["samples"],
                    "repeatable": len(sigs) == 1,
                    "repeat_signature_count": len(sigs),
                }
                rendered[label] = []
                for sample in first["samples"]:
                    path = os.path.join(tmp, "%s-%02d.png" % (label, sample["step"]))
                    payload = page.evaluate(RENDER_JS, [sample["squash"], ease, sample["p"]])
                    decode(payload, path)
                    rendered[label].append((sample, path))
            page.evaluate("() => { Game.squashEase = 2; Game.state = 'paused'; }")
            browser.close()

    for label in ("linear", "eased"):
        runs = all_runs[label]["runs"]
        all_runs[label]["median"] = {
            k: med(runs, k)
            for k in ("first_sample", "frames_visible", "duration_ms", "half_ms",
                      "area_260ms", "at_50ms", "at_100ms", "at_150ms", "peak")
        }
    new_half_gap = round(all_runs["linear"]["median"]["half_ms"] - all_runs["eased"]["median"]["half_ms"], 1)
    new_area_gap = round(all_runs["linear"]["median"]["area_260ms"] - all_runs["eased"]["median"]["area_260ms"], 2)
    new_first_gap = round(all_runs["linear"]["median"]["first_sample"] - all_runs["eased"]["median"]["first_sample"], 6)
    new_cont = {
        label: continuous_stats(all_runs[label]["samples"], PEAK)
        for label in ("linear", "eased")
    }
    new_cont_half_gap = round(new_cont["linear"]["half_ms"] - new_cont["eased"]["half_ms"], 1)
    new_cont_area_gap = round(new_cont["linear"]["area_260ms"] - new_cont["eased"]["area_260ms"], 2)

    pixel_rows = []
    for i in range(STEPS + 1):
        a = rendered["linear"][i]
        b = rendered["eased"][i]
        d = diff_pixels(a[1], b[1])
        pixel_rows.append({
            "step": i,
            "t_ms": round(i * 1000 / 60, 1),
            "linear_squash": round(a[0]["squash"], 6),
            "eased_squash": round(b[0]["squash"], 6),
            "pixels": d["pixels"],
            "max_delta": d["max_delta"],
            "bbox": d["bbox"],
        })
    max_diff = max(pixel_rows, key=lambda r: r["pixels"])

    old = old_summary()
    old_live = old_live_summary()
    canvas_px = 470 * 300
    still_readable = max_diff["pixels"] >= canvas_px * 0.05
    result = {
        "date": date.today().isoformat(),
        "boss": setup,
        "method": {
            "step": "Game.update(1/60), 12 steps, boss isolated, wave timer frozen",
            "sampling": "frame boundaries after each update; t = step * 1000 / 60",
            "metrics": "frame-grid stats match tools/_squash-ab.py; continuous stats include t=0 and interpolate the half crossing",
            "pixels": "verified offscreen boss render from tools/_squash-stills.py at each time step; same boss pose, hitFlash 0",
            "caveat": "60 Hz simulation, not a GPU frame-time capture; rAF presentation is not part of this measurement",
        },
        "peak": PEAK,
        "duration_ms": round(PEAK / 3.2 * 1000, 2),
        "dt_ms": round(DT * 1000, 4),
        "runs_per_mode": RUNS,
        "new_60": all_runs,
        "new_60_continuous": new_cont,
        "new_frame_gaps": {
            "half_ms": new_half_gap,
            "area_260ms": new_area_gap,
            "first_sample": new_first_gap,
        },
        "new_continuous_gaps": {
            "half_ms": new_cont_half_gap,
            "area_260ms": new_cont_area_gap,
        },
        "old_rAF_49_59": old,
        "old_rAF_gaps": {
            "half_ms": old["half_gap_ms"],
            "area_260ms": old["area_gap"],
            "first_sample": old["first_gap"],
        },
        "old_live_43_58": old_live,
        "old_live_gaps": {
            "half_ms": old_live["half_gap_ms"],
            "area_260ms": old_live["area_gap"],
        },
        "pixel_diff_same_time": pixel_rows,
        "pixel_max": max_diff,
        "pixel_canvas_px": canvas_px,
        "pixel_max_fraction": round(max_diff["pixels"] / canvas_px, 4),
        "console_errors": errors,
        "verdict": {
            "half_gap_vs_live_43_58": new_cont_half_gap > old_live["half_gap_ms"] + 1.0,
            "area_gap_vs_live_43_58": new_cont_area_gap > old_live["area_gap"] + 1.0,
            "half_gap_vs_old_rAF": new_half_gap > old["half_gap_ms"] + 1.0,
            "area_gap_vs_old_rAF": new_area_gap > old["area_gap"] + 1.0,
            "more_visible_than_old_sampling": any((
                new_cont_half_gap > old_live["half_gap_ms"] + 1.0,
                new_cont_area_gap > old_live["area_gap"] + 1.0,
                new_half_gap > old["half_gap_ms"] + 1.0,
                new_area_gap > old["area_gap"] + 1.0,
            )),
            "difference_still_readable": still_readable,
            "visible_frames_same": all_runs["linear"]["median"]["frames_visible"] == all_runs["eased"]["median"]["frames_visible"],
            "last_positive_same": all_runs["linear"]["median"]["duration_ms"] == all_runs["eased"]["median"]["duration_ms"],
        },
    }
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2, ensure_ascii=False)

    print("\nRESULT 60 Hz")
    for label in ("linear", "eased"):
        m = all_runs[label]["median"]
        print("  %-6s first %.4f  visible %d  duration %.1f ms  half %.1f ms  area %.2f  50/100/150 ms %.4f/%.4f/%.4f" % (
            label, m["first_sample"], m["frames_visible"], m["duration_ms"],
            m["half_ms"], m["area_260ms"], m["at_50ms"], m["at_100ms"], m["at_150ms"]))
    print("  frame-grid gap: half %.1f ms (old rAF %.1f), area %.2f (old %.2f), first %.4f (old %.4f)" % (
        new_half_gap, old["half_gap_ms"], new_area_gap, old["area_gap"],
        new_first_gap, old["first_gap"]))
    print("  continuous gap: half %.1f ms (live 43-58 %.1f), area %.2f (live %.2f)" % (
        new_cont_half_gap, old_live["half_gap_ms"], new_cont_area_gap, old_live["area_gap"]))
    print("  pixel diff max at t=%.0f ms: %d px (%.1f%%), max delta %d, bbox %s" % (
        max_diff["t_ms"], max_diff["pixels"], 100.0 * max_diff["pixels"] / canvas_px,
        max_diff["max_delta"], max_diff["bbox"]))
    print("  console errors:", errors)
    print("  json:", OUT_PATH)
    print("  verdict:", json.dumps(result["verdict"]))
    return 0 if not errors and all_runs["linear"]["repeatable"] and all_runs["eased"]["repeatable"] else 1


if __name__ == "__main__":
    sys.exit(main())
