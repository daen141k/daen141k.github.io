#!/usr/bin/env python3
"""
Asset pipeline for daen141kkbio.

Source files (never modified):
    assets/img/original/avatar.jpg    — personal avatar (640x640)
    assets/img/original/favicon.png   — monogram "d" (1254x1254)

Outputs:
    assets/img/avatar-*.webp / .jpg   — responsive avatar derivatives
    assets/img/favicon-*.png / .ico   — icon set built from the custom drop mark
    assets/img/mark.svg               — the mark itself (single source of truth)
    assets/img/og-cover.jpg           — 1200x630 social preview card

Run:  python3 tools/prepare-assets.py
Deps: Pillow
"""
from __future__ import annotations

import base64
import io
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "img"
SRC = IMG / "original"
FONT_TTF = pathlib.Path("/home/user/.build/InterTight.ttf")  # only used for the OG card

# Light-first brand system (v5): milky paper, graphite ink, teal / lime / green.
PAPER = (246, 248, 244)
INK = (13, 22, 20)
INK_SOFT = (104, 118, 114)
TEAL = (0, 162, 148)
GREEN = (15, 169, 104)
TEAL_DEEP = (0, 128, 118)
LIME = (143, 196, 0)
BG = PAPER  # kept for compatibility with the old helpers


