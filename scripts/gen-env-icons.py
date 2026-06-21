#!/usr/bin/env python3
"""Generate per-environment app icons with a corner RIBBON so dev/staging builds
are visually distinct from production at a glance (dock, app switcher, Finder).

Takes the production icon (icons/icon.png) and stamps a diagonal banner across the
bottom-right corner — orange "DEV" for the dev build, purple "STG" for staging —
then writes a full icon set (PNGs + .ico + .icns) into icons/dev and icons/staging.
Production keeps the plain icon set in icons/.

Run:  python3 scripts/gen-env-icons.py
Needs: Pillow (PIL), and macOS `iconutil` for the .icns.
"""
import os
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont

ICONS = os.path.join(os.path.dirname(__file__), "..",
                     "apps/desktop/src-tauri/icons")
ICONS = os.path.abspath(ICONS)
SRC = os.path.join(ICONS, "icon.png")

# (folder, label, ribbon color) per environment that needs a marker.
VARIANTS = [
    ("dev", "DEV", (224, 110, 0, 255)),      # orange
    ("staging", "STG", (140, 70, 200, 255)),  # purple
]

PNG_SIZES = {           # output filename → pixel size
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
}
ICNS_SIZES = [16, 32, 64, 128, 256, 512]  # iconset members (each + @2x)


def _font(px):
    """Best-effort bold font; fall back to PIL default if none found."""
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
    ):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, px)
            except OSError:
                pass
    return ImageFont.load_default()


def make_master(label, color, size=1024):
    """Return a `size`×`size` RGBA icon with a diagonal corner ribbon."""
    base = Image.open(SRC).convert("RGBA").resize((size, size), Image.LANCZOS)

    # Build the ribbon on its own layer, then rotate -45° and paste in the corner.
    band_w = int(size * 0.92)
    band_h = int(size * 0.20)
    band = Image.new("RGBA", (band_w, band_h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    bd.rectangle([0, 0, band_w, band_h], fill=color)
    # thin white inner border for contrast
    bd.rectangle([0, 0, band_w - 1, band_h - 1],
                 outline=(255, 255, 255, 230), width=max(2, size // 256))

    font = _font(int(band_h * 0.60))
    tb = bd.textbbox((0, 0), label, font=font)
    bd.text(((band_w - (tb[2] - tb[0])) / 2,
             (band_h - (tb[3] - tb[1])) / 2 - tb[1]),
            label, font=font, fill=(255, 255, 255, 255))

    band = band.rotate(-45, expand=True, resample=Image.BICUBIC)
    # Anchor the rotated band over the bottom-right corner.
    bx = size - band.width + int(size * 0.30)
    by = size - band.height + int(size * 0.30)
    base.alpha_composite(band, (bx, by))
    return base


def write_set(folder, master):
    out = os.path.join(ICONS, folder)
    os.makedirs(out, exist_ok=True)

    for name, px in PNG_SIZES.items():
        master.resize((px, px), Image.LANCZOS).save(os.path.join(out, name))

    # .ico (Windows) — multi-resolution.
    master.resize((256, 256), Image.LANCZOS).save(
        os.path.join(out, "icon.ico"),
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    # .icns (macOS) via iconutil on a generated .iconset.
    with tempfile.TemporaryDirectory() as tmp:
        iconset = os.path.join(tmp, "icon.iconset")
        os.makedirs(iconset)
        for s in ICNS_SIZES:
            master.resize((s, s), Image.LANCZOS).save(
                os.path.join(iconset, f"icon_{s}x{s}.png"))
            master.resize((s * 2, s * 2), Image.LANCZOS).save(
                os.path.join(iconset, f"icon_{s}x{s}@2x.png"))
        subprocess.run(
            ["iconutil", "-c", "icns", iconset,
             "-o", os.path.join(out, "icon.icns")],
            check=True)
    print(f"→ wrote {folder} icon set ({out})")


if __name__ == "__main__":
    for folder, label, color in VARIANTS:
        write_set(folder, make_master(label, color))
    print("done.")
