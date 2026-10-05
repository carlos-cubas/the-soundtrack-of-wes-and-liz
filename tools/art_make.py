#!/usr/bin/env python3
"""Art pipeline driver.

  python3 tools/art_make.py gen  <pattern ...> [--force] [-j 4]   generate raws (art-src/raw/<job>.png)
  python3 tools/art_make.py post <pattern ...>                    raw -> public/<out>
  python3 tools/art_make.py pick <job> <prevN>                    restore an older raw generation
  python3 tools/art_make.py preview <pattern ...> [--out file]     contact sheet of finished files for QA
  python3 tools/art_make.py doc                                    rewrite docs/ART.md
  python3 tools/art_make.py list [pattern ...]

Patterns are fnmatch globs on job names, e.g. 'img/sprites/*' or 'img/portraits/liz*'.
"""
from __future__ import annotations

import argparse
import fnmatch
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import art_lib as L  # noqa: E402
from art_jobs import COVER_FULL, JOBS, KEY_TEXT, KIDS, SHEET, STYLE, STYLE_CUT, STYLE_REF_TEXT  # noqa: E402
from genimg import generate  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "art-src" / "raw"
PUBLIC = ROOT / "public"


def select(patterns: list[str]) -> list[str]:
    if not patterns:
        return list(JOBS)
    out = []
    for name in JOBS:
        if any(fnmatch.fnmatch(name, p) or name == p for p in patterns):
            out.append(name)
    if not out:
        sys.exit(f"no job matches {patterns}")
    return out


def raw_path(name: str) -> Path:
    return RAW / f"{name}.png"


FULL_BLEED = ("Full-bleed: the colored illustration covers the entire image edge to edge, with no white paper margin, "
              "no border, no vignette and no frame.")


def uses_cover(j: dict) -> bool:
    """The cover is a style ref only for character art: on objects and backgrounds it leaks its sky-blue
    background, title letters and tiny figures into the image."""
    if "prompt_raw" in j or j["kind"] in ("sheet", "crop", "paper"):
        return False
    return any(r in (SHEET, KIDS) or r.startswith("raw:img/portraits/") or r == "raw:img/sprites/wes-run"
               for r in j["refs"])


def full_prompt(j: dict) -> str:
    if "prompt_raw" in j:
        return j["prompt_raw"]
    ref = f" {STYLE_REF_TEXT}" if uses_cover(j) else ""
    if j["kind"] in ("cut", "circle", "portrait"):
        return (f"{STYLE_CUT}{ref} {j['prompt']} Isolated on a perfectly flat solid {KEY_TEXT[j['key']]} background, "
                f"uniform color edge to edge, no shadow, no ground, no gradient, no texture, no border.")
    return f"{STYLE}{ref} {j['prompt']} {FULL_BLEED}"


def resolve_refs(j: dict) -> list[Path]:
    refs = []
    for r in j["refs"]:
        p = raw_path(r[4:]) if r.startswith("raw:") else ROOT / r
        if not p.exists():
            raise FileNotFoundError(f"ref missing: {p}")
        refs.append(p)
    if uses_cover(j):
        refs.append(ROOT / COVER_FULL)
    return refs


def gen_one(name: str, force: bool) -> str:
    j = JOBS[name]
    out = raw_path(name)
    if j["kind"] == "crop":
        return f"skip {name} (crop of {j['src'][0]})"
    if out.exists() and not force:
        return f"exists {name}"
    if out.exists():
        n = 1
        while out.with_name(f"{out.stem}.prev{n}.png").exists():
            n += 1
        shutil.move(out, out.with_name(f"{out.stem}.prev{n}.png"))
    t = time.time()
    generate(full_prompt(j), out, j["aspect"], resolve_refs(j), None, j.get("size"))
    return f"gen {name} {time.time() - t:.0f}s"


def save(img: Image.Image, dest: Path, quality: int = 82) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.suffix == ".webp":
        if img.mode == "RGBA":
            img.save(dest, "WEBP", quality=quality, method=6, alpha_quality=90)
        else:
            img.convert("RGB").save(dest, "WEBP", quality=quality, method=6)
    else:
        img.save(dest, "PNG", optimize=True)


_SHEETS: dict[str, list[Image.Image]] = {}


