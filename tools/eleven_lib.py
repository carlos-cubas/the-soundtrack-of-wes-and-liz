"""Shared helpers for the ElevenLabs audio tools (tools/eleven_music.py, tools/eleven_sfx.py).

- api_key()/post(): call the ElevenLabs REST API. The key is read from
  ELEVENLABS_API_KEY or `elevenlabs_api_key=` in .env at the repo root.
- decode()/write_wav()/encode_m4a(): audio I/O through macOS `afconvert`
  (no ffmpeg needed). encode_m4a() records the AAC encoder delay, which Chromium and
  WebKit honour (checked sample-exact). The ElevenLabs mp3s carry no gapless header, so
  decoders may differ by a constant few ms there; loop lengths are unaffected.
- lufs()/momentary_max(): ITU-R BS.1770 loudness in numpy.
"""
from __future__ import annotations

import json
import os
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.elevenlabs.io"


def api_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if key:
        return key.strip()
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.lower().startswith("elevenlabs_api_key="):
                return line.split("=", 1)[1].strip()
    sys.exit("ElevenLabs key not set (ELEVENLABS_API_KEY or elevenlabs_api_key= in .env)")


def _ssl() -> ssl.SSLContext:
    # Python 3.13 rejects some corporate proxy CAs (missing Authority Key Identifier);
    # keep verification on, drop only the strict-X509 flag.
    ctx = ssl.create_default_context()
    ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return ctx


def post(path: str, body: dict, query: str = "", timeout: int = 600, retries: int = 2) -> tuple[bytes, dict]:
    """POST JSON, return (audio bytes, response headers). Raises RuntimeError on API errors."""
    url = f"{API}{path}" + (f"?{query}" if query else "")
    data = json.dumps(body).encode()
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, data=data, headers={"xi-api-key": api_key(), "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=_ssl()) as r:
                return r.read(), dict(r.headers)
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:600]
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(5 * (attempt + 1))
                continue
            raise RuntimeError(f"HTTP {e.code}: {msg}") from None
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < retries:
                time.sleep(5 * (attempt + 1))
                continue
            raise RuntimeError(f"network error: {e}") from None
    raise RuntimeError("unreachable")


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path)) as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        x = np.frombuffer(w.readframes(n), "<i2").astype(np.float32) / 32768.0
    return x.reshape(-1, ch), sr


def write_wav(path: Path, x: np.ndarray, sr: int) -> None:
    x = x if x.ndim == 2 else x[:, None]
    pcm = (np.clip(x, -1, 1) * 32767).round().astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def decode(path: Path) -> tuple[np.ndarray, int]:
    """Decode any CoreAudio-readable file to float32 [frames, channels]."""
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "d.wav"
        subprocess.run(["afconvert", str(path), "-f", "WAVE", "-d", "LEI16", str(out)], check=True, capture_output=True)
        return read_wav(out)


def encode_m4a(x: np.ndarray, sr: int, out: Path, bitrate: int) -> None:
    """AAC-LC in an .m4a (afconvert records the encoder delay, so browsers decode sample-exact)."""
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "e.wav"
        write_wav(src, x, sr)
        out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["afconvert", str(src), "-f", "m4af", "-d", "aac", "-b", str(bitrate), "-s", "0", str(out)],
            check=True,
            capture_output=True,
        )


def _biquad_mag2(b, a, w):
    z = np.exp(-1j * w)
    h = (b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)
    return np.abs(h) ** 2


def _k_weight(n: int, sr: int) -> np.ndarray:
    """|H(f)|^2 of the BS.1770 K-weighting (shelf + RLB high-pass) at rfft bins."""
    w = 2 * np.pi * np.fft.rfftfreq(n, 1 / sr) / sr
    # stage 1: high shelf, +4 dB above ~1.5 kHz
    A, w0, q = 10 ** (4.0 / 40), 2 * np.pi * 1500 / sr, 1 / np.sqrt(2)
    al, c = np.sin(w0) / (2 * q), np.cos(w0)
    b1 = [A * ((A + 1) + (A - 1) * c + 2 * np.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - 2 * np.sqrt(A) * al)]
    a1 = [(A + 1) - (A - 1) * c + 2 * np.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - 2 * np.sqrt(A) * al]
    # stage 2: high-pass at 38 Hz
    w0, q = 2 * np.pi * 38 / sr, 0.5
    al, c = np.sin(w0) / (2 * q), np.cos(w0)
    b2 = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    a2 = [1 + al, -2 * c, 1 - al]
    return _biquad_mag2(b1, a1, w) * _biquad_mag2(b2, a2, w)


def _block_power(x: np.ndarray, sr: int, block: float = 0.4) -> np.ndarray:
    x = x if x.ndim == 2 else x[:, None]
    n = len(x)
    g = _k_weight(n, sr)
    y = np.stack([np.fft.irfft(np.fft.rfft(x[:, c]) * np.sqrt(g), n) for c in range(x.shape[1])], 1)
    size, hop = int(block * sr), int(block * sr / 4)
    if n < size:
        y = np.pad(y, ((0, size - n), (0, 0)))
        n = size
    p = np.cumsum(np.concatenate([np.zeros((1, y.shape[1])), y**2]), 0)
    starts = np.arange(0, n - size + 1, hop)
    return ((p[starts + size] - p[starts]) / size).sum(1)


def lufs(x: np.ndarray, sr: int) -> float:
    """Integrated loudness (gated), LUFS."""
    z = _block_power(x, sr)
    l = -0.691 + 10 * np.log10(np.maximum(z, 1e-12))
    z = z[l > -70]
    if not len(z):
        return -70.0
    rel = -0.691 + 10 * np.log10(z.mean()) - 10
    z = z[-0.691 + 10 * np.log10(z) > rel]
    return float(-0.691 + 10 * np.log10(z.mean()))


def momentary_max(x: np.ndarray, sr: int) -> float:
    """Loudest 400 ms window, LUFS (the right yardstick for one-shot SFX)."""
    z = _block_power(x, sr)
    return float(-0.691 + 10 * np.log10(max(z.max(), 1e-12)))


def db(v: float) -> float:
    return float(20 * np.log10(max(v, 1e-9)))
