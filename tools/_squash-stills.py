"""Fair still comparison: linear vs eased squash at identical squash values.

The recovery curve changes only *when* a given squash value is reached. This rig
therefore pins the boss, target direction, `hitFlash`, spawn scale and render
time, then renders each mode independently with the same squash value per row.
The time stamps come from the production formula (`squashT / (peak / 3.2)`) and
`impactRecovery`, so the sheet shows the timing difference without letting frame
jitter dictate the comparison.

Outputs:
  docs/pw/squash-stills/linear-*.png
  docs/pw/squash-stills/eased-*.png
  docs/pw/squash-stills/stills.json
  docs/pw/squash-stills/contact-sheet.png

Run:
  eval "$(bash tools/setup-browser.sh --env)"
  "$HOME/pwenv/bin/python" tools/_squash-stills.py
"""
import base64
import hashlib
import json
import math
import os
import sys
from datetime import date

from PIL import Image, ImageChops, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_DIR = os.path.join(ROOT, "docs", "pw", "squash-stills")
SHEET_PATH = os.path.join(OUT_DIR, "contact-sheet.png")
META_PATH = os.path.join(OUT_DIR, "stills.json")
LIVE_META = os.path.join(OUT_DIR, "live.json")
PORT = 8979
BASE = "http://127.0.0.1:%d/index.html?qa=1&pw=squash-stills" % PORT

PEAK = 0.55
BOSS_ID = "kurhaus"
FRACTIONS = [1.0, 0.8, 0.6, 0.4, 0.2]
MODES = [("linear", 0), ("eased", 1)]
DURATION_S = PEAK / 3.2
CELL_W, CELL_H = 470, 300
LABEL_H = 48
ROW_GAP = 16
MARGIN = 28
COL_GAP = 28
HEADER_H = 166
FOOTER_H = 156

BG = (10, 14, 20)
PANEL = (20, 26, 35)
PANEL_2 = (16, 22, 30)
LINE = (44, 55, 69)
TEXT = (234, 240, 247)
MUTED = (139, 152, 168)
CYAN = (89, 230, 255)
MAGENTA = (201, 107, 224)
GREEN = (122, 232, 161)
YELLOW = (255, 226, 122)
WHITE = (255, 255, 255)

FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
]
BOLD_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]
try:
    import matplotlib
    _MPL_FONTS = os.path.join(matplotlib.get_data_path(), "fonts", "ttf")
    FONT_PATHS.append(os.path.join(_MPL_FONTS, "DejaVuSans.ttf"))
    BOLD_PATHS.append(os.path.join(_MPL_FONTS, "DejaVuSans-Bold.ttf"))
except Exception:
    pass


def font(size, bold=False):
    for path in BOLD_PATHS if bold else FONT_PATHS:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


F_EYEBROW = font(12, True)
F_TITLE = font(31, True)
F_SUB = font(14)
F_COL = font(17, True)
F_COL_SUB = font(11)
F_ROW = font(11, True)
F_VALUE = font(16, True)
F_TIME = font(13)
F_FOOT_H = font(13, True)
F_FOOT = font(11)
F_FOOT_B = font(11, True)


def set_cell_bg(size):
    """Flat, neutral panel with a soft floor pool; no arena detail to distract."""
    w, h = size
    im = Image.new("RGB", size, PANEL)
    px = im.load()
    for y in range(h):
        for x in range(w):
            # Weak radial light behind the boss, fading into the panel.
            dx = (x - w / 2) / (w * 0.58)
            dy = (y - h * 0.56) / (h * 0.55)
            light = max(0.0, 1.0 - math.sqrt(dx * dx + dy * dy)) ** 2
            px[x, y] = tuple(
                int(PANEL[i] + (PANEL_2[i] - PANEL[i]) * light)
                for i in range(3)
            )
    d = ImageDraw.Draw(im)
    # Same fixed ground cue in every cell; the boss shadow sits on this line.
    floor_y = 231
    d.line((18, floor_y, w - 18, floor_y), fill=(37, 47, 59), width=1)
    return im


