"""Verify the offscreen squash references against the live renderer.

The boss is pinned in a real wave-20 scene, the camera is fixed at 1.8x, and a
QA-only flag hides the nameplate/HP bar. The body itself still goes through
`Enemy.draw` and the production squash transform. Each live crop is diffed
against the same frame with the boss removed; the resulting silhouette mask is
compared with the offscreen reference.

The second half samples the actual squash values *after* `Game.render()` for
five runs of each curve (linear, quadratic, cubic), so the timings describe
frames that were drawn, not a Python re-implementation.

Run after `tools/_squash-stills.py` (the wrapper does it):
  eval "$(bash tools/setup-browser.sh --env)"
  "$HOME/pwenv/bin/python" tools/_squash-live.py
"""
import base64
import json
import os
import sys
from datetime import date

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont
from playwright.sync_api import sync_playwright

sys.path.insert(0, "tools")
from pw_lib import Serve, new_page, wait_until  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_DIR = os.path.join(ROOT, "docs", "pw", "squash-stills")
REF_META = os.path.join(OUT_DIR, "stills.json")
LIVE_META = os.path.join(OUT_DIR, "live.json")
LIVE_SHEET = os.path.join(OUT_DIR, "live-contact-sheet.png")
TIMING_CHART = os.path.join(OUT_DIR, "live-timing.png")
PORT = 8980
BASE = "http://127.0.0.1:%d/index.html?qa=1&pw=squash-live" % PORT

CELL_W, CELL_H = 470, 300
PIVOT_X, PIVOT_Y = 235, 185
MASK_THRESHOLD = 2
SHIPPED = "cubic"
CURVES = [("linear", 0), ("eased", 1), ("cubic", 2)]
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
F_TITLE = font(29, True)
F_SUB = font(13)
F_COL = font(15, True)
F_ROW = font(11, True)
F_VALUE = font(15, True)
F_SMALL = font(10)
F_FOOT_H = font(13, True)
F_FOOT = font(10.5)


LIVE_SETUP_JS = """() => {
  const G = Game, p = G.players[0];
  G.qaGod = true;
  G.state = 'play';
  if (G.qaGo) G.qaGo(20); else G.startWave(20);
  const B = BOSSES.find(x => x.id === 'kurhaus');
  const b = new Enemy().spawn(B, 0, 0, 20, B);
  /* An empty corner, away from the player/turrets/pets that start mid-arena.
     A small companion at the spawn point otherwise merges into the boss mask. */
  const x = Math.round(G.level.w * .36), y = Math.round(G.level.h * .73);
  b.x = x; b.y = y;
  b.hp = b.maxHp;
  b.spd = 0; b.dmg = 0; b.contactCd = 999;
  b.stun = 0;
  b.spawnScale = 1; b.hitFlash = 0;
  b.squash = 0; b.squash0 = 0; b.squashT = 0; b.squashAng = 0;
  b.phaseIdx = 0; b.coreOpen = false; b.elite = false;
  b.charmT = 0; b.burnT = 0; b.poisonT = 0; b.slowT = 0;
  b.freezeT = 0; b.shockT = 0; b.shieldHit = 0;
  b.bossVariant = null;
  b.target = { x: x, y: y - 100 };
  G.enemies = [b]; G.enemyPool = []; G.spawnQueue = [];
  FX.lights.length = 0;
  if (OPT().lights !== false) OPT().lights = true;
  G.pickups = []; G.powerups = []; G.runes = []; G.petDrops = [];
  G.hazObjs = []; G.splats = [];
  Projectiles.clear(); EnemyBullets.clear(); FX.clear();
  p.x = x + 500; p.y = y - 300; p.vx = p.vy = 0;
  p.invuln = 30; p.alive = true;
  p.weapons.length = 0; p.turrets.length = 0; p.pet = null;
  p.recalc();
  if (Save.data.opts) Save.data.opts.quality = 2;
  G.resize();
  G.state = 'paused';
  UI.show(null);
  const hud = document.getElementById('hud'); if (hud) hud.classList.add('hidden');
  G.time = 1.0; G.timeScale = 1; G.hitstop = 0;
  G.cam.x = x; G.cam.y = y; G.cam.zoom = 1.8;
  G.cam.sx = 0; G.cam.sy = 0; G.cam.lx = 0; G.cam.ly = 0;
  G.cam.trauma = 0; G.cam.shake = 0; G.cam.shakeT = 0; G.cam.punch = 0;
  G.qaSilhouette = true;
  G.buildParallaxPending = true;
  G.render();
  window.__liveBoss = { b: b, B: B };
  return {
    boss: B.name, id: B.id, x: x, y: y, r: b.r,
    maxHp: b.maxHp, hp: b.hp, spawnScale: b.spawnScale,
    coop: G.coop, players: G.players.map(q => ({
      x: q.x, y: q.y, r: q.r, alive: q.alive, pet: !!q.pet,
      turrets: q.turrets.length, char: q.char && q.char.id
    })),
    W: G.W, H: G.H, dpr: G.dpr, quality: G.quality(),
    crop: [Math.round(G.W / 2 - 235), Math.round(G.H / 2 - 185), 470, 300]
  };
}"""

