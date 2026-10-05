"""Image processing helpers for the art pipeline (PIL + numpy only).

cutout()   chroma-key a flat background colour out of a generated image
trim()     crop to the alpha bounding box with padding
fit()      downscale (premultiplied) to fit inside a box
"""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageFilter

KEYS = {
    "green": (0, 255, 0),
    "magenta": (255, 0, 255),
    "blue": (0, 0, 255),
}


def _border_key(a: np.ndarray, nominal: np.ndarray) -> np.ndarray:
    """Estimate the real key colour from border pixels close to the nominal key."""
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    d = np.sqrt(((edge - nominal) ** 2).sum(-1))
    near = edge[d < 140]
    return np.median(near, axis=0) if len(near) > 20 else nominal


def _dilate(mask: np.ndarray, r: int) -> np.ndarray:
    """Square dilation by r pixels (integral image, O(N) for any radius)."""
    return _box(mask.astype(np.float32), r) > 0.5


def _box(x: np.ndarray, r: int) -> np.ndarray:
    """Sum over a (2r+1)^2 window via an integral image; same shape as x."""
    p = np.pad(x, ((r + 1, r), (r + 1, r)), mode="constant")
    c = p.cumsum(0).cumsum(1)
    n = 2 * r + 1
    return (c[n:, n:] - c[:-n, n:] - c[n:, :-n] + c[:-n, :-n]).astype(np.float32)


def _border_connected(mask: np.ndarray) -> np.ndarray:
    """Pixels of `mask` connected (4-way) to the image border, by iterative dilation."""
    seed = np.zeros_like(mask)
    seed[0], seed[-1], seed[:, 0], seed[:, -1] = mask[0], mask[-1], mask[:, 0], mask[:, -1]
    cur = seed
    for _ in range(4000):
        grown = cur.copy()
        grown[1:] |= cur[:-1]
        grown[:-1] |= cur[1:]
        grown[:, 1:] |= cur[:, :-1]
        grown[:, :-1] |= cur[:, 1:]
        grown &= mask
        if (grown == cur).all():
            break
        cur = grown
    return cur


