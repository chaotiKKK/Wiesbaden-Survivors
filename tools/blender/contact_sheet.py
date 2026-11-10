#!/usr/bin/env python3
"""Baut ein Kontaktblatt aus den Einzelrenders eines Asset-Pakets.

Liest assets/manifest.json, nimmt alle Assets mit passendem `pack` und legt
die Renders in einem Raster mit Name, Massen und Tris ab.

Aufruf:
  python3 tools/blender/contact_sheet.py [--pack 2] [--out PATH]
"""
import argparse
import json
import math
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MANIFEST = os.path.join(ROOT, "assets", "manifest.json")

BG = (20, 23, 27)
CARD = (30, 35, 41)
TEXT = (232, 238, 244)
MUTED = (150, 160, 172)
ACCENT = (244, 194, 90)


def font(size, bold=False):
    names = ["DejaVuSans-Bold.ttf", "DejaVuSans.ttf"] if bold else ["DejaVuSans.ttf"]
    for name in names:
        for base in ("/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu"):
            path = os.path.join(base, name)
            if os.path.exists(path):
                return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def fmt_dims(dims):
    return " x ".join(("%.2f" % v).rstrip("0").rstrip(".") for v in dims) + " m"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pack", type=int, default=2)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    manifest = json.load(open(MANIFEST, encoding="utf-8"))
    assets = [a for a in manifest["assets"] if a.get("pack") == args.pack]
    if not assets:
        raise SystemExit("Kein Asset mit pack=%d im Manifest" % args.pack)

    out = args.out or os.path.join(ROOT, "assets", "renders", "_overview_pack%d.png" % args.pack)
    cell, label_h, pad, title_h, cols = 420, 54, 18, 62, 4
    rows = int(math.ceil(len(assets) / cols))
    width = pad + cols * (cell + pad)
    height = title_h + pad + rows * (cell + label_h + pad)
    sheet = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(sheet)

    total_tris = sum(a.get("tris", 0) for a in assets)
    draw.text((pad, 16), "WIESBADEN SURVIVORS \u00b7 ASSET-PAKET %d" % args.pack,
              font=font(24, True), fill=ACCENT)
    draw.text((width - pad, 24), "%d Assets \u00b7 %d Tris" % (len(assets), total_tris),
              font=font(16), fill=MUTED, anchor="ra")

    f_name, f_meta = font(19, True), font(15)
    for i, asset in enumerate(assets):
        col, row = i % cols, i // cols
        x = pad + col * (cell + pad)
        y = title_h + pad + row * (cell + label_h + pad)
        draw.rounded_rectangle((x - 4, y - 4, x + cell + 4, y + cell + label_h), 8, fill=CARD)
        render = os.path.join(ROOT, asset["files"]["render"])
        with Image.open(render) as img:
            img = img.convert("RGB").resize((cell, cell), Image.Resampling.LANCZOS)
            sheet.paste(img, (x, y))
        draw.text((x + 4, y + cell + 6), asset["name"], font=f_name, fill=TEXT)
        meta = "%s \u00b7 %s \u00b7 %d Tris" % (
            asset.get("kind", "?"), fmt_dims(asset["dimensions_m"]), asset.get("tris", 0))
        draw.text((x + 4, y + cell + 30), meta, font=f_meta, fill=MUTED)

    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out)
    print("Kontaktblatt:", os.path.relpath(out, ROOT), "| %dx%d | %d Assets" %
          (width, height, len(assets)))


if __name__ == "__main__":
    main()