LIVE_CAPTURE_JS = """(squash) => {
  const G = Game, b = window.__liveBoss.b;
  G.state = 'paused';
  G.qaSilhouette = true;
  b.hp = b.maxHp;
  b.hitFlash = 0; b.spawnScale = 1;
  b.squash0 = 0.55; b.squash = squash; b.squashT = 0;
  b.squashAng = 0; b.phaseIdx = 0; b.coreOpen = false;
  b.target = { x: b.x, y: b.y - 100 };
  const sx = Math.round(G.W / 2 - 235), sy = Math.round(G.H / 2 - 185);
  const CW = 470, CH = 300, d = G.dpr || 1;
  const crop = () => {
    const c = document.createElement('canvas');
    c.width = CW; c.height = CH;
    const x = c.getContext('2d');
    x.drawImage(G.cv, sx * d, sy * d, CW * d, CH * d, 0, 0, CW, CH);
    return c.toDataURL('image/png');
  };
  G.render();
  const visible = crop();
  const saved = G.enemies;
  G.enemies = [];
  G.render();
  const baseline = crop();
  G.render();
  const baseline2 = crop();
  G.enemies = saved;
  G.render();
  return { visible: visible, baseline: baseline, baseline2: baseline2,
           crop: [sx, sy, CW, CH], dpr: d };
}"""

TIMING_SETUP = """() => {
  const G = Game, b = window.__liveBoss.b, p = G.players[0];
  G.state = 'paused';
  G.qaSilhouette = true;
  G.qaGod = true;
  G.time = 1.0; G.timeScale = 1; G.hitstop = 0;
  G.speedMul = 1; G.speedBase = 1;
  b.x = Math.round(G.level.w * .36); b.y = Math.round(G.level.h * .73);
  b.hp = 1e9; b.spd = 0; b.dmg = 0; b.contactCd = 999;
  b.stun = 0; b.attackCd = 999; b.shotCd = 999;
  b.hitFlash = 0; b.squash = 0; b.squash0 = 0; b.squashT = 0;
  b.squashAng = 0; b.spawnScale = 1; b.phaseIdx = 0; b.coreOpen = false;
  b.target = { x: b.x, y: b.y - 100 };
  G.enemies = [b]; G.hazObjs = []; G.spawnQueue = [];
  G.pickups = []; G.powerups = []; G.runes = []; G.petDrops = [];
  Projectiles.clear(); EnemyBullets.clear(); FX.clear();
  p.x = b.x + 500; p.y = b.y - 300; p.vx = p.vy = 0;
  p.invuln = 30; p.weapons.length = 0; p.turrets.length = 0; p.pet = null;
  p.recalc();
  G.waveTimer = 9999; G.waveDuration = 9999; G.waveEnding = false;
  G.bossIntro = 0; G.bossIntroTarget = null; G.bossAlive = true;
  G.state = 'play';
  UI.show(null);
  const hud = document.getElementById('hud'); if (hud) hud.classList.add('hidden');
  return { x: b.x, y: b.y };
}"""

