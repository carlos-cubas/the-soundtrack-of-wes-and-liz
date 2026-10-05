#!/usr/bin/env python3
"""Generate the game's sound effects with the ElevenLabs Sound Effects API.

Usage:
  python3 tools/eleven_sfx.py gen [names...] [--force]   fetch raw takes into --raw (PCM/mp3)
  python3 tools/eleven_sfx.py make [names...]            trim/normalise -> public/audio/sfx/<name>.m4a
                                                          and write src/data/sfx.json

Raw takes are kept outside the repo (default: $TMPDIR/wesliz-sfx-raw) so `make` can be
re-tuned without paying for new generations. Each effect is trimmed to its onset, faded
out, peak-normalised and encoded as mono AAC; sfx.json carries a playback gain that
brings every effect to the same loudness (TARGET_LUFS + its own offset). Names missing
here stay on the synth in core/audio.ts.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import eleven_lib as L  # noqa: E402

OUT = L.ROOT / "public/audio/sfx"
MANIFEST = L.ROOT / "src/data/sfx.json"
LEDGER = L.ROOT / "tools/eleven_ledger.json"
RAW = Path(os.environ.get("WESLIZ_SFX_RAW", Path(tempfile.gettempdir()) / "wesliz-sfx-raw"))
SR = 44100
# Newest sound model the API accepts on this plan (GET /v1/models is not readable with the
# scoped key; an invalid model_id gets a 422 listing the allowed ids). v3 also takes `loop`.
MODEL = "eleven_text_to_sound_v3"
TARGET_LUFS = -16.0  # loudest 400 ms of each effect, before the sfx bus (0.8)


class S:
    """One effect: prompt, requested length, max kept length, loudness offset (dB), pitch variance."""

    def __init__(self, prompt: str, dur: float, keep: float | None = None, db: float = 0.0, vary: float = 0.0,
                 loop: bool = False, influence: float = 0.55):
        self.prompt, self.dur, self.keep, self.db, self.vary = prompt, dur, keep or dur, db, vary
        self.loop, self.influence = loop, influence


SFX: dict[str, S] = {
    "jump": S("cartoon spring boing for a small frog jumping, one short bouncy boing", 0.6, vary=0.06),
    "land": S("soft little cartoon landing thump on a wooden floor, one short thud", 0.5, keep=0.35, db=-3, vary=0.08),
    "hit": S("cartoon bonk impact with a comic squeaky toy honk, getting hit, one short hit", 0.6, vary=0.04),
    "bonk": S("rubber basketball bouncing hard off someone's head, cartoon bonk, one hit", 0.6, vary=0.05),
    "collect": S("bright magical sparkle pickup chime, short video game collect sound", 0.6, db=-3, vary=0.03),
    "grab": S("quick fabric rustle of grabbing a shirt off a clothes hanger, short", 0.5, keep=0.4, db=-2, vary=0.06),
    "pop": S("cartoon pop of a garden gnome's head popping off, like a cork, one short pop", 0.5, keep=0.4, vary=0.07),
    "star": S("single bright twinkling star ding, glockenspiel with sparkle, short", 0.8, db=-3),
    "win": S("short triumphant cheerful victory jingle, bright brass and glockenspiel, level complete", 2.5, db=-1),
    "lose": S("short comedic sad trombone wah wah wah fail jingle, game over", 2.2, db=-2),
    "unlock": S("magical unlock shimmer, quick rising harp glissando ending on a bell ding", 1.2, db=-3),
    "claim": S("reward claimed chime, bright bell chord with a sparkle, satisfying and short", 1.2, db=-3),
    "whoosh": S("fast air whoosh swipe, short", 0.6, keep=0.5, db=-3, vary=0.06),
    "swish": S("quick light swish of a ball flying past, short", 0.5, keep=0.4, db=-4, vary=0.08),
    "squirt": S("squeezing a plastic ketchup bottle, short wet squirt", 0.6, keep=0.3, db=-2, vary=0.06),
    "splat": S("wet ketchup splat onto a plate, short", 0.6, keep=0.5, db=-2, vary=0.06),
    "splash": S("foot stomping into a rain puddle, water splash, short", 0.8, vary=0.05),
    "thunder": S("loud close thunder crack followed by a deep rolling rumble", 3.5, db=3),
    "kiss": S("cute cartoon kiss smooch, one short mwah", 0.6, keep=0.5, db=-3, vary=0.04),
    "scream": S("cartoon little kid shouting eww in disgust, short", 1.0, db=-2),
    "page": S("single paper page turn of a storybook, short", 0.6, db=-5, vary=0.05),
    "whoa": S("small crowd of teenagers going whoa in amazement, short", 1.4, db=-3),
    "cheer": S("small crowd of teenagers cheering and clapping, short", 2.2, db=-3),
    "ribbit": S("cute cartoon frog ribbit croak, one short croak", 0.6, keep=0.5, db=-2, vary=0.06),
    "camera": S("camera shutter click with a flash pop, fashion photo, short", 0.5, keep=0.4, db=-4, vary=0.03),
    "rain": S("steady heavy rain falling on a car roof and pavement, constant, no thunder", 12.0, loop=True, db=-9, influence=0.45),
}


def ledger() -> dict:
    return json.loads(LEDGER.read_text()) if LEDGER.exists() else {}


def gen(names: list[str], force: bool) -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    book = ledger()
    fmt = "pcm_44100"
    for name in names:
        s = SFX[name]
        if any((RAW / f"{name}.{e}").exists() for e in ("pcm", "mp3")) and not force:
            print(f"{name}: raw exists, skipping")
            continue
        body = {"text": s.prompt, "duration_seconds": s.dur, "prompt_influence": s.influence, "model_id": MODEL}
        if s.loop:
            body["loop"] = True
        try:
            data, headers = L.post("/v1/sound-generation", body, f"output_format={fmt}", timeout=180)
            ext = "pcm"
        except RuntimeError as e:
            if fmt == "pcm_44100" and ("403" in str(e) or "tier" in str(e).lower() or "output_format" in str(e)):
                print(f"{name}: pcm_44100 refused ({e}); falling back to mp3_44100_128")
                fmt = "mp3_44100_128"
                data, headers = L.post("/v1/sound-generation", body, f"output_format={fmt}", timeout=180)
                ext = "mp3"
            else:
                print(f"{name}: FAILED {e}")
                continue
        (RAW / f"{name}.{ext}").write_bytes(data)
        book[f"sfx:{name}"] = {"seconds": s.dur, "model": MODEL, "format": fmt, "cost": headers.get("character-cost"),
                               "prompt": s.prompt, "loop": s.loop}
        LEDGER.write_text(json.dumps(book, indent=2))
        print(f"{name}: {len(data)} bytes, cost={headers.get('character-cost')}")


def load_raw(name: str) -> np.ndarray:
    """Mono float32 at SR. PCM takes are interleaved s16le; the channel count follows from the requested length."""
    pcm = RAW / f"{name}.pcm"
    if pcm.exists():
        x = np.frombuffer(pcm.read_bytes(), "<i2").astype(np.float32) / 32768.0
        ratio = len(x) / (SFX[name].dur * SR)
        ch = max(1, round(ratio))
        assert abs(ratio - ch) < 0.15, f"{name}: {len(x)} samples is not a whole channel count for {SFX[name].dur} s"
        return x[: len(x) // ch * ch].reshape(-1, ch).mean(1)
    x, sr = L.decode(RAW / f"{name}.mp3")
    assert sr == SR, sr
    return x.mean(1)


def shape(x: np.ndarray, s: S) -> np.ndarray:
    """Trim to the onset, cap the length, fade the tail, peak-normalise to -1 dBFS."""
    x = x - x.mean()
    peak = np.abs(x).max()
    if peak < 1e-4:
        raise ValueError("silent take")
    loud = np.nonzero(np.abs(x) > peak * 10 ** (-38 / 20))[0]
    # start 5 ms before the first 5 ms frame within 20 dB of the loudest: quiet pre-noise is latency
    w = int(0.005 * SR)
    k = len(x) // w
    env = np.sqrt((x[: k * w].reshape(k, w) ** 2).mean(1))
    a = max(0, int(np.argmax(env >= env.max() * 0.1)) * w - w)
    b = min(len(x), loud[-1] + int(0.03 * SR), a + int(s.keep * SR))
    y = x[a:b].copy()
    fi = min(int(0.002 * SR), len(y))
    y[:fi] *= np.linspace(0, 1, fi)
    fo = min(int(max(0.04, 0.25 * len(y) / SR) * SR), len(y))
    y[-fo:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fo))) ** 1.5
    return y / np.abs(y).max() * 10 ** (-1 / 20)


def shape_loop(x: np.ndarray, xf: float = 0.5) -> np.ndarray:
    """Make a take loop seamlessly: blend its tail into its head and drop the tail."""
    n = int(xf * SR)
    x = x - x.mean()
    y = x[: len(x) - n].copy()
    w = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n))
    y[:n] = x[:n] * w + x[len(x) - n :] * (1 - w)
    return y / np.abs(y).max() * 10 ** (-1 / 20)


def make(names: list[str]) -> None:
    data = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    for name in names:
        s = SFX[name]
        if not any((RAW / f"{name}.{e}").exists() for e in ("pcm", "mp3")):
            print(f"{name}: no raw take")
            continue
        x = load_raw(name)
        if s.loop:
            y = shape_loop(x)
            # decorrelated stereo for free: a circular shift keeps the loop seamless
            st = np.stack([y, np.roll(y, int(0.37 * SR))], 1)
            L.encode_m4a(st, SR, OUT / f"{name}.m4a", 96000)
            loud = L.lufs(st, SR)
        else:
            y = shape(x, s)
            L.encode_m4a(y[:, None], SR, OUT / f"{name}.m4a", 64000)
            # a mono buffer plays on both speakers: measure it as dual-mono like the stereo music
            loud = L.momentary_max(np.repeat(y[:, None], 2, 1), SR)
        gain = 10 ** ((TARGET_LUFS + s.db - loud) / 20)
        entry = {"src": f"audio/sfx/{name}.m4a", "gain": round(min(gain, 2.0), 3)}
        if s.vary:
            entry["vary"] = s.vary
        if s.loop:
            entry["loop"] = True
        data[name] = entry
        size = (OUT / f"{name}.m4a").stat().st_size
        print(f"{name:8s} {len(y) / SR:5.2f}s  {size / 1024:5.1f} KB  loud {loud:6.1f}  gain {gain:.2f}")
    MANIFEST.write_text(json.dumps(dict(sorted(data.items())), indent=2) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["gen", "make"])
    ap.add_argument("names", nargs="*")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    names = a.names or list(SFX)
    bad = [n for n in names if n not in SFX]
    if bad:
        sys.exit(f"unknown names: {bad}")
    gen(names, a.force) if a.cmd == "gen" else make(names)


if __name__ == "__main__":
    main()
