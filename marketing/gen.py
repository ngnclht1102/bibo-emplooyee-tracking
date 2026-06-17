"""Generate marketing graphics for BiBoEmployeeTracking.

Outputs into marketing/{logo,social,features,hero}. Uses the clock+person brand
mark and the SF system font. Everything supersampled then downscaled for clean edges.
"""
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = "/Users/namng/Work/ctracking/marketing"

# ---- palette ----
ACCENT = (45, 108, 223, 255)       # #2D6CDF
ACCENT_DK = (26, 73, 168, 255)     # #1A49A8
INK = (26, 26, 26, 255)            # #1A1A1A
MUTED = (107, 107, 107, 255)       # #6B6B6B
BG = (255, 255, 255, 255)
SUBTLE = (246, 246, 246, 255)
BORDER = (227, 227, 227, 255)
WHITE = (255, 255, 255, 255)
GREEN = (47, 168, 90, 255)
AMBER = (224, 164, 0, 255)
RED = (217, 69, 60, 255)

SF = "/System/Library/Fonts/SFNS.ttf"
SF_RND = "/System/Library/Fonts/SFNSRounded.ttf"
ARIAL_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def font(size, bold=False):
    try:
        f = ImageFont.truetype(SF, size)
        if bold:
            try:
                f.set_variation_by_name("Bold")
            except Exception:
                f = ImageFont.truetype(ARIAL_BOLD, size)
        return f
    except Exception:
        return ImageFont.truetype(ARIAL_BOLD if bold else SF, size)


def text_w(d, s, f):
    return d.textbbox((0, 0), s, font=f)[2]


# ---- brand mark (clock + person) ----
def draw_mark(d, S, cx, cy, r, w, color, ticks=True):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=w)
    if ticks:
        for ang in (0, 90, 180, 270):
            a = math.radians(ang - 90)
            x1 = cx + (r - S * 0.05) * math.cos(a); y1 = cy + (r - S * 0.05) * math.sin(a)
            x2 = cx + (r - S * 0.018) * math.cos(a); y2 = cy + (r - S * 0.018) * math.sin(a)
            d.line([x1, y1, x2, y2], fill=color, width=max(1, int(w * 0.9)))
    hr = r * 0.30
    hx, hy = cx, cy - r * 0.18
    d.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=color)
    sw = r * 0.62
    sy = hy + hr * 0.65
    sh = r * 0.62
    d.pieslice([cx - sw, sy, cx + sw, sy + sh * 2], start=180, end=360, fill=color)


def mark_png(size, color, ticks=True, ss=4):
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_mark(d, S, S / 2, S / 2, S * 0.40, max(2, int(S * 0.075)), color, ticks)
    return img.resize((size, size), Image.LANCZOS)


def squircle_icon(size, ss=2):
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = int(S * 0.085)
    d.rounded_rectangle([m, m, S - m, S - m], radius=int(S * 0.225), fill=ACCENT)
    draw_mark(d, S, S / 2, S / 2, S * 0.30, max(2, int(S * 0.035)), WHITE, ticks=True)
    return img.resize((size, size), Image.LANCZOS)