TIMING_JS = """async (ease) => {
  const G = Game, b = window.__liveBoss.b, p = G.players[0];
  G.squashEase = ease;
  G.state = 'paused';
  b.hp = 1e9;
  b.hitFlash = 0; b.squash = 0; b.squash0 = 0; b.squashT = 0;
  b.squashAng = 0;
  b.stun = 0; b.attackCd = 999; b.shotCd = 999;
  b.target = { x: b.x, y: b.y - 100 };
  G.enemies = [b];
  G.spawnQueue = [];
  G.hazObjs = [];
  Projectiles.clear(); EnemyBullets.clear(); FX.clear();
  G.state = 'play';
  const samples = [];
  const orig = G.render;
  let armed = true, active = true, t0 = 0, peak = 0;
  G.render = function () {
    orig.call(G);
    if (!active) return;
    if (armed) {
      /* Start the clock at a rendered frame boundary: the next update is the
         first recovery step, so no pre-impact part of a frame is counted. */
      armed = false;
      b.hurt(200000, true, p, 'shot');
      peak = +b.squash0.toFixed(6);
      t0 = performance.now();
      return;
    }
    samples.push({
      t: +(performance.now() - t0).toFixed(2),
      squash: +b.squash.toFixed(6),
      squashT: +b.squashT.toFixed(4),
      flash: +b.hitFlash.toFixed(4),
      fps: G.fps || 0
    });
  };
  await new Promise(resolve => setTimeout(resolve, 380));
  active = false;
  G.render = orig;
  G.state = 'paused';
  if (samples.length < 3) throw new Error('not enough rendered recovery frames: ' + samples.length);
  return { ease: ease, peak: peak, samples: samples };
}"""


def decode_data_url(data_url, path=None):
    head = "data:image/png;base64,"
    if not data_url.startswith(head):
        raise RuntimeError("unexpected canvas payload")
    raw = base64.b64decode(data_url[len(head):])
    if path:
        with open(path, "wb") as fh:
            fh.write(raw)
    return raw


def mask_from_pair(visible, baseline, threshold=MASK_THRESHOLD):
    diff = ImageChops.difference(visible.convert("RGB"), baseline.convert("RGB"))
    r, g, b = diff.split()
    maxdiff = ImageChops.lighter(ImageChops.lighter(r, g), b)
    return maxdiff.point(lambda v: 255 if v > threshold else 0)


def mask_from_alpha(path, threshold=MASK_THRESHOLD):
    alpha = Image.open(path).convert("RGBA").getchannel("A")
    return alpha.point(lambda v: 255 if v > threshold else 0)


def mask_stats(mask, ref):
    a = mask.load(); b = ref.load()
    w, h = mask.size
    inter = union = only_a = only_b = 0
    minx, miny, maxx, maxy = w, h, -1, -1
    rminx, rminy, rmaxx, rmaxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            va = a[x, y] > 0
            vb = b[x, y] > 0
            if va:
                if x < minx: minx = x
                if y < miny: miny = y
                if x > maxx: maxx = x
                if y > maxy: maxy = y
            if vb:
                if x < rminx: rminx = x
                if y < rminy: rminy = y
                if x > rmaxx: rmaxx = x
                if y > rmaxy: rmaxy = y
            if va and vb:
                inter += 1
            elif va:
                only_a += 1
            elif vb:
                only_b += 1
            if va or vb:
                union += 1
    bbox = [minx, miny, maxx, maxy] if maxx >= 0 else None
    rbbox = [rminx, rminy, rmaxx, rmaxy] if rmaxx >= 0 else None
    delta = max(abs(bbox[i] - rbbox[i]) for i in range(4)) if bbox and rbbox else 999
    area = max(0, maxx - minx + 1) * max(0, maxy - miny + 1) if bbox else 0
    rarea = max(0, rmaxx - rminx + 1) * max(0, rmaxy - rminy + 1) if rbbox else 0
    area_delta = abs(area - rarea) / max(1, rarea)
    iou = inter / union if union else 0.0
    return {
        "iou": round(iou, 6),
        "mismatch_px": only_a + only_b,
        "intersection_px": inter,
        "union_px": union,
        "bbox": bbox,
        "ref_bbox": rbbox,
        "bbox_delta": delta,
        "area_px": area,
        "ref_area_px": rarea,
        "area_delta_pct": round(area_delta * 100, 3),
        "ok": iou >= 0.995 and delta <= 1 and area_delta <= 0.01,
    }