def _spill(a: np.ndarray, key: str) -> np.ndarray:
    """How much the key colour dominates each pixel (0 for neutral/foreground colours)."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if key == "green":
        return g - np.maximum(r, b)
    if key == "magenta":
        return np.minimum(r, b) - g
    return b - np.maximum(r, g)


def cutout(img: Image.Image, key: str = "green", lo: float = 70, holes: bool = True) -> Image.Image:
    """Remove a flat chroma background (classic spill keyer).

    Pixels within `lo` (RGB distance) of the key are background. Near the background
    (a band that scales with image size, since generated edges are soft) alpha comes
    from how much the key channel dominates, and the key colour is removed from the
    pixel (despill). Pixels deeper inside the subject are always opaque but still get
    despilled, so key-tinted dark hair turns neutral instead of transparent.
    With holes=False only background connected to the border is removed.
    """
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    k = _border_key(a, np.array(KEYS[key], np.float32))
    d = np.sqrt(((a - k) ** 2).sum(-1))
    core = d < lo
    if not holes:
        core = _border_connected(d < lo * 2) & core
    rad = max(3, round(max(a.shape[:2]) / 300))
    band = _dilate(core, rad) & ~core
    sk = max(float(_spill(k[None, None], key)[0, 0]), 1.0)
    sp = _spill(a, key)
    alpha = np.ones(d.shape, np.float32)
    alpha[band] = 1 - np.clip(sp[band] / sk, 0, 1)
    alpha[core] = 0
    # tighten: the outer third of the ramp is mostly key colour
    alpha[band] = np.clip((alpha[band] - 0.2) / 0.7, 0, 1)
    # despill wherever the key dominates (edges and tinted interiors)
    spill = np.maximum(sp, 0)
    near = _dilate(core, rad * 3)
    spill = np.where(near, spill, 0)
    if key == "green":
        a[..., 1] -= spill
    elif key == "magenta":
        a[..., 0] -= spill
        a[..., 2] -= spill
    else:
        a[..., 2] -= spill
    al = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.5))
    al = Image.fromarray(np.where(np.asarray(al) < 16, 0, np.asarray(al)).astype(np.uint8))
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert("RGBA")
    out.putalpha(al)
    return out


def remove_specks(img: Image.Image, min_frac: float = 0.002) -> Image.Image:
    """Drop small opaque islands (stray marks) far from the main subject."""
    a = np.asarray(img).copy()
    solid = a[..., 3] > 40
    if not solid.any():
        return img
    big = _dilate(solid, 6)
    # label coarse blobs on a downsampled grid
    h, w = solid.shape
    s = 4
    small = big[::s, ::s]
    labels = np.zeros(small.shape, np.int32)
    n = 0
    sizes = {}
    for y, x in zip(*np.nonzero(small)):
        if labels[y, x]:
            continue
        n += 1
        stack = [(y, x)]
        labels[y, x] = n
        cnt = 0
        while stack:
            cy, cx = stack.pop()
            cnt += 1
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < small.shape[0] and 0 <= nx < small.shape[1] and small[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = n
                    stack.append((ny, nx))
        sizes[n] = cnt
    total = sum(sizes.values())
    keep = {i for i, c in sizes.items() if c >= total * min_frac}
    full = np.kron(np.isin(labels, list(keep)), np.ones((s, s), bool))[:h, :w]
    a[..., 3] = np.where(full, a[..., 3], 0)
    return Image.fromarray(a)


def bbox(img: Image.Image, thresh: int = 12):
    al = np.asarray(img.getchannel("A"))
    ys, xs = np.nonzero(al > thresh)
    if not len(xs):
        return (0, 0, img.width, img.height)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def trim(img: Image.Image, pad: int = 4) -> Image.Image:
    x0, y0, x1, y1 = bbox(img)
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(img.width, x1 + pad), min(img.height, y1 + pad)
    return img.crop((x0, y0, x1, y1))


def fit(img: Image.Image, max_w: int, max_h: int) -> Image.Image:
    s = min(max_w / img.width, max_h / img.height, 1.0)
    if s >= 1.0:
        return img
    size = (max(1, round(img.width * s)), max(1, round(img.height * s)))
    if img.mode == "RGBA":
        return img.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")
    return img.resize(size, Image.LANCZOS)


def circle_mask(img: Image.Image, hole: float = 0.0, inset: float = 0.5) -> Image.Image:
    """Force a perfectly round silhouette: fit a circle to the alpha bbox (antialiased).

    hole: optional centre hole radius as a fraction of the outer radius (CDs, vinyl).
    """
    x0, y0, x1, y1 = bbox(img, 60)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    r = min(x1 - x0, y1 - y0) / 2 - inset
    ss = 4
    w, h = img.size
    yy, xx = np.mgrid[0:h * ss, 0:w * ss]
    dist = np.hypot((xx + 0.5) / ss - cx, (yy + 0.5) / ss - cy)
    inside = (dist <= r) & (dist >= r * hole)
    cov = inside.reshape(h, ss, w, ss).mean(axis=(1, 3))
    a = np.asarray(img).copy()
    # inside the circle the art is opaque, whatever the keyer thought
    a[..., 3] = (cov * 255).astype(np.uint8)
    out = Image.fromarray(a)
    return out.crop((int(cx - r - 2), int(cy - r - 2), int(cx + r + 3), int(cy + r + 3)))


def bleed(img: Image.Image) -> Image.Image:
    """Fill RGB under fully transparent pixels with nearby colours (no dark halos when scaled)."""
    a = np.asarray(img).copy()
    clear = a[..., 3] == 0
    if not clear.any():
        return img
    rgb = Image.fromarray(a[..., :3])
    for r in (3, 9, 27):
        blur = np.asarray(rgb.filter(ImageFilter.BoxBlur(r)))
        a[..., :3] = np.where(clear[..., None], blur, a[..., :3])
    return Image.fromarray(a)


def checker(img: Image.Image, dark: bool = False) -> Image.Image:
    """Composite onto a checkerboard (or dark) background for visual QA."""
    w, h = img.size
    if dark:
        bg = Image.new("RGB", (w, h), (40, 40, 60))
    else:
        yy, xx = np.mgrid[0:h, 0:w]
        c = (((xx // 16) + (yy // 16)) % 2).astype(np.uint8)
        bg = Image.fromarray(np.where(c[..., None] == 1, 205, 255).astype(np.uint8).repeat(3, -1))
    bg = bg.convert("RGBA")
    bg.alpha_composite(img)
    return bg.convert("RGB")


def seamless(img: Image.Image, border: float = 0.18) -> Image.Image:
    """Make a texture tile-friendly by cross-fading with a half-offset copy near the edges."""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    h, w = a.shape[:2]
    rolled = np.roll(a, (h // 2, w // 2), axis=(0, 1))
    yy = np.minimum(np.arange(h), h - 1 - np.arange(h)) / (h * border)
    xx = np.minimum(np.arange(w), w - 1 - np.arange(w)) / (w * border)
    m = np.clip(np.minimum.outer(yy, xx), 0, 1)[..., None]
    m = m * m * (3 - 2 * m)
    return Image.fromarray((a * m + rolled * (1 - m)).astype(np.uint8))


def tint_to(img: Image.Image, target: tuple[int, int, int], amount: float = 1.0) -> Image.Image:
    """Shift the mean colour of an opaque image to `target`."""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    mean = a.reshape(-1, 3).mean(0)
    a += (np.array(target, np.float32) - mean) * amount
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def split_columns(img: Image.Image, n: int, thresh: int = 40) -> list[Image.Image]:
    """Split a transparent line-up (character sheet) into n figures at empty column gaps."""
    al = np.asarray(img.getchannel("A")) > thresh
    cols = al.sum(0)
    filled = cols > 2
    runs = []
    x = 0
    w = len(cols)
    while x < w:
        if filled[x]:
            s = x
            while x < w and filled[x]:
                x += 1
            runs.append([s, x])
        else:
            x += 1
    # merge runs separated by tiny gaps until we have n figures
    while len(runs) > n:
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        i = int(np.argmin(gaps))
        runs[i] = [runs[i][0], runs[i + 1][1]]
        del runs[i + 1]
    return [trim(img.crop((s, 0, e, img.height)), 4) for s, e in runs]


def paper_trim(img: Image.Image, aspect: float, max_frac: float = 0.14) -> Image.Image:
    """Crop unpainted cream/white paper margins off the edges, then centre-crop back to `aspect` (w/h)."""
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    paper = (a.min(-1) > 205) & ((a.max(-1) - a.min(-1)) < 45)
    h, w = paper.shape

    def run(lines: np.ndarray, limit: int) -> int:
        n = 0
        while n < limit and lines[n] > 0.85:
            n += 1
        return n

    rows, cols = paper.mean(1), paper.mean(0)
    top = run(rows, int(h * max_frac))
    bottom = run(rows[::-1], int(h * max_frac))
    left = run(cols, int(w * max_frac))
    right = run(cols[::-1], int(w * max_frac))
    if not (top or bottom or left or right):
        return img
    # a couple of extra pixels to drop the soft edge of the painted area
    pad = max(2, round(max(h, w) / 500))
    x0, y0 = left + (pad if left else 0), top + (pad if top else 0)
    x1, y1 = w - right - (pad if right else 0), h - bottom - (pad if bottom else 0)
    cw, ch = x1 - x0, y1 - y0
    if cw / ch > aspect:
        nw = round(ch * aspect)
        x0 += (cw - nw) // 2
        x1 = x0 + nw
    else:
        nh = round(cw / aspect)
        y0 += (ch - nh) // 2
        y1 = y0 + nh
    return img.crop((x0, y0, x1, y1))


def lawn_top(img: Image.Image, frac: float = 0.95) -> int:
    """First row from which every row below is mostly grass-green."""
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    g = (a[..., 1] > a[..., 0] + 15) & (a[..., 1] > a[..., 2] + 15)
    rows = g.mean(1) > frac
    y = len(rows)
    while y > 0 and rows[y - 1]:
        y -= 1
    return y


def ground_at(img: Image.Image, target: float) -> Image.Image:
    """Move a flat lawn's top edge to `target` (fraction of height) without changing the image size.

    The scenery above the lawn keeps its scale (sky is cropped off the top); the plain lawn below is
    stretched vertically to fill the rest.
    """
    w, h = img.size
    y = lawn_top(img)
    top_h = round(h * target)
    if y <= top_h:
        return img
    top = img.crop((0, y - top_h, w, y))
    lawn = img.crop((0, y, w, h)).resize((w, h - top_h), Image.LANCZOS)
    out = Image.new(img.mode, (w, h))
    out.paste(top, (0, 0))
    out.paste(lawn, (0, top_h))
    return out
