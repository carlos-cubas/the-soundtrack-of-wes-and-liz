#!/usr/bin/env python3
"""Generate an image with Gemini (nano-banana) and save it as PNG.

Usage:
  python3 tools/genimg.py --out art-src/raw/wes.png --aspect 3:4 \
      --prompt "..." [--ref path/to/ref.png ...] [--model gemini-3.1-flash-image]

Reads GEMINI_API_KEY from the environment or from .env.local at the repo root.
Reference images are sent inline so characters stay consistent across shots.
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS = ["gemini-3.1-flash-image", "gemini-2.5-flash-image", "gemini-3-pro-image"]


def api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("GEMINI_API_KEY not set (env or .env.local)")


def mime_for(path: Path) -> str:
    ext = path.suffix.lower()
    return {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}.get(ext, "image/png")


def generate(prompt: str, out: Path, aspect: str, refs: list[Path], model: str | None, size: str | None) -> Path:
    parts = []
    for ref in refs:
        parts.append({"inline_data": {"mime_type": mime_for(ref), "data": base64.b64encode(ref.read_bytes()).decode()}})
    parts.append({"text": prompt})
    image_config = {"aspectRatio": aspect}
    if size:
        image_config["imageSize"] = size
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": image_config},
    }
    models = [model] if model else MODELS
    last_err = ""
    for m in models:
        empty = 0
        for attempt in range(6):
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"
            req = urllib.request.Request(
                url,
                data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json", "x-goog-api-key": api_key()},
            )
            try:
                with urllib.request.urlopen(req, timeout=240) as resp:
                    data = json.load(resp)
            except urllib.error.HTTPError as e:
                last_err = f"{m}: HTTP {e.code} {e.read()[:400].decode(errors='replace')}"
                if e.code in (429, 500, 502, 503, 504):
                    time.sleep(10 * (attempt + 1))
                    continue
                if e.code == 400 and "imageSize" in body["generationConfig"]["imageConfig"]:
                    body["generationConfig"]["imageConfig"].pop("imageSize")
                    continue
                break
            except Exception as e:  # network hiccup
                last_err = f"{m}: {e}"
                time.sleep(5)
                continue
            for cand in data.get("candidates", []):
                for part in cand.get("content", {}).get("parts", []):
                    blob = part.get("inline_data") or part.get("inlineData")
                    if blob and blob.get("data"):
                        out.parent.mkdir(parents=True, exist_ok=True)
                        raw = base64.b64decode(blob["data"])
                        tmp = out.with_suffix(".tmp")
                        tmp.write_bytes(raw)
                        # Normalise to PNG regardless of what the API returned.
                        try:
                            from PIL import Image

                            Image.open(tmp).convert("RGBA" if out.suffix == ".png" else "RGB").save(out)
                            tmp.unlink()
                        except Exception:
                            tmp.rename(out)
                        print(f"ok {m} -> {out}", flush=True)
                        return out
            # No image (safety block or text-only answer): retry a couple of times, then next model.
            last_err = f"{m}: no image in response: {json.dumps(data)[:400]}"
            empty += 1
            if empty >= 2:
                break
    raise RuntimeError(f"FAILED {out}: {last_err}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--aspect", default="1:1", help="1:1 3:4 4:3 9:16 16:9 2:3 3:2 4:5 5:4 21:9")
    ap.add_argument("--ref", action="append", default=[])
    ap.add_argument("--model")
    ap.add_argument("--size", help="1K, 2K or 4K where supported")
    a = ap.parse_args()
    try:
        generate(a.prompt, Path(a.out), a.aspect, [Path(r) for r in a.ref], a.model, a.size)
    except RuntimeError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