def contour_overlay(live_path, ref_mask, out_path):
    live = Image.open(live_path).convert("RGB")
    dilated = ref_mask.filter(ImageFilter.MaxFilter(3))
    contour = ImageChops.subtract(dilated, ref_mask)
    px = live.load(); c = contour.load()
    for y in range(live.height):
        for x in range(live.width):
            if c[x, y]:
                old = px[x, y]
                px[x, y] = (
                    int(old[0] * .15 + 78 * .85),
                    int(old[1] * .15 + 255 * .85),
                    int(old[2] * .15 + 255 * .85),
                )
    live.save(out_path)


def set_panel(size, ref_image=None):
    im = Image.new("RGB", size, PANEL)
    if ref_image is not None:
        bg = Image.new("RGBA", size, (20, 26, 35, 255))
        bg.alpha_composite(ref_image.convert("RGBA"), (0, 0))
        im = bg.convert("RGB")
    d = ImageDraw.Draw(im)
    d.line((18, 231, size[0] - 18, 231), fill=(37, 47, 59), width=1)
    return im


def build_live_sheet(values, setup, stats):
    w = 1024
    top = 152
    row_h = CELL_H + 50
    gap = 14
    footer = 124
    h = top + len(values) * (row_h + gap) - gap + footer
    sheet = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(sheet)
    d.text((28, 22), "WIESBADEN SURVIVORS · LIVE-RENDER CHECK", font=F_EYEBROW, fill=CYAN)
    d.text((28, 40), "SQUASH-SILHOUETTE · SPIEL VS. REFERENZ", font=F_TITLE, fill=TEXT)
    d.text((28, 78), "Echter Game.render()-Ausschnitt aus Welle 20, Kamera 1,8x, Boss fixiert; QA blendet nur Nameplate/HP aus.",
           font=F_SUB, fill=MUTED)
    d.text((28, 96), "Links Live-Frame mit cyanfarbener Referenzkontur; rechts dieselbe Offscreen-Referenz. Keine Kamera-, Shake- oder Partikelabweichung.",
           font=F_SMALL, fill=MUTED)
    d.line((28, 116, w - 28, 116), fill=LINE, width=1)
    d.text((28, 126), "LIVE GAME + REFERENZ-KONTUR", font=F_COL, fill=GREEN)
    d.text((526, 126), "OFFSCREEN-REFERENZ", font=F_COL, fill=CYAN)
    total_mismatch = sum(v["match"]["mismatch_px"] for v in values)
    matched = sum(1 for v in values if v["match"]["ok"])
    badge = "%d/%d SILHOUETTEN" % (matched, len(values))
    bw = int(d.textlength(badge, font=F_SMALL)) + 22
    d.rounded_rectangle((w - 28 - bw, 22, w - 28, 42), radius=9, fill=(12, 34, 24) if matched == len(values) else (46, 20, 20))
    d.text((w - 28 - bw + 11, 26), badge, font=F_SMALL, fill=GREEN if matched == len(values) else MAGENTA)

    for i, v in enumerate(values):
        y = top + i * (row_h + gap)
        live = Image.open(v["overlay_png"]).convert("RGB")
        ref = Image.open(v["ref_png"]).convert("RGBA")
        left = set_panel((CELL_W, CELL_H))
        left.paste(live, (0, 0))
        right = set_panel((CELL_W, CELL_H), ref.resize((CELL_W, CELL_H), Image.Resampling.LANCZOS))
        for col, (panel, label, accent) in enumerate((
            (left, "LIVE", GREEN),
            (right, "REF", CYAN),
        )):
            x = 28 + col * (CELL_W + 28)
            sheet.paste(panel, (x, y))
            d.rectangle((x, y, x + CELL_W - 1, y + CELL_H - 1), outline=LINE, width=1)
            d.rectangle((x, y, x + 3, y + CELL_H + 42), fill=accent)
            d.rectangle((x, y + CELL_H, x + CELL_W - 1, y + CELL_H + 42), fill=PANEL_2)
            d.line((x, y + CELL_H, x + CELL_W, y + CELL_H), fill=LINE, width=1)
            d.text((x + 13, y + CELL_H + 11), "squash %.3f" % v["squash"], font=F_VALUE, fill=TEXT)
            d.text((x + 13, y + CELL_H + 28), "IoU %.4f · bbox Δ %d px" % (v["match"]["iou"], v["match"]["bbox_delta"]),
                   font=F_SMALL, fill=MUTED)
            d.text((x + CELL_W - 48, y + 10), label, font=F_ROW, fill=accent)
    footer_y = h - footer
    d.line((28, footer_y, w - 28, footer_y), fill=LINE, width=1)
    d.text((28, footer_y + 12), "LIVE-MATCH", font=F_FOOT_H, fill=GREEN if matched == len(values) else MAGENTA)
    d.text((132, footer_y + 14), "%d/%d silhouetten gleich · %d abweichende Pixel" % (matched, len(values), total_mismatch),
           font=F_FOOT, fill=TEXT)
    d.text((28, footer_y + 32), "Methode: sichtbarer Boss-Frame minus identischer Frame ohne Boss; Maske max(Kanal-Delta) > %d; Referenz = Alpha der Offscreen-Stills." % MASK_THRESHOLD,
           font=F_FOOT, fill=MUTED)
    d.text((28, footer_y + 48), "Der QA-Schalter ändert nur Nameplate/HP; Enemy.draw, Kamera-Scale, Squash-Winkel und Body bleiben der Produktionspfad.",
           font=F_FOOT, fill=MUTED)
    d.text((28, footer_y + 64), "LIVE-RECOVERY (n=5): Halbwert linear %s · quadratisch %s · kubisch %s ms" % (
        stats["linear"]["median"]["half_ms"], stats["eased"]["median"]["half_ms"],
        stats["cubic"]["median"]["half_ms"]), font=F_FOOT, fill=YELLOW)
    d.text((28, footer_y + 80), "Fläche 0–260 ms: linear %.2f · quadratisch %.2f · kubisch %.2f · Peaks 0.55 · T = 171,9 ms nominal" % (
        stats["linear"]["median"]["area_260ms"], stats["eased"]["median"]["area_260ms"],
        stats["cubic"]["median"]["area_260ms"]), font=F_FOOT, fill=MUTED)
    d.text((28, footer_y + 96), "SHIPPED: kubisch (squashEase = 2) · Boss %s · %s" % (
        setup["boss"], date.today().isoformat()), font=F_FOOT, fill=GREEN)
    sheet.save(LIVE_SHEET)
    return sheet.size