def render_js():
    return """([squash, ease, p]) => {
  const G = Game, b = window.__squashStill.b;
  G.squashEase = ease;
  const peak = 0.55;
  const expected = peak * impactRecovery(p);
  if (Math.abs(expected - squash) > 1e-9) {
    throw new Error('curve/time mismatch: ' + expected + ' vs ' + squash);
  }
  b.squash0 = peak;
  b.squash = squash;          // forced identical value for both modes
  b.squashT = p * peak / 3.2;
  b.hitFlash = 0;
  b.squashAng = 0;
  b.spawnScale = 1;
  b.phaseIdx = 0;
  b.coreOpen = false;
  b.elite = false;
  b.target = { x: 0, y: -100 };

  const W = 470, H = 300, S = 1.8, PIVOT_Y = 185;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, PIVOT_Y);
  ctx.scale(S, S);

  // Enemy.draw's shadow is drawn before the squash; keep the same ground cue.
  ctx.fillStyle = 'rgba(0,0,0,.38)';
  ctx.beginPath();
  ctx.ellipse(0, b.r * .55, b.r * .95, b.r * .42, 0, 0, TAU);
  ctx.fill();

  // The target sits above the boss, so this is the same rotation as in-game.
  const ang = Math.atan2(b.target.y - b.y, b.target.x - b.x);
  ctx.rotate(ang + Math.PI / 2);
  const rel = b.squashAng - ang - Math.PI / 2;
  ctx.rotate(rel);
  ctx.scale(1 + b.squash * .55, 1 - b.squash * .42);
  ctx.rotate(-rel);
  drawBossBody(ctx, b, b.r, 1.0, b.col);
  ctx.restore();

  /* Game.drawShadows() is a separate world-space layer, drawn after the
     body. The live frame includes it; omitting it made the live silhouette
     20 px taller at the feet. No FX.lights is present in the QA scene, so
     the production no-light branch is the exact one to mirror. */
  ctx.save();
  ctx.translate(W / 2, PIVOT_Y);
  ctx.scale(S, S);
  ctx.globalAlpha = .3;
  ctx.fillStyle = '#05070d';
  const sr = b.r * .9, slen = sr * 1.5;
  ctx.rotate(Math.PI / 2);
  ctx.beginPath();
  ctx.ellipse(slen * .35, 0, slen * .55, sr * .5, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  return c.toDataURL('image/png');
}"""


SETUP_JS = """() => {
  const G = Game;
  G.qaGod = true;
  G.state = 'play';
  G.squashEase = 0;
  G.time = 1.0;
  if (G.qaGo) G.qaGo(20); else G.startWave(20);
  G.enemies.length = 0;
  G.enemyPool.length = 0;
  const B = BOSSES.find(x => x.id === 'kurhaus');
  const b = new Enemy().spawn(B, 0, 0, 20, B);
  b.hp = b.maxHp;
  b.spawnScale = 1;
  b.hitFlash = 0;
  b.squashAng = 0;
  b.squash = 0;
  b.squashT = 0;
  b.phaseIdx = 0;
  b.coreOpen = false;
  b.elite = false;
  b.charmT = 0;
  b.burnT = 0;
  b.poisonT = 0;
  b.slowT = 0;
  b.stun = 0;
  b.freezeT = 0;
  b.shockT = 0;
  b.target = { x: 0, y: -100 };
  window.__squashStill = { b: b, B: B };
  return { boss: B.name, id: B.id, r: b.r, color: b.col, maxHp: b.maxHp };
}"""


def curve_time_ms(fraction, ease):
    """Time from impact to the given fraction of the peak, production curve."""
    if ease:
        p = math.sqrt(fraction)
    else:
        p = fraction
    return (1.0 - p) * DURATION_S * 1000.0


def decode_png(data_url, path):
    head = "data:image/png;base64,"
    if not data_url.startswith(head):
        raise RuntimeError("unexpected canvas payload")
    raw = base64.b64decode(data_url[len(head):])
    with open(path, "wb") as fh:
        fh.write(raw)
    return hashlib.sha256(raw).hexdigest()


