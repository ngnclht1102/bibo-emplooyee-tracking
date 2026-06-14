"""Generate ctracking icons: app icon + state-colored menu-bar glyphs.

The mark: a center dot emitting two arcs to the right — an 'active signal /
pulse', representing live activity tracking. Drawn supersampled then downscaled
for clean anti-aliased edges.
"""
from PIL import Image, ImageDraw

TRAY_DIR = "/Users/namng/Work/ctracking/apps/desktop/src-tauri/icons/tray"
APP_SRC = "/tmp/ctracking_icon/appicon.png"

ACCENT = (45, 108, 223, 255)  # #2D6CDF

# State tints (vivid mid-tones, readable on light & dark menu bars)
GREEN = (47, 168, 90, 255)    # tracking
AMBER = (224, 164, 0, 255)    # idle
RED = (217, 69, 60, 255)      # paused
WHITE = (255, 255, 255, 255)


def draw_glyph(size, color, ss=4):
    """Center dot + two right-opening arcs, on transparent canvas."""
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = S / 2.0, S / 2.0

    # Shift the cluster slightly left so the arcs are visually centered.
    cx -= S * 0.10

    # center dot
    r = S * 0.11
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)

    # two broadcast arcs opening to the right
    w = max(1, int(S * 0.075))
    for rad in (S * 0.25, S * 0.39):
        d.arc([cx - rad, cy - rad, cx + rad, cy + rad],
              start=-52, end=52, fill=color, width=w)

    return img.resize((size, size), Image.LANCZOS)


def make_menubar():
    # 44px (≈22pt @2x) with padding so the glyph sits ~18pt tall.
    for name, color in (("tracking", GREEN), ("idle", AMBER), ("paused", RED)):
        canvas = Image.new("RGBA", (44, 44), (0, 0, 0, 0))
        g = draw_glyph(36, color)
        canvas.alpha_composite(g, ((44 - 36) // 2, (44 - 36) // 2))
        canvas.save(f"{TRAY_DIR}/tray-{name}.png")
        print("wrote", f"{TRAY_DIR}/tray-{name}.png")


def make_app_icon():
    size = 1024
    S = size * 2
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    margin = int(S * 0.085)
    radius = int(S * 0.225)
    d.rounded_rectangle([margin, margin, S - margin, S - margin],
                        radius=radius, fill=ACCENT)
    g = draw_glyph(int(S * 0.62), WHITE, ss=2)
    img.alpha_composite(g, ((S - g.width) // 2, (S - g.height) // 2))
    img.resize((size, size), Image.LANCZOS).save(APP_SRC)
    print("wrote", APP_SRC)


if __name__ == "__main__":
    make_menubar()
    make_app_icon()