def logos():
    mark_png(512, ACCENT).save(f"{ROOT}/logo/mark-accent.png")
    mark_png(512, WHITE).save(f"{ROOT}/logo/mark-white.png")
    squircle_icon(512).save(f"{ROOT}/logo/app-icon.png")
    mark_png(128, ACCENT).save(f"{ROOT}/logo/favicon.png")

    # horizontal lockups: mark + wordmark
    for name, txtcolor, markcolor in (("lockup-light", INK, ACCENT), ("lockup-dark", WHITE, WHITE)):
        ss = 3
        H = 160 * ss
        f = font(int(86 * ss), bold=True)
        tmp = Image.new("RGBA", (10, 10))
        td = ImageDraw.Draw(tmp)
        word = "BiBoEmployeeTracking"
        tw = text_w(td, word, f)
        marksz = int(H * 0.78)
        gap = int(20 * ss)
        W = marksz + gap + int(tw) + int(20 * ss)
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        m = mark_png(marksz, markcolor)
        img.alpha_composite(m, (0, (H - marksz) // 2))
        bbox = d.textbbox((0, 0), word, font=f)
        ty = (H - (bbox[3] - bbox[1])) // 2 - bbox[1]
        d.text((marksz + gap, ty), word, font=f, fill=txtcolor)
        img.resize((W // ss, H // ss), Image.LANCZOS).save(f"{ROOT}/logo/{name}.png")
    print("logos done")


def gradient_bg(W, H, top, bottom):
    base = Image.new("RGBA", (W, H))
    for y in range(H):
        t = y / max(1, H - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(4))
        for x in range(0, W, 1):
            pass
    # faster: build via vertical line draws
    img = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / max(1, H - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(4))
        d.line([(0, y), (W, y)], fill=c)
    return img


def social():
    # OG image 1200x630
    W, H = 1200, 630
    img = gradient_bg(W, H, ACCENT, ACCENT_DK)
    d = ImageDraw.Draw(img)
    mk = mark_png(150, WHITE)
    img.alpha_composite(mk, (90, 90))
    d.text((250, 110), "BiBoEmployeeTracking", font=font(58, bold=True), fill=WHITE)
    d.text((252, 185), "Local-first time & activity tracking for macOS", font=font(30), fill=(230, 238, 255, 255))
    # feature bullets
    feats = ["App & window time (idle-aware)", "Keystroke counts — never the keys",
             "Periodic screenshots", "Browser pages & time", "100% local · CSV / JSON export"]
    y = 300
    for fr in feats:
        d.ellipse([95, y + 12, 113, y + 30], fill=WHITE)
        d.text((130, y), fr, font=font(30), fill=WHITE)
        y += 56
    img.save(f"{ROOT}/social/og-image.png")
    # square 1080 for socials
    sq = gradient_bg(1080, 1080, ACCENT, ACCENT_DK)
    d2 = ImageDraw.Draw(sq)
    m2 = mark_png(360, WHITE)
    sq.alpha_composite(m2, ((1080 - 360) // 2, 230))
    w = "BiBoEmployeeTracking"
    fw = font(76, bold=True)
    d2.text(((1080 - text_w(d2, w, fw)) // 2, 640), w, font=fw, fill=WHITE)
    tg = "Local-first time tracking for macOS"
    ft = font(36)
    d2.text(((1080 - text_w(d2, tg, ft)) // 2, 740), tg, font=ft, fill=(230, 238, 255, 255))
    sq.save(f"{ROOT}/social/square-1080.png")
    print("social done")


# ---- feature icons (flat, accent on subtle rounded tile) ----
def tile(size, draw_glyph):
    ss = 4
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S, S], radius=int(S * 0.24), fill=(45, 108, 223, 28))
    draw_glyph(d, S)
    return img.resize((size, size), Image.LANCZOS)


def f_clock(d, S):
    cx, cy, r = S / 2, S / 2, S * 0.27
    w = int(S * 0.055)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ACCENT, width=w)
    d.line([cx, cy, cx, cy - r * 0.55], fill=ACCENT, width=w)
    d.line([cx, cy, cx + r * 0.5, cy], fill=ACCENT, width=w)


def f_keyboard(d, S):
    x0, y0, x1, y1 = S * 0.18, S * 0.30, S * 0.82, S * 0.70
    d.rounded_rectangle([x0, y0, x1, y1], radius=int(S * 0.04), outline=ACCENT, width=int(S * 0.045))
    r = S * 0.022
    for gx in (0.30, 0.42, 0.54, 0.66):
        for gy in (0.42, 0.55):
            cx, cy = S * gx, S * gy
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT)
    d.rounded_rectangle([S * 0.34, S * 0.60, S * 0.66, S * 0.635], radius=int(S*0.01), fill=ACCENT)


def f_camera(d, S):
    x0, y0, x1, y1 = S * 0.18, S * 0.34, S * 0.82, S * 0.70
    d.rounded_rectangle([x0, y0, x1, y1], radius=int(S * 0.05), outline=ACCENT, width=int(S * 0.045))
    d.rounded_rectangle([S * 0.40, S * 0.28, S * 0.60, S * 0.36], radius=int(S*0.02), fill=ACCENT)
    cx, cy, r = S / 2, S * 0.52, S * 0.10
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ACCENT, width=int(S * 0.04))


def f_globe(d, S):
    cx, cy, r = S / 2, S / 2, S * 0.27
    w = int(S * 0.04)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ACCENT, width=w)
    d.line([cx - r, cy, cx + r, cy], fill=ACCENT, width=w)
    d.ellipse([cx - r * 0.45, cy - r, cx + r * 0.45, cy + r], outline=ACCENT, width=w)


def f_shield(d, S):
    cx = S / 2
    top, bot = S * 0.22, S * 0.80
    w = S * 0.26
    pts = [(cx, top), (cx + w, top + S * 0.06), (cx + w, S * 0.50),
           (cx, bot), (cx - w, S * 0.50), (cx - w, top + S * 0.06)]
    d.polygon(pts, outline=ACCENT, width=int(S * 0.045))
    # check
    d.line([cx - S * 0.10, S * 0.48, cx - S * 0.02, S * 0.56], fill=ACCENT, width=int(S * 0.05))
    d.line([cx - S * 0.02, S * 0.56, cx + S * 0.13, S * 0.38], fill=ACCENT, width=int(S * 0.05))


def f_menubar(d, S):
    d.rounded_rectangle([S * 0.16, S * 0.26, S * 0.84, S * 0.40], radius=int(S * 0.02),
                        outline=ACCENT, width=int(S * 0.035))
    cx, cy, r = S * 0.72, S * 0.33, S * 0.03
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT)
    d.rounded_rectangle([S * 0.30, S * 0.50, S * 0.70, S * 0.74], radius=int(S * 0.03),
                        outline=ACCENT, width=int(S * 0.035))


def features():
    items = [("time", f_clock), ("keyboard", f_keyboard), ("screenshots", f_camera),
             ("browser", f_globe), ("private", f_shield), ("menubar", f_menubar)]
    for name, fn in items:
        tile(160, fn).save(f"{ROOT}/features/{name}.png")
    print("features done")


# ---- hero: stylized app window ----
def hero():
    ss = 2
    W, H = 1200 * ss, 760 * ss
    pad = 40 * ss
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # window
    wx0, wy0, wx1, wy1 = pad, pad, W - pad, H - pad
    rad = int(22 * ss)
    # soft shadow
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle([wx0, wy0 + 10 * ss, wx1, wy1 + 10 * ss], radius=rad, fill=(20, 30, 60, 60))
    img.alpha_composite(sh)
    d.rounded_rectangle([wx0, wy0, wx1, wy1], radius=rad, fill=BG, outline=BORDER, width=ss)
    # title bar
    d.rounded_rectangle([wx0, wy0, wx1, wy0 + 52 * ss], radius=rad, fill=SUBTLE)
    d.rectangle([wx0, wy0 + 30 * ss, wx1, wy0 + 52 * ss], fill=SUBTLE)
    for i, c in enumerate([(237, 106, 94), (245, 191, 79), (98, 197, 84)]):
        cxx = wx0 + (28 + i * 26) * ss
        d.ellipse([cxx, wy0 + 18 * ss, cxx + 16 * ss, wy0 + 34 * ss], fill=c + (255,))
    # tracking pill (right)
    pill_w = 120 * ss
    d.rounded_rectangle([wx1 - pill_w - 20 * ss, wy0 + 14 * ss, wx1 - 20 * ss, wy0 + 40 * ss],
                        radius=13 * ss, fill=(47, 168, 90, 40))
    d.ellipse([wx1 - pill_w - 6 * ss, wy0 + 22 * ss, wx1 - pill_w + 6 * ss, wy0 + 34 * ss], fill=GREEN)
    d.text((wx1 - pill_w + 16 * ss, wy0 + 18 * ss), "Tracking", font=font(20 * ss), fill=GREEN)

    cy0 = wy0 + 52 * ss
    # sidebar
    sb_w = 210 * ss
    d.rectangle([wx0, cy0, wx0 + sb_w, wy1], fill=SUBTLE)
    # brand in sidebar
    bm = mark_png(26 * ss, ACCENT)
    img.alpha_composite(bm, (wx0 + 22 * ss, cy0 + 22 * ss))
    d.text((wx0 + 56 * ss, cy0 + 24 * ss), "BiBoEmployeeTracking", font=font(18 * ss, bold=True), fill=INK)
    navs = ["Dashboard", "Activity", "Screenshots", "Browser", "Permissions", "Settings"]
    for i, nv in enumerate(navs):
        yy = cy0 + (70 + i * 40) * ss
        if i == 0:
            d.rounded_rectangle([wx0 + 14 * ss, yy - 6 * ss, wx0 + sb_w - 14 * ss, yy + 26 * ss],
                                radius=8 * ss, fill=(45, 108, 223, 30))
        d.text((wx0 + 28 * ss, yy), nv, font=font(19 * ss, bold=(i == 0)),
               fill=ACCENT if i == 0 else MUTED)

    # content: stat cards
    cxs = wx0 + sb_w + 30 * ss
    cw = (wx1 - cxs - 30 * ss - 3 * 18 * ss) // 4
    stats = [("Active today", "6h 21m"), ("Top app", "VS Code"), ("Keypresses", "14,302"), ("Screenshots", "38")]
    for i, (lab, val) in enumerate(stats):
        x = cxs + i * (cw + 18 * ss)
        d.rounded_rectangle([x, cy0 + 28 * ss, x + cw, cy0 + 120 * ss], radius=10 * ss, fill=SUBTLE, outline=BORDER, width=ss)
        d.text((x + 16 * ss, cy0 + 44 * ss), lab.upper(), font=font(14 * ss), fill=MUTED)
        d.text((x + 16 * ss, cy0 + 68 * ss), val, font=font(34 * ss, bold=True), fill=INK)

    # timeline
    ty = cy0 + 150 * ss
    d.text((cxs, ty), "Today's timeline", font=font(18 * ss, bold=True), fill=INK)
    tlx0, tlx1 = cxs, wx1 - 30 * ss
    bar_y = ty + 34 * ss
    d.rounded_rectangle([tlx0, bar_y, tlx1, bar_y + 36 * ss], radius=8 * ss, fill=SUBTLE, outline=BORDER, width=ss)
    segs = [(0.0, 0.18, 0.9), (0.18, 0.26, 0.5), (0.26, 0.32, None), (0.32, 0.56, 0.9),
            (0.56, 0.66, 0.5), (0.66, 0.74, None), (0.74, 1.0, 0.7)]
    for a, b, op in segs:
        x0 = tlx0 + (tlx1 - tlx0) * a
        x1 = tlx0 + (tlx1 - tlx0) * b
        if op is None:
            continue
        col = (45, 108, 223, int(255 * op))
        d.rounded_rectangle([x0 + ss, bar_y + 4 * ss, x1 - ss, bar_y + 32 * ss], radius=5 * ss, fill=col)

    # bar chart (keyboard activity)
    chx0 = cxs
    chy = bar_y + 80 * ss
    d.text((cxs, chy - 30 * ss), "Keyboard activity", font=font(18 * ss, bold=True), fill=INK)
    n = 22
    bw = (tlx1 - chx0) / n
    import random
    heights = [20, 45, 70, 95, 80, 50, 110, 140, 120, 60, 25, 10, 55, 100, 130, 110, 85, 70, 95, 60, 30, 15]
    maxh = max(heights)
    base = chy + 150 * ss
    for i, h in enumerate(heights):
        bh = (h / maxh) * 130 * ss
        x = chx0 + i * bw
        d.rounded_rectangle([x + 3 * ss, base - bh, x + bw - 3 * ss, base], radius=4 * ss, fill=(45, 108, 223, 210))

    img.resize((W // ss, H // ss), Image.LANCZOS).save(f"{ROOT}/hero/app-window.png")
    print("hero done")


if __name__ == "__main__":
    logos()
    social()
    features()
    # NOTE: hero/app-window.png is a REAL screenshot of the app (captured via
    # screencapture + rounded/shadowed), not the old mock. We don't regenerate it
    # here so this script never clobbers the real product shot.
    print("ALL DONE")