# ---------------------------------------------------------------- avatar -----
def avatar() -> None:
    src = Image.open(SRC / "avatar.jpg").convert("RGB")
    for size in (640, 320, 160):
        out = src.resize((size, size), Image.LANCZOS)
        out.save(IMG / f"avatar-{size}.webp", "WEBP", quality=80, method=6)
        if size == 640:
            out.save(IMG / "avatar-640.jpg", "JPEG", quality=86, optimize=True,
                     progressive=True, subsampling=0)

    # 24px blurred placeholder, inlined into the HTML as a data-uri
    tiny = src.resize((24, 24), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
    buf = io.BytesIO()
    tiny.save(buf, "WEBP", quality=40, method=6)
    b64 = base64.b64encode(buf.getvalue()).decode()
    print(f"LQIP: data:image/webp;base64,{b64} ({len(b64)} chars)")


# ------------------------------------------------------------------ mark -----
# V8 mark: a liquid drop with a counter punched through it — the same shape the
# glass objects make on the page. Geometry lives in a 32x32 box and is shared by
# mark.svg, the icon set and the <symbol id="mark"> sprite in the HTML.
MK_BOX = (6.4, 2.8, 25.6, 30.6)
DROP = dict(apex=(16.0, 2.8), c1=(21.6, 10.2), c2=(25.6, 15.4), cx=16.0, cy=21.0, r=9.6,
            hole=(16.0, 20.4), hole_r=4.4)
DROP_PATH = (
    "M16 2.8C21.6 10.2 25.6 15.4 25.6 21A9.6 9.6 0 0 1 6.4 21C6.4 15.4 10.4 10.2 16 2.8Z"
    " M16 16A4.4 4.4 0 1 0 16 24.8A4.4 4.4 0 1 0 16 16Z"
)


def _bezier(p0, p1, p2, p3, steps=40):
    out = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        out.append((
            u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
        ))
    return out


def _drop_polygon(steps=48):
    import math
    a, c1, c2 = DROP["apex"], DROP["c1"], DROP["c2"]
    right_end = (DROP["cx"] + DROP["r"], DROP["cy"])
    left_end = (DROP["cx"] - DROP["r"], DROP["cy"])
    pts = _bezier(a, c1, c2, right_end, steps)
    for i in range(steps + 1):                     # bottom arc, right -> left
        th = math.radians(i / steps * 180)
        pts.append((DROP["cx"] + DROP["r"] * math.cos(th), DROP["cy"] + DROP["r"] * math.sin(th)))
    pts += _bezier(left_end, (10.4, 15.4), (10.4, 15.4), a, steps)[::-1]
    return pts


def mark_mask(size: int, fill: float = 0.74, ss: int = 6) -> Image.Image:
    """Anti-aliased mask of the drop with its counter punched out."""
    box_w = MK_BOX[2] - MK_BOX[0]
    box_h = MK_BOX[3] - MK_BOX[1]
    big = size * ss
    scale = (fill * big) / box_h
    ox = (big - box_w * scale) / 2 - MK_BOX[0] * scale
    oy = (big - box_h * scale) / 2 - MK_BOX[1] * scale

    layer = Image.new("L", (big, big), 0)
    d = ImageDraw.Draw(layer)
    d.polygon([(ox + x * scale, oy + y * scale) for x, y in _drop_polygon()], fill=255)
    hx, hy = DROP["hole"]
    hr = DROP["hole_r"]
    d.ellipse([ox + (hx - hr) * scale, oy + (hy - hr) * scale,
               ox + (hx + hr) * scale, oy + (hy + hr) * scale], fill=0)
    return layer.resize((size, size), Image.LANCZOS)


def mark_rgba(size: int, fill: float = 0.74, color: tuple[int, int, int] = INK) -> Image.Image:
    layer = Image.new("RGBA", (size, size), color + (0,))
    layer.putalpha(mark_mask(size, fill))
    return layer


# --------------------------------------------------------------- favicon -----
def gradient(size: int, stops: list[tuple[float, tuple[int, int, int]]]) -> Image.Image:
    """Diagonal brand gradient (teal -> green -> lime)."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x / max(1, size - 1)) * 0.62 + (y / max(1, size - 1)) * 0.38
            for i in range(len(stops) - 1):
                a, ca = stops[i]
                b, cb = stops[i + 1]
                if a <= t <= b:
                    k = (t - a) / (b - a)
                    px[x, y] = tuple(round(ca[j] + (cb[j] - ca[j]) * k) for j in range(3))
                    break
            else:
                px[x, y] = stops[-1][1]
    return img


GRAD = [(0.0, TEAL), (0.46, GREEN), (1.0, LIME)]


def icon(size: int, fill: float, radius: float = 0.235) -> Image.Image:
    """Gradient tile with the mark knocked out in white."""
    tile = gradient(size, GRAD).convert("RGBA")
    if radius:
        mask = Image.new("L", (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * radius), fill=255)
        tile.putalpha(mask.resize((size, size), Image.LANCZOS))
    white = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    white.putalpha(mark_mask(size, fill=fill))
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(tile)
    out.alpha_composite(white)
    return out


def favicon() -> None:
    for size in (32, 96, 192, 512):
        fill = 0.82 if size <= 48 else 0.76
        icon(size, fill=fill).save(IMG / f"favicon-{size}.png", optimize=True)

    ico = icon(64, fill=0.84)
    ico.save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    # maskable icon: extra safe area for Android adaptive masks
    icon(512, fill=0.54, radius=0).save(IMG / "icon-maskable-512.png", optimize=True)

    # apple touch icon: rounded, generous margin, opaque
    touch = Image.new("RGB", (180, 180), PAPER)
    ic = icon(180, fill=0.58)
    touch.paste(ic.convert("RGB"), (0, 0), ic.split()[-1])
    touch.save(IMG / "apple-touch-icon.png", optimize=True)


# --------------------------------------------------------------- og card -----
def blob(layer: Image.Image, center: tuple[int, int], radius: int, color: tuple[int, int, int], alpha: int) -> None:
    """Soft radial colour field — computed, then scaled up, so no square edges."""
    n = 192
    mask = Image.new("L", (n, n), 0)
    px = mask.load()
    for y in range(n):
        for x in range(n):
            dx = (x + 0.5) / n * 2 - 1
            dy = (y + 0.5) / n * 2 - 1
            d = min(1.0, (dx * dx + dy * dy) ** 0.5)
            v = 1.0 - d
            px[x, y] = int(alpha * (v * v * (3 - 2 * v)))
    mask = mask.resize((radius * 2, radius * 2), Image.BICUBIC)
    tint = Image.new("RGBA", (radius * 2, radius * 2), color + (0,))
    tint.putalpha(mask)
    layer.alpha_composite(tint, (center[0] - radius, center[1] - radius))


def og() -> None:
    """Social card in the current brutal tone: flat black, white type, teal rule."""
    W, H = 1200, 630
    BG = (7, 10, 9)
    WHITE = (237, 245, 240)
    SOFT = (140, 156, 150)
    card = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(card)

    # hairline frame and a couple of flat white marks, nothing soft
    d.rectangle([26, 26, W - 27, H - 27], outline=(52, 66, 62), width=2)
    d.ellipse([880, 300, 1240, 660], outline=WHITE, width=2)
    d.line([(1035, 96), (1035, 176)], fill=WHITE, width=3)
    d.line([(995, 136), (1075, 136)], fill=WHITE, width=3)
    d.rectangle([72, 196, 208, 202], fill=TEAL)
    for i, x in enumerate((72, 96, 120)):
        d.rectangle([x, 566, x + 12, 578], fill=TEAL if i == 0 else SOFT)

    def f(wght: int, size: int) -> ImageFont.FreeTypeFont:
        ft = ImageFont.truetype(str(FONT_TTF), size)
        try:
            ft.set_variation_by_axes([wght])
        except Exception:
            pass
        return ft

    card.paste(WHITE, (72, 72), mark_rgba(36, fill=0.92, color=WHITE))
    d.text((122, 74), "daen141kk", font=f(600, 26), fill=WHITE)
    d.text((72, 226), "DAEN141KK", font=f(640, 112), fill=WHITE)
    d.text((76, 372), "\u041f\u0420\u041e\u0424\u0418\u041b\u0418  \u00b7  \u041f\u0420\u041e\u0415\u041a\u0422\u042b  \u00b7  \u0421\u0412\u042f\u0417\u042c", font=f(500, 22), fill=SOFT)
    d.text((76, 500), "GITHUB.COM/DAEN141K  \u00b7  TELEGRAM  \u00b7  STEAM  \u00b7  FUNPAY  \u00b7  GUNS.LOL", font=f(500, 17), fill=SOFT)

    card.save(IMG / "og-cover.jpg", "JPEG", quality=90, optimize=True, progressive=True)
    card.save(IMG / "og-cover.png", "PNG", optimize=True)


def mark_file() -> None:
    """The mark as a standalone SVG, tinted with the primary accent."""
    path = DROP_PATH
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" '
        'role="img" aria-label="daen141kk"><path fill="#00A294" fill-rule="evenodd" d="' + path + '"/></svg>\n'
    )
    (IMG / "mark.svg").write_text(svg, encoding="utf-8")


if __name__ == "__main__":
    if "--keep-avatar" not in sys.argv:
        avatar()
    favicon()
    og()
    mark_file()
    for p in sorted(IMG.glob("*")):
        if p.is_file():
            print(f"{p.name:24} {p.stat().st_size / 1024:7.1f} KB")