def build_timing_chart(curves, stats):
    width, height = 920, 360
    margin_l, margin_r, margin_t, margin_b = 64, 22, 120, 44
    plot_w = width - margin_l - margin_r
    plot_h = height - margin_t - margin_b
    im = Image.new("RGB", (width, height), PANEL)
    d = ImageDraw.Draw(im)
    d.text((24, 16), "LIVE-RECOVERY · GEMESSENE FRAMES", font=F_FOOT_H, fill=TEXT)
    d.text((24, 30), "squash nach Game.render(); 0–300 ms; fünf Runs je Kurve", font=F_SMALL, fill=MUTED)
    colors = {0: CYAN, 1: MAGENTA, 2: YELLOW}
    names = {0: "linear", 1: "quadratisch", 2: "kubisch"}
    for i, (name, ease) in enumerate(CURVES):
        med = stats[name]["median"]
        y = 52 + i * 18
        d.rectangle((24, y + 3, 36, y + 5), fill=colors[ease])
        d.text((44, y - 3),
               "%s · Halbwert %s ms · Fläche %.1f" % (names[ease], med["half_ms"], med["area_260ms"]),
               font=F_SMALL, fill=colors[ease])
    selected = "AUSWAHL: " + ("KUBISCH" if SHIPPED == "cubic" else SHIPPED.upper())
    sw = d.textlength(selected, font=F_SMALL)
    d.text((width - 24 - sw, 52), selected, font=F_SMALL, fill=GREEN)
    d.line((24, 104, width - 24, 104), fill=LINE, width=1)
    peak = .55
    max_t = 300.0
    for tick in (0, 50, 100, 150, 200, 250, 300):
        x = margin_l + plot_w * tick / max_t
        d.line((x, margin_t, x, margin_t + plot_h), fill=(36, 46, 58), width=1)
        d.text((x - 9, margin_t + plot_h + 8), "%d" % tick, font=F_SMALL, fill=MUTED)
    for frac in (0, .25, .5, .75, 1.0):
        y = margin_t + plot_h * (1 - frac)
        d.line((margin_l, y, margin_l + plot_w, y), fill=(36, 46, 58), width=1)
        d.text((12, y - 5), "%.2f" % (peak * frac), font=F_SMALL, fill=MUTED)
    d.line((margin_l, margin_t, margin_l, margin_t + plot_h), fill=LINE, width=1)
    d.line((margin_l, margin_t + plot_h, margin_l + plot_w, margin_t + plot_h), fill=LINE, width=1)
    d.text((margin_l + plot_w - 28, height - 22), "ms", font=F_SMALL, fill=MUTED)
    for name, ease in CURVES:
        col = colors[ease]
        for run in curves[name]:
            pts = []
            for s in run["samples"]:
                if s["t"] > max_t:
                    continue
                x = margin_l + plot_w * s["t"] / max_t
                y = margin_t + plot_h * (1 - s["squash"] / peak)
                pts.append((x, y))
            if len(pts) > 1:
                d.line(pts, fill=col, width=3 if name == SHIPPED else 2)
    im.save(TIMING_CHART)
    return im.size


