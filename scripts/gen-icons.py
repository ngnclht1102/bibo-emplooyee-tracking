"""Finalize the clock+person icon set for employeetrack."""
import math
from PIL import Image, ImageDraw

TRAY_DIR = "/Users/namng/Work/ctracking/apps/desktop/src-tauri/icons/tray"
APP_SRC = "/tmp/ctracking_icon/appicon2.png"

ACCENT = (45, 108, 223, 255)
WHITE = (255, 255, 255, 255)
GREEN = (47, 168, 90, 255)
AMBER = (224, 164, 0, 255)
RED = (217, 69, 60, 255)


def draw_clock_person(d, S, cx, cy, r, w, color, ticks=True):
    # clock ring
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=w)
    if ticks:
        for ang in (0, 90, 180, 270):
            a = math.radians(ang - 90)
            x1 = cx + (r - S * 0.05) * math.cos(a); y1 = cy + (r - S * 0.05) * math.sin(a)
            x2 = cx + (r - S * 0.018) * math.cos(a); y2 = cy + (r - S * 0.018) * math.sin(a)
            d.line([x1, y1, x2, y2], fill=color, width=max(1, int(w * 0.9)))
    # person head + shoulders inside the ring
    hr = r * 0.30
    hx, hy = cx, cy - r * 0.18
    d.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=color)
    sw = r * 0.62
    sy = hy + hr * 0.65
    sh = r * 0.62
    d.pieslice([cx - sw, sy, cx + sw, sy + sh * 2], start=180, end=360, fill=color)


def app_icon(size=1024):
    S = size * 2
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = int(S * 0.085)
    d.rounded_rectangle([m, m, S - m, S - m], radius=int(S * 0.225), fill=ACCENT)
    draw_clock_person(d, S, S / 2, S / 2, S * 0.30, max(2, int(S * 0.035)), WHITE, ticks=True)
    img.resize((size, size), Image.LANCZOS).save(APP_SRC)
    print("wrote", APP_SRC)


def menubar(size=44):
    # Cleaner small variant: thicker ring, no ticks, person inside.
    for name, color in (("tracking", GREEN), ("idle", AMBER), ("paused", RED)):
        ss = 8
        S = size * ss
        img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        r = S * 0.40
        w = max(2, int(S * 0.085))
        draw_clock_person(d, S, S / 2, S / 2, r, w, color, ticks=False)
        img.resize((size, size), Image.LANCZOS).save(f"{TRAY_DIR}/tray-{name}.png")
        print("wrote", f"{TRAY_DIR}/tray-{name}.png")


if __name__ == "__main__":
    app_icon()
    menubar()
