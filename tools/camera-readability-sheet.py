"""Baut aus den fünf Kamera-Renders ein beschriftetes Kontaktblatt.

Aufruf:
  python3 tools/camera-readability-sheet.py \
      --dir docs/pw/camera-readability \
      --out docs/pw/camera-readability/contact-sheet.png

Die Einzelbilder bleiben unverändert; Beschriftung, Kamera-Steckbrief und
Detail-Crop werden nur für die Übersicht gerendert.
"""
import argparse
import json
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BG = (12, 16, 22)
PANEL = (22, 28, 37)
LINE = (43, 53, 66)
TEXT = (232, 238, 246)
MUTED = (139, 152, 168)
CYAN = (89, 230, 255)
MAGENTA = (201, 107, 224)
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
    for p in (BOLD_PATHS if bold else FONT_PATHS):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


F_TITLE = font(33, True)
F_SUB = font(15)
F_LABEL = font(18, True)
F_SMALL = font(13)
F_SMALL_B = font(13, True)
F_INFO = font(15)
F_INFO_B = font(15, True)
F_INFO_H = font(20, True)
F_FOOT = font(12)


def label_frame(img, title, detail):
    w, h = img.size
    bar = 42
    overlay = Image.new("RGBA", (w, bar), (7, 10, 15, 214))
    img.alpha_composite(overlay, (0, h - bar))
    d = ImageDraw.Draw(img)
    d.text((16, h - bar + 10), title, font=F_LABEL, fill=TEXT)
    tw = d.textlength(title, font=F_LABEL)
    d.text((16 + tw + 16, h - bar + 13), detail, font=F_SMALL, fill=MUTED)
    # Ein kleiner Akzent links signalisiert die Dichtestufe, ohne das Bild zu
    # überdecken.
    d.rectangle((0, h - bar, 4, h), fill=CYAN if "MAX" in title else MAGENTA)


def info_panel(size):
    img = Image.new("RGB", size, PANEL)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, size[0] - 1, size[1] - 1), outline=LINE, width=1)
    d.text((24, 22), "KAMERA / BEFUND", font=F_INFO_H, fill=CYAN)
    d.text((24, 56), "Orthografisch · 60° Elevation · Yaw 0°", font=F_INFO, fill=TEXT)
    d.text((24, 80), "18,0 m Sichtbreite · Norden oben · 1280 × 720", font=F_INFO, fill=TEXT)
    d.text((24, 104), "Dieselbe Kamera, dieselben Props; nur die Dichte ändert sich.", font=F_SMALL, fill=MUTED)

    d.line((24, 136, size[0] - 24, 136), fill=LINE, width=1)
    d.text((24, 154), "BEFUND", font=F_SMALL_B, fill=WHITE)
    lines = [
        ("bis 18", "Silhouetten und Prop-Zuordnung bleiben trennbar."),
        ("ab 34", "Körper verschmelzen; die Augen werden zum Raster."),
        ("bei 50", "Spieler nur noch über Cyan zu finden; kein Count."),
        ("Props", "Tram und Kirche dominieren; Hecke/Litfaßsäule sind dunkel."),
    ]
    y = 180
    for key, text in lines:
        d.text((24, y), key, font=F_SMALL_B, fill=CYAN if key in ("bis 18", "bei 50") else MAGENTA)
        d.text((104, y), text, font=F_SMALL, fill=TEXT)
        y += 30

    d.line((24, y + 2, size[0] - 24, y + 2), fill=LINE, width=1)
    d.text((24, y + 18), "Grenze: statische Blender-Sichtprüfung, kein Spieler-Playtest.", font=F_SMALL, fill=MUTED)
    d.text((24, y + 38), "HUD, Trefferzahlen, Partikel und Engine-Beleuchtung sind nicht enthalten.", font=F_SMALL, fill=MUTED)
    return img


def make_sheet(src_dir, out_path):
    meta = json.load(open(os.path.join(src_dir, "series.json"), encoding="utf-8"))
    names = [
        ("00_stage.png", "00 · BÜHNE", "0 Gegner"),
        ("01_sparse.png", "01 · VEREINZELT", "8 Gegner"),
        ("02_pressure.png", "02 · DRUCK", "18 Gegner"),
        ("03_crowd.png", "03 · GEDRÄNGE", "34 Gegner"),
        ("04_max.png", "04 · MAXIMUM", "50 Gegner · Engine-Cap"),
    ]
    cv = [Image.open(os.path.join(src_dir, n)).convert("RGBA") for n, _, _ in names]
    cell_w, cell_h = 640, 360
    gap, margin, header = 20, 28, 104
    width = margin * 2 + cell_w * 2 + gap
    height = header + cell_h * 3 + gap * 2 + 36
    sheet = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(sheet)
    d.text((margin, 22), "WIESBADEN SURVIVORS · TOP-DOWN-LESBARKEIT", font=F_TITLE, fill=TEXT)
    d.text((margin, 64), "Top-Down-Serie mit der geplanten Spielkamera · sechs Props, Sebbo und bis zu 50 Schlurfer",
           font=F_SUB, fill=MUTED)
    d.line((margin, 92, width - margin, 92), fill=LINE, width=1)
    d.rectangle((margin, 92, margin + 110, 94), fill=CYAN)
    d.rectangle((margin + 110, 92, margin + 170, 94), fill=MAGENTA)

    for i, (name, title, detail) in enumerate(names):
        im = cv[i].resize((cell_w, cell_h), Image.Resampling.LANCZOS)
        label_frame(im, title, detail)
        col, row = i % 2, i // 2
        x = margin + col * (cell_w + gap)
        y = header + row * (cell_h + gap)
        sheet.paste(im.convert("RGB"), (x, y))
        d.rectangle((x, y, x + cell_w - 1, y + cell_h - 1), outline=LINE, width=1)

    info = info_panel((cell_w, cell_h))
    x = margin + (cell_w + gap)
    y = header + 2 * (cell_h + gap)
    sheet.paste(info, (x, y))
    d.rectangle((x, y, x + cell_w - 1, y + cell_h - 1), outline=LINE, width=1)

    d.text((margin, height - 25), "Blender Cycles 4.5 · 12 Samples · Assets unverändert · 2026-11-08",
           font=F_FOOT, fill=MUTED)
    d.text((width - margin - 240, height - 25), "Sichtprüfung, keine Spielerstudie", font=F_FOOT, fill=MUTED)
    sheet.save(out_path)

    # Detail-Crop: der Spieler ist bei 50 Gegnern nur noch ein kleines
    # Cyan-Feld. Der Crop bleibt bei 2× Vergrößerung, damit keine Schärfe
    # vorgetäuscht wird.
    px = int(round((0.5 + meta["player"]["x"] / meta["camera"]["ortho_width_m"]) * 1280))
    py = int(round((0.5 - (meta["player"]["y"] * 0.8660254) / 10.125) * 720))
    src = Image.open(os.path.join(src_dir, "04_max.png")).convert("RGB")
    box = (max(0, px - 150), max(0, py - 150), min(src.width, px + 150), min(src.height, py + 150))
    crop = src.crop(box).resize((600, 600), Image.Resampling.NEAREST)
    crop.save(os.path.join(src_dir, "04_max_player_detail.png"))
    print("sheet", out_path, sheet.size)
    print("detail", os.path.join(src_dir, "04_max_player_detail.png"), "player pixel", (px, py))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.join(ROOT, "docs", "pw", "camera-readability"))
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    out = args.out or os.path.join(args.dir, "contact-sheet.png")
    make_sheet(args.dir, out)


if __name__ == "__main__":
    main()