def post_one(name: str) -> str:
    j = JOBS[name]
    kind = j["kind"]
    if kind == "sheet":
        return f"skip {name} (sheet)"
    dest = PUBLIC / j["out"]
    mw, mh = j.get("max", (2048, 2048))
    if kind == "crop":
        sheet, idx, count = j["src"]
        if sheet not in _SHEETS:
            cut = L.cutout(Image.open(raw_path(sheet)), JOBS[sheet]["key"])
            _SHEETS[sheet] = L.split_columns(cut, count)
        figs = _SHEETS[sheet]
        img = L.fit(L.bleed(figs[idx]), mw, mh)
        save(img, dest)
    else:
        src = Image.open(raw_path(name))
        if kind == "opaque":
            img = src.convert("RGB")
            if j.get("paper_trim", True):
                aw, ah = (int(v) for v in j["aspect"].split(":"))
                img = L.paper_trim(img, aw / ah)
            if j.get("ground_at"):
                img = L.ground_at(img, j["ground_at"])
            save(L.fit(img, mw, mh), dest)
        elif kind == "icon":
            save(src.convert("RGB").resize((1024, 1024), Image.LANCZOS), dest)
        elif kind == "paper":
            img = L.seamless(L.tint_to(src, (0x7E, 0xD2, 0xFE)))
            save(L.fit(img, mw, mh), dest, quality=80)
        elif kind == "cut":
            img = L.trim(L.remove_specks(L.cutout(src, j["key"])), 4)
            if j.get("alpha"):
                img.putalpha(img.getchannel("A").point(lambda v: int(v * j["alpha"])))
            save(L.fit(L.bleed(img), mw, mh), dest, quality=86)
        elif kind == "circle":
            img = L.circle_mask(L.cutout(src, j["key"]), hole=j.get("hole", 0.0))
            save(L.fit(L.bleed(img), mw, mh), dest, quality=86)
        elif kind == "portrait":
            img = L.remove_specks(L.cutout(src, j["key"]))
            img = portrait_canvas(img, mw, mh)
            save(L.bleed(img), dest, quality=85)
        else:
            raise ValueError(kind)
    im = Image.open(dest)
    return f"post {name} -> {j['out']} {im.size[0]}x{im.size[1]} {dest.stat().st_size // 1024} KB"


