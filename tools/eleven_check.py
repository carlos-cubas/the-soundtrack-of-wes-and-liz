#!/usr/bin/env python3
"""Listen-proxy report for the shipped music and SFX (no ears required).

Usage: python3 tools/eleven_check.py

Music: size, bitrate, loudness of the loop region as encoded and after the music.json
gain, and the loop seam metrics from eleven_loop.seam_report. SFX: length, size, peak and
loudest-400 ms loudness (dual-mono, as played) before and after the sfx.json gain; for
looping beds the step across the wrap.

Exits non-zero when a seam adds something audible: a jump bigger than the music's own step
into loopStart, an extra onset (fluxExcess > 1), a level step over 2 dB, or a dip in the
blend deeper than 3 dB. The loudness spread check only catches a stale music.json (a track
regenerated without `eleven_music.py fit`), since the gains come from the same measurement.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import eleven_lib as L  # noqa: E402
import eleven_loop  # noqa: E402

PUB = L.ROOT / "public"


def main() -> int:
    music = json.loads((L.ROOT / "src/data/music.json").read_text())
    sfx = json.loads((L.ROOT / "src/data/sfx.json").read_text())
    problems = []
    total = 0
    print("MUSIC  id         len    KB  kbps  loopLUFS peak  gain -> LUFS   loop          seam: jump/p99 (natural) fluxEx preSim stepdB dipdB")
    played = []
    for tid, m in music.items():
        path = PUB / m["src"]
        x, sr = L.decode(path)
        size = path.stat().st_size
        total += size
        dur = len(x) / sr
        s0, e0 = eleven_loop._jsround(m["loopStart"] * sr), eleven_loop._jsround(m["loopEnd"] * sr)
        loud = L.lufs(x[s0:e0], sr)
        out = loud + 20 * np.log10(m["gain"])
        played.append(out)
        rep = eleven_loop.seam_report(x, sr, m["loopStart"], m["loopEnd"], m["xfade"], rho=m.get("rho", 1.0))
        if rep["jumpVsP99"] > rep["naturalVsP99"] + 0.1:
            problems.append(f"{tid}: seam jump {rep['jumpVsP99']} > the music's own {rep['naturalVsP99']}")
        if rep["fluxExcess"] > 1.0:
            problems.append(f"{tid}: seam adds an onset ({rep['fluxExcess']} medians)")
        if abs(rep["levelStepDb"]) > 2.0:
            problems.append(f"{tid}: seam level step {rep['levelStepDb']} dB")
        if rep["blendDipDb"] < -3.0:
            problems.append(f"{tid}: blend dips {rep['blendDipDb']} dB")
        print(
            f"       {tid:9s} {dur:5.1f}s {size / 1024:5.0f} {size * 8 / dur / 1000:5.0f} {loud:6.1f} {L.db(np.abs(x).max()):5.1f}"
            f"  {m['gain']:.2f} -> {out:5.1f}   {m['loopStart']:5.1f}-{m['loopEnd']:5.1f}   "
            f"{rep['jumpVsP99']:5.2f} ({rep['naturalVsP99']:4.2f}) {rep['fluxExcess']:6.2f} {rep['preSim']:6.3f} {rep['levelStepDb']:6.2f}"
            f" {rep['blendDipDb']:6.2f}"
        )
    spread = max(played) - min(played)
    print(f"       played loudness spread {spread:.2f} LU (target {min(played):.1f}..{max(played):.1f})")
    if spread > 1.0:
        problems.append(f"music loudness spread {spread:.2f} LU")

    print("\nSFX    name       len    KB  peak  mom.LUFS gain -> LUFS  extra")
    for name, s in sfx.items():
        path = PUB / s["src"]
        x, sr = L.decode(path)
        size = path.stat().st_size
        total += size
        played_x = x if x.shape[1] == 2 else np.repeat(x, 2, 1)  # mono plays on both speakers
        mom = L.lufs(played_x, sr) if s.get("loop") else L.momentary_max(played_x, sr)
        extra = ""
        if s.get("loop"):
            # the wrap from the last sample back to the first
            jump = float(np.abs(x[0] - x[-1]).max())
            p99 = float(np.percentile(np.abs(np.diff(x, axis=0)).max(1), 99))
            extra = f"wrap jump/p99 {jump / p99:.2f}"
            if jump / p99 >= 1.5:
                problems.append(f"{name}: loop wrap click {jump / p99:.2f}")
        print(
            f"       {name:9s} {len(x) / sr:5.2f}s {size / 1024:5.1f} {L.db(np.abs(x).max()):5.1f}  {mom:6.1f}"
            f"   {s['gain']:.2f} -> {mom + 20 * np.log10(s['gain']):5.1f}  {extra}"
        )
    print(f"\ntotal public/audio (music + sfx): {total / 1e6:.2f} MB")
    for p in problems:
        print("PROBLEM", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