def image_diff_pixels(a_path, b_path):
    a = Image.open(a_path).convert("RGBA")
    b = Image.open(b_path).convert("RGBA")
    if a.size != b.size:
        raise RuntimeError("size mismatch %s vs %s" % (a.size, b.size))
    diff = ImageChops.difference(a, b)
    bbox = diff.getbbox()
    count = 0
    max_delta = 0
    data = diff.get_flattened_data() if hasattr(diff, "get_flattened_data") else diff.getdata()
    for px in data:
        delta = max(px)
        if delta:
            count += 1
            max_delta = max(max_delta, delta)
    return count, max_delta, bbox


def build_sheet(rows, setup, console_errors, live=None):
    width = MARGIN * 2 + CELL_W * 2 + COL_GAP
    row_h = CELL_H + LABEL_H
    height = HEADER_H + len(rows) * row_h + (len(rows) - 1) * ROW_GAP + FOOTER_H
    sheet = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(sheet)

    # Header -----------------------------------------------------------------
    d.text((MARGIN, 22), "WIESBADEN SURVIVORS · HIT-FEEDBACK", font=F_EYEBROW, fill=CYAN)
    d.text((MARGIN, 40), "SQUASH A/B · GLEICHE FORM, ANDERE ZEIT", font=F_TITLE, fill=TEXT)
    live_ok = bool(live and live.get("verification", {}).get("ok"))
    if live_ok:
        v = live["verification"]
        badge = "LIVE %d/%d" % (v["matched"], len(v["values"]))
        bw = int(d.textlength(badge, font=F_ROW)) + 22
        d.rounded_rectangle((width - MARGIN - bw, 22, width - MARGIN, 41), radius=9, fill=(12, 34, 24))
        d.text((width - MARGIN - bw + 11, 26), badge, font=F_ROW, fill=GREEN)
    d.text(
        (MARGIN, 80),
        "Linear vs quadratisch bei identischem squash-Wert; Shipping ist kubisch, Boss still, hitFlash 0.",
        font=F_SUB,
        fill=MUTED,
    )
    d.text(
        (MARGIN, 100),
        "Jede Zeile ist ein eigener Render je Modus. Die Form muss gleich sein; nur der Zeitpunkt darf sich unterscheiden.",
        font=F_FOOT,
        fill=MUTED,
    )
    d.line((MARGIN, 122, width - MARGIN, 122), fill=LINE, width=1)
    d.rectangle((MARGIN, 122, MARGIN + 64, 124), fill=CYAN)
    d.rectangle((MARGIN + 64, 122, MARGIN + 128, 124), fill=MAGENTA)

    col_x = [MARGIN, MARGIN + CELL_W + COL_GAP]
    for i, (name, ease) in enumerate(MODES):
        x = col_x[i]
        accent = CYAN if ease == 0 else MAGENTA
        d.text((x, 132), name.upper(), font=F_COL, fill=accent)
        sub = "squashEase = 0 · gleichmäßig" if ease == 0 else "squashEase = 1 · quadratisch"
        d.text((x + 88, 136), sub, font=F_COL_SUB, fill=MUTED)
        d.text((x, 151), "gleicher squash-Wert", font=F_COL_SUB, fill=MUTED)

    # Rows -------------------------------------------------------------------
    for ri, row in enumerate(rows):
        y = HEADER_H + ri * (row_h + ROW_GAP)
        for ci, (name, ease) in enumerate(MODES):
            x = col_x[ci]
            accent = CYAN if ease == 0 else MAGENTA
            cell = set_cell_bg((CELL_W, CELL_H))
            img_path = row[name]["png"]
            still = Image.open(os.path.join(ROOT, img_path)).convert("RGBA")
            still = still.resize((CELL_W, CELL_H), Image.Resampling.LANCZOS)
            cell.paste(still, (0, 0), still)
            cd = ImageDraw.Draw(cell)
            # Row/fraction badge is deliberately tiny and outside the silhouette.
            frac = "%d %% PEAK" % round(row["fraction"] * 100)
            badge_w = int(cd.textlength(frac, font=F_ROW)) + 16
            cd.rounded_rectangle((10, 10, 10 + badge_w, 27), radius=8, fill=(8, 12, 18))
            cd.text((18, 14), frac, font=F_ROW, fill=accent)

            sheet.paste(cell, (x, y))
            d.rectangle((x, y, x + CELL_W - 1, y + CELL_H - 1), outline=LINE, width=1)
            d.rectangle((x, y, x + 3, y + CELL_H + LABEL_H - 1), fill=accent)

            # Label bar: the value is identical in both columns; the time is not.
            bar_y = y + CELL_H
            d.rectangle((x, bar_y, x + CELL_W - 1, bar_y + LABEL_H - 1), fill=PANEL_2)
            d.line((x, bar_y, x + CELL_W, bar_y), fill=LINE, width=1)
            d.text((x + 14, bar_y + 13), "squash %.3f" % row["squash"], font=F_VALUE, fill=TEXT)
            t_ms = row[name]["t_ms"]
            t_text = "t = %d ms" % round(t_ms)
            tw = d.textlength(t_text, font=F_TIME)
            d.text((x + CELL_W - 14 - tw, bar_y + 15), t_text, font=F_TIME, fill=accent)
            d.text((x + 14, bar_y + 31), "Zeit bis zu diesem Wert", font=F_FOOT, fill=MUTED)

    # Footer -----------------------------------------------------------------
    footer_y = height - FOOTER_H + 6
    d.line((MARGIN, footer_y, width - MARGIN, footer_y), fill=LINE, width=1)
    diff_text = "%d/%d Paare pixelgleich · %d abweichende Pixel · max Δ %d" % (
        sum(1 for r in rows if r["diff"]["pixels"] == 0),
        len(rows),
        sum(r["diff"]["pixels"] for r in rows),
        max(r["diff"]["max_delta"] for r in rows),
    )
    d.rounded_rectangle((MARGIN, footer_y + 14, MARGIN + 16, footer_y + 30), radius=4, fill=GREEN)
    d.text((MARGIN + 26, footer_y + 15), "FORM-CHECK", font=F_FOOT_H, fill=GREEN)
    d.text((MARGIN + 124, footer_y + 17), diff_text, font=F_FOOT, fill=TEXT)
    d.text(
        (MARGIN, footer_y + 40),
        "Halbwert (50 % Reststauchung): linear 86 ms · quadratisch 50 ms. Beide starten bei 0,55 und enden nach 172 ms.",
        font=F_FOOT,
        fill=MUTED,
    )
    d.text(
        (MARGIN, footer_y + 58),
        "Methode: drawBossBody, 470×300 @ 1,8×, Boss fixiert, Game.time = 1,0, keine Kamera/HUD/Partikel.",
        font=F_FOOT,
        fill=MUTED,
    )
    if live_ok:
        v = live["verification"]
        rec = live.get("recovery", {})
        em = rec.get("eased", {}).get("median", {})
        cm = rec.get("cubic", {}).get("median", {})
        lm = rec.get("linear", {}).get("median", {})
        d.text((MARGIN, footer_y + 76),
               "LIVE: %d/%d silhouette matches · bbox Δ ≤%d px · area Δ ≤%.2f%% · %d mismatch px"% (
                   v["matched"], len(v["values"]), v["max_bbox_delta"], v["max_area_delta_pct"], v["total_mismatch_px"]),
               font=F_FOOT, fill=GREEN)
        if cm:
            d.text((MARGIN, footer_y + 94),
                   "Live-Recovery (n=5): quadratisch %s ms / kubisch %s ms · Fläche 0–260 ms %.2f / %.2f · kubisch shipping"% (
                       em.get("half_ms"), cm.get("half_ms"), em.get("area_260ms"), cm.get("area_260ms")), font=F_FOOT, fill=YELLOW)
        else:
            d.text((MARGIN, footer_y + 94),
                   "Live-Recovery (n=5): eased half %s ms / linear %s ms · area 0–260 ms %.2f / %.2f · Game.drawShadows included"% (
                       em.get("half_ms"), lm.get("half_ms"), em.get("area_260ms"), lm.get("area_260ms")), font=F_FOOT, fill=YELLOW)
    else:
        d.text(
            (MARGIN, footer_y + 76),
            "Grenze: Still-Vergleich der Form. Die Bewegung/Timing-Kurve zeigt sich in den Zeitwerten, nicht als Animation.",
            font=F_FOOT,
            fill=MUTED,
        )
    d.text(
        (MARGIN, height - 24),
        "%s · %s · Peak %.2f · T = %.1f ms" % (setup["boss"], date.today().isoformat(), PEAK, DURATION_S * 1000),
        font=F_FOOT,
        fill=MUTED,
    )
    if console_errors:
        d.text((width - MARGIN - 180, height - 24), "console errors: %d" % len(console_errors), font=F_FOOT, fill=MAGENTA)
    else:
        d.text((width - MARGIN - 138, height - 24), "console errors: 0", font=F_FOOT, fill=GREEN)
    sheet.save(SHEET_PATH)
    return sheet.size


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    rows = []
    errors = []
    setup = None

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
            page.wait_for_timeout(1000)
            setup = page.evaluate(SETUP_JS)
            if not setup:
                raise RuntimeError("could not create the fixed boss")
            print("setup:", setup)
            render = render_js()

            for fraction in FRACTIONS:
                squash = round(PEAK * fraction, 6)
                row = {"fraction": fraction, "squash": squash}
                for name, ease in MODES:
                    p = math.sqrt(fraction) if ease else fraction
                    t_ms = curve_time_ms(fraction, ease)
                    expected_png = os.path.join(OUT_DIR, "%s-%03d.png" % (name, round(fraction * 100)))
                    data = page.evaluate(render, [squash, ease, p])
                    sha = decode_png(data, expected_png)
                    row[name] = {
                        "t_ms": round(t_ms, 2),
                        "png": os.path.relpath(expected_png, ROOT).replace(os.sep, "/"),
                        "sha256": sha,
                    }
                    print("%s frac %.2f squash %.3f t %.1f ms -> %s" % (
                        name, fraction, squash, t_ms, os.path.basename(expected_png)))
                a = row["linear"]["png"]
                b = row["eased"]["png"]
                count, max_delta, bbox = image_diff_pixels(a, b)
                row["diff"] = {"pixels": count, "max_delta": max_delta, "bbox": bbox}
                print("  diff:", row["diff"])
                rows.append(row)

            browser.close()

    meta = {
        "date": date.today().isoformat(),
        "boss": setup,
        "peak": PEAK,
        "duration_ms": round(DURATION_S * 1000, 2),
        "fractions": FRACTIONS,
        "modes": {name: ease for name, ease in MODES},
        "fixed": {
            "hitFlash": 0,
            "squashAng": 0,
            "gameTime": 1.0,
            "spawnScale": 1,
            "camera": "none (offscreen draw)",
            "cell_px": [CELL_W, CELL_H],
            "scale": 1.8,
            "dynamicShadow": "Game.drawShadows no-light branch, mirrored after the body",
        },
        "curve": {
            "linear": "squash = peak * (1 - t/T)",
            "eased": "squash = peak * (1 - t/T)^2",
        },
        "rows": rows,
        "pixel_identical_pairs": sum(1 for r in rows if r["diff"]["pixels"] == 0),
        "console_errors": errors,
    }
    live = None
    if os.path.exists(LIVE_META):
        try:
            with open(LIVE_META, encoding="utf-8") as fh:
                live = json.load(fh)
        except Exception:
            live = None
    if live:
        v = live.get("verification", {})
        meta["live"] = {
            "date": live.get("date"),
            "ok": bool(v.get("ok")),
            "matched": v.get("matched"),
            "total": len(v.get("values", [])),
            "max_bbox_delta": v.get("max_bbox_delta"),
            "max_area_delta_pct": v.get("max_area_delta_pct"),
            "total_mismatch_px": v.get("total_mismatch_px"),
            "timing": {
                name: (live.get("recovery", {}).get(name, {}) or {}).get("median")
                for name in ("linear", "eased", "cubic")
            },
            "shipped_curve": live.get("shipped_curve"),
        }
    with open(META_PATH, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2, ensure_ascii=False)
    size = build_sheet(rows, setup, errors, live)
    print("sheet:", SHEET_PATH, size)
    print("meta:", META_PATH)
    print("console errors:", errors)
    ok = bool(rows) and meta["pixel_identical_pairs"] == len(rows) and not errors
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