def portrait_canvas(img: Image.Image, W: int, H: int) -> Image.Image:
    """Uniform framing: figure bottom flush with the canvas bottom, head top at ~5%, centred."""
    x0, y0, x1, y1 = L.bbox(img, 40)
    fig = img.crop((x0, y0, x1, y1))
    s = min(H * 0.95 / fig.height, W * 0.98 / fig.width)
    fig = fig.convert("RGBa").resize((round(fig.width * s), round(fig.height * s)), Image.LANCZOS).convert("RGBA")
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(fig, ((W - fig.width) // 2, H - fig.height))
    return canvas


def preview(names: list[str], out: Path, dark: bool) -> None:
    tiles = []
    for name in names:
        j = JOBS[name]
        p = PUBLIC / j["out"] if j["kind"] != "sheet" else raw_path(name)
        if not p.exists():
            continue
        im = Image.open(p).convert("RGBA")
        im.thumbnail((360, 300))
        tile = L.checker(im, dark) if im.mode == "RGBA" else im.convert("RGB")
        canvas = Image.new("RGB", (370, 330), (255, 255, 255))
        canvas.paste(tile, ((370 - tile.width) // 2, 2))
        ImageDraw.Draw(canvas).text((4, 314), name.replace("img/", ""), fill=(0, 0, 0))
        tiles.append(canvas)
    if not tiles:
        sys.exit("nothing to preview")
    cols = min(4, len(tiles))
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 370, rows * 330), (255, 255, 255))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * 370, (i // cols) * 330))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(out)


def doc() -> None:
    lines = [
        "# Art",
        "",
        "Every shipped image, generated with nano-banana (`tools/genimg.py`) and post-processed by",
        "`tools/art_make.py` from the manifest in `tools/art_jobs.py` (prompts live there; this file is",
        "regenerated with `python3 tools/art_make.py doc`).",
        "",
        "Style: the figures on the real book cover (`art-src/ref/book-cover-full.png`): clean, thin, even ink",
        "outlines, flat solid fills, no shading or texture, slender proportions, small webtoon-like faces, on the",
        "deck's palette. The cover is attached as a style reference to every generation. History: a flat no-outline",
        "pass, then a coloured-pencil pass, were both rejected by the user as not matching the book.",
        "",
        "Pipeline: `python3 tools/art_make.py gen 'img/sprites/*'` writes raws to `art-src/raw/` (gitignored),",
        "`post` keys/trims/resizes them into `public/`. Cut-outs are generated on a flat chroma colour and keyed",
        "in `tools/art_lib.py` (spill keyer: alpha from key-channel dominance near the background, despill, trim).",
        "Opaque art gets unpainted paper margins auto-cropped (`paper_trim`). Character references:",
        "`art-src/ref/character-sheet-line.png` (adults, line-art redraw of `character-sheet.png`) and",
        "`art-src/ref/kids-sheet-line.png` (age 7, from `kids-sheet.png`). Full-body character sprites are cut from",
        "re-keyed copies of those sheets (`sheets/adults`, `sheets/kids`) so they match the canonical look exactly.",
        "",
        "Conventions for code:",
        "",
        "- Sprites and items are trimmed RGBA PNGs: draw with aspect preserved, characters anchored bottom-centre.",
        "- Facing: `frog`, `frog-jump` face RIGHT; `wes-run`, `liz-car` face LEFT. Mirror with a negative x scale.",
        "- `ketchup` is upside down; the nozzle tip is at the bottom-centre of the image.",
        "- `beachball`, `basketball`, `vinyl`, `cd-playlist` are perfect circles (image box = circle).",
        "- Portraits share one 675x900 canvas: figure cut at the waist flush with the bottom edge, head top ~5%",
        "  from the top, body turned toward the right (toward the dialogue box).",
        "- `ui/paper-blue.webp` averages `#7ed2fe` and tiles reasonably (edges cross-faded).",
        "",
    ]
    total = 0
    section = None
    for name, j in JOBS.items():
        if j["kind"] == "sheet":
            continue
        group = j["out"].split("/")[1] if j["out"].startswith("img/") and j["out"].count("/") > 1 else "other"
        if group != section:
            section = group
            lines += ["", f"## {group}", "", "| file | size | notes | prompt |", "|---|---|---|---|"]
        dest = PUBLIC / j["out"]
        if dest.exists():
            im = Image.open(dest)
            kb = dest.stat().st_size // 1024
            total += dest.stat().st_size
            size = f"{im.size[0]}x{im.size[1]}, {kb} KB"
        else:
            size = "MISSING"
        if j["kind"] == "crop":
            prompt = f"cropped from `{j['src'][0]}` sheet (figure {j['src'][1] + 1})"
        else:
            p = j.get("prompt_raw") or j["prompt"]
            key = f" [key {j['key']}]" if j.get("key") else ""
            refs = ", ".join(r.split("/")[-1] for r in j["refs"])
            prompt = (f"{p}{key}" + (f" (refs: {refs})" if refs else "")).replace("|", "/")
        lines.append(f"| `public/{j['out']}` | {size} | {j.get('note', '')} | {prompt} |")
    sheets = [f"- `{n}`: {(JOBS[n].get('prompt_raw') or '')}" for n in JOBS if JOBS[n]["kind"] == "sheet"]
    lines += ["", "## Intermediate sheets (art-src/raw, not shipped)", ""] + sheets
    lines += ["", f"Total shipped by this manifest: {total / 1e6:.1f} MB (plus map.webp / map-sm.webp).", ""]
    (ROOT / "docs" / "ART.md").write_text("\n".join(lines))
    print(f"docs/ART.md written, {total / 1e6:.1f} MB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["gen", "post", "pick", "preview", "doc", "list"])
    ap.add_argument("names", nargs="*")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("-j", type=int, default=4)
    ap.add_argument("--out")
    ap.add_argument("--dark", action="store_true")
    a = ap.parse_args()
    if a.cmd == "list":
        for n in select(a.names):
            print(n, JOBS[n]["kind"], "raw" if raw_path(n).exists() else "-",
                  "final" if (PUBLIC / JOBS[n]["out"]).exists() else "-")
    elif a.cmd == "gen":
        names = select(a.names)
        with ThreadPoolExecutor(a.j) as ex:
            futs = {ex.submit(gen_one, n, a.force): n for n in names}
            for f in as_completed(futs):
                try:
                    print(f.result(), flush=True)
                except Exception as e:  # keep the batch going
                    print(f"ERROR {futs[f]}: {e}", flush=True)
    elif a.cmd == "post":
        for n in select(a.names):
            try:
                print(post_one(n), flush=True)
            except Exception as e:
                print(f"ERROR {n}: {e!r}", flush=True)
    elif a.cmd == "pick":
        name, prev = a.names
        src = raw_path(name).with_name(f"{raw_path(name).stem}.{prev}.png")
        shutil.copy(src, raw_path(name))
        print(f"restored {src.name}")
    elif a.cmd == "preview":
        out = Path(a.out) if a.out else ROOT / "art-src" / "preview.png"
        preview(select(a.names), out, a.dark)
    elif a.cmd == "doc":
        doc()


if __name__ == "__main__":
    main()