def median(vals):
    vals = sorted(v for v in vals if v is not None)
    if not vals:
        return None
    return vals[len(vals) // 2]


def summarize(runs):
    out = []
    for run in runs:
        samples = run["samples"]
        peak = run.get("peak") or .55
        # The first rendered sample is delayed; include the exact impact point.
        pts = [(0.0, peak)] + [(s["t"], s["squash"]) for s in samples]
        positive = [p for p in pts if p[1] > 0]
        last_positive = positive[-1][0] if positive else 0.0
        first_zero = next((t for t, v in pts if v == 0), None)

        def crossing(target):
            for i in range(1, len(pts)):
                t0, v0 = pts[i - 1]
                t1, v1 = pts[i]
                if v0 >= target >= v1:
                    if v0 == v1:
                        return t1
                    return t0 + (t1 - t0) * (v0 - target) / (v0 - v1)
            return None

        area = 0.0
        for i in range(1, len(pts)):
            t0, v0 = pts[i - 1]
            t1, v1 = pts[i]
            if t0 >= 260:
                break
            t1 = min(t1, 260.0)
            if t1 > t0:
                area += (v0 + v1) * .5 * (t1 - t0)
        out.append({
            "peak": round(peak, 4),
            "frames": len(samples),
            "last_positive_ms": round(last_positive, 1),
            "first_zero_ms": round(first_zero, 1) if first_zero is not None else None,
            "half_ms": round(crossing(peak * .5), 1) if crossing(peak * .5) is not None else None,
            "t80_ms": round(crossing(peak * .8), 1) if crossing(peak * .8) is not None else None,
            "t20_ms": round(crossing(peak * .2), 1) if crossing(peak * .2) is not None else None,
            "area_260ms": round(area, 2),
            "first_t_ms": samples[0]["t"] if samples else None,
            "samples": samples,
        })
    return out


def main():
    if not os.path.exists(REF_META):
        print("missing", REF_META, "- run tools/_squash-stills.py first", file=sys.stderr)
        return 2
    with open(REF_META, encoding="utf-8") as fh:
        ref_meta = json.load(fh)
    refs = {round(r["fraction"], 3): os.path.join(ROOT, r["linear"]["png"]) for r in ref_meta["rows"]}
    fractions = [1.0, 0.8, 0.6, 0.4, 0.2]
    values = []
    errors = []
    setup = None
    all_curves = {}
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
            setup = page.evaluate(LIVE_SETUP_JS)
            if not setup:
                raise RuntimeError("live setup failed")
            print("live setup:", setup)
            if setup["dpr"] != 1:
                raise RuntimeError("expected dpr 1, got %s" % setup["dpr"])

            for frac in fractions:
                squash = round(.55 * frac, 6)
                data = page.evaluate(LIVE_CAPTURE_JS, squash)
                fname = "live-%03d.png" % round(frac * 100)
                vpath = os.path.join(OUT_DIR, fname)
                decode_data_url(data["visible"], vpath)
                baseline = decode_data_url(data["baseline"])
                baseline2 = decode_data_url(data["baseline2"])
                import io
                base_img = Image.open(io.BytesIO(baseline)).convert("RGB")
                base2_img = Image.open(io.BytesIO(baseline2)).convert("RGB")
                bg_diff = ImageChops.difference(base_img, base2_img).getbbox()
                live_img = Image.open(vpath).convert("RGB")
                live_mask = mask_from_pair(live_img, base_img)
                ref_mask = mask_from_alpha(refs[frac])
                match = mask_stats(live_mask, ref_mask)
                overlay_name = "live-overlay-%03d.png" % round(frac * 100)
                overlay_path = os.path.join(OUT_DIR, overlay_name)
                contour_overlay(vpath, ref_mask, overlay_path)
                values.append({
                    "fraction": frac,
                    "squash": squash,
                    "live_png": os.path.relpath(vpath, ROOT).replace(os.sep, "/"),
                    "overlay_png": os.path.relpath(overlay_path, ROOT).replace(os.sep, "/"),
                    "ref_png": os.path.relpath(refs[frac], ROOT).replace(os.sep, "/"),
                    "match": match,
                    "background_stable": bg_diff is None,
                })
                print("live %.3f: IoU %.6f bboxΔ %d areaΔ %.2f%% mismatch %d bgStable %s" % (
                    squash, match["iou"], match["bbox_delta"], match["area_delta_pct"],
                    match["mismatch_px"], bg_diff is None))

            # Real rendered recovery samples. Each run is measured after `render`.
            for name, ease in CURVES:
                runs = []
                for _ in range(5):
                    data = page.evaluate(TIMING_JS, ease)
                    runs.append(data)
                all_curves[name] = runs
                print(name, "runs:", [(len(r["samples"]), r["samples"][0]["t"] if r["samples"] else None) for r in runs])
            page.evaluate("() => { Game.squashEase = 2; Game.state = 'paused'; }")
            browser.close()

    stats = {}
    for name, runs in all_curves.items():
        summarized = summarize(runs)
        stats[name] = {
            "runs": summarized,
            "median": {
                k: median([r[k] for r in summarized])
                for k in ("last_positive_ms", "first_zero_ms", "half_ms", "t80_ms", "t20_ms", "area_260ms", "peak", "frames")
            },
        }

    live_ok = all(v["match"]["ok"] and v["background_stable"] for v in values)
    peaks = {name: stats[name]["median"]["peak"] for name in ("linear", "eased", "cubic")}
    peak_ok = all(abs(peak - 0.55) < 1e-6 for peak in peaks.values())
    cubic_faster = (stats["cubic"]["median"]["half_ms"] < stats["eased"]["median"]["half_ms"]
                    and stats["cubic"]["median"]["area_260ms"] < stats["eased"]["median"]["area_260ms"])
    timing_ok = peak_ok and cubic_faster
    result = {
        "date": date.today().isoformat(),
        "boss": setup,
        "shipped_curve": SHIPPED,
        "curve_ease": {"linear": 0, "eased": 1, "cubic": 2}[SHIPPED],
        "method": {
            "live": "Game.render() into #game, 470x300 crop at cam.zoom=1.8, pinned wave-20 boss",
            "mask": "max channel delta > %d between boss-present and identical boss-absent frame" % MASK_THRESHOLD,
            "reference": "alpha mask of the offscreen still (includes Game.drawShadows no-light branch)",
            "chrome": "QA-only Game.qaSilhouette hides nameplate/HP; body draw untouched",
            "dynamic_shadow": "Game.drawShadows no-light branch mirrored in the offscreen reference (alpha .3)",
            "timing": "frame-boundary samples after Game.render() at performance.now(); 5 runs per curve, median",
        },
        "verification": {
            "ok": live_ok,
            "values": values,
            "matched": sum(1 for v in values if v["match"]["ok"]),
            "total_mismatch_px": sum(v["match"]["mismatch_px"] for v in values),
            "max_bbox_delta": max(v["match"]["bbox_delta"] for v in values),
            "max_mismatch_px": max(v["match"]["mismatch_px"] for v in values),
            "max_area_delta_pct": max(v["match"]["area_delta_pct"] for v in values),
            "background_stable": all(v["background_stable"] for v in values),
        },
        "recovery": {
            name: {
                "runs": [
                    {k: v for k, v in run.items() if k != "samples"}
                    for run in data["runs"]
                ],
                "median": data["median"],
                "samples": data["runs"][0]["samples"],
            }
            for name, data in stats.items()
        },
        "selection": {
            "peak_unchanged": peak_ok,
            "quadratic": {
                "half_ms": stats["eased"]["median"]["half_ms"],
                "area_260ms": stats["eased"]["median"]["area_260ms"],
                "peak": stats["eased"]["median"]["peak"],
            },
            "cubic": {
                "half_ms": stats["cubic"]["median"]["half_ms"],
                "area_260ms": stats["cubic"]["median"]["area_260ms"],
                "peak": stats["cubic"]["median"]["peak"],
            },
            "cubic_faster_than_quadratic": cubic_faster,
        },
        "timing_ok": timing_ok,
        "console_errors": errors,
    }
    with open(LIVE_META, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2, ensure_ascii=False)
    sheet_size = build_live_sheet(values, setup, stats)
    chart_size = build_timing_chart(all_curves, stats)
    print("live sheet:", LIVE_SHEET, sheet_size)
    print("timing chart:", TIMING_CHART, chart_size)
    print("live match:", live_ok, "timing:", timing_ok)
    print("selected:", SHIPPED, "peak unchanged:", peak_ok, "cubic faster:", cubic_faster)
    for name in ("linear", "eased", "cubic"):
        print(name, "median", json.dumps(stats[name]["median"], ensure_ascii=False))
    print("console errors:", errors)
    return 0 if live_ok and timing_ok and not errors else 1


if __name__ == "__main__":
    sys.exit(main())
