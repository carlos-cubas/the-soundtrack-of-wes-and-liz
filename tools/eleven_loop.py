"""Find seamless loop regions in generated music and measure them.

fit(x, sr) picks a loop [start, end) where the music just before `end` matches the
music just before `start` (self-similarity of spectral + chroma features, which lands
on bar/phrase repeats), then aligns `end` to the sample by waveform cross-correlation.
The player (core/audio.ts) blends the last `xfade` seconds before `end` with the
`xfade` seconds before `start`, boosted by their correlation `rho` so loudness holds,
so the jump from end back to start is continuous. apply_seam() is the numpy twin of that
runtime blend (same formula and rounding; the browser applies it after resampling to its
own rate, usually 48 kHz). seam_report() measures the result with listen-proxy numbers.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

import eleven_lib as L

HOP = 1024
NFFT = 2048
XFADE = 0.12


def _stft_mag(mono: np.ndarray) -> np.ndarray:
    n = 1 + (len(mono) - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(n)[:, None]
    return np.abs(np.fft.rfft(mono[idx] * np.hanning(NFFT), axis=1)).astype(np.float32)


def features(mono: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(unit-norm frame features, log band energies, onset envelope)."""
    mag = _stft_mag(mono)
    f = np.fft.rfftfreq(NFFT, 1 / sr)
    edges = np.geomspace(40, min(16000, sr / 2 - 1), 41)
    band = np.stack([mag[:, (f >= lo) & (f < hi)].sum(1) for lo, hi in zip(edges[:-1], edges[1:])], 1)
    logb = np.log10(band**2 + 1e-9)
    sel = (f > 60) & (f < 5000)
    pc = np.round(12 * np.log2(f[sel] / 440.0)).astype(int) % 12
    chroma = np.zeros((len(mag), 12), np.float32)
    for k in range(12):
        chroma[:, k] = (mag[:, sel][:, pc == k] ** 2).sum(1)
    chroma = chroma / (chroma.sum(1, keepdims=True) + 1e-9)
    zb = (logb - logb.mean(0)) / (logb.std(0) + 1e-6)
    zc = (chroma - chroma.mean(0)) / (chroma.std(0) + 1e-6)
    feat = np.concatenate([zb, 1.5 * zc], 1)
    feat /= np.linalg.norm(feat, axis=1, keepdims=True) + 1e-9
    onset = np.maximum(np.diff(logb, axis=0, prepend=logb[:1]), 0).sum(1)
    return feat.astype(np.float32), logb, onset


def tempo(onset: np.ndarray, sr: int, hint: float | None = None) -> float:
    """Beat tempo from the onset autocorrelation; `hint` (the prompt's BPM) narrows the search to +-12%."""
    o = onset - onset.mean()
    ac = np.correlate(o, o, "full")[len(o) - 1 :]
    fps = sr / HOP
    lo, hi = (hint * 0.88, hint * 1.12) if hint else (50, 200)
    lags = np.arange(int(fps * 60 / hi), int(fps * 60 / lo) + 2)
    # log-normal prior resolves half/double-tempo ambiguity
    prior = np.exp(-0.5 * (np.log2(60 * fps / lags / (hint or 120)) / 0.6) ** 2)
    k = lags[np.argmax(ac[lags] * prior)]
    if 1 <= k < len(ac) - 1:  # parabolic peak refinement
        a, b, c = ac[k - 1], ac[k], ac[k + 1]
        k = k + 0.5 * (a - c) / (a - 2 * b + c + 1e-12)
    return float(60 * fps / k)


def _lead_in(mono: np.ndarray, sr: int) -> float:
    """Seconds of near-silence (or a faint swell) before the music really starts."""
    win = sr // 20
    n = len(mono) // win
    rms = np.sqrt((mono[: n * win].reshape(n, win) ** 2).mean(1))
    first = int(np.argmax(rms >= 0.1 * np.median(rms)))
    return max(0.0, first * win / sr - 0.05)


def _body_end(mono: np.ndarray, sr: int) -> float:
    """Seconds where the track's body ends (before any decay/fade at the very end)."""
    win = sr // 2
    n = len(mono) // win
    rms = np.sqrt((mono[: n * win].reshape(n, win) ** 2).mean(1))
    loud = np.nonzero(rms >= 0.7 * np.median(rms))[0]
    return float((loud[-1] + 1) * win / sr) if len(loud) else len(mono) / sr


def fit(x: np.ndarray, sr: int, bpm_hint: float | None = None) -> dict:
    mono = x.mean(1)
    dur = len(mono) / sr
    feat, logb, onset = features(mono, sr)
    bpm = tempo(onset, sr, bpm_hint)
    fps = sr / HOP
    nf = len(feat)
    wb, wa = int(3.0 * fps), int(0.5 * fps)
    lead = _lead_in(mono, sr)
    s_lo = int((lead + max(1.0, XFADE + 0.5)) * fps)
    s_hi = int(0.5 * dur * fps)
    e_hi = min(int((_body_end(mono, sr) - 1.5) * fps), nf - wa - 1)
    l_lo = int(max(0.4 * dur, 12.0) * fps)
    sim = feat @ feat.T
    # level (dB) of the second before each frame, to penalise loud/quiet mismatches at the jump
    fdb = 10 * np.log10(np.power(10, logb).sum(1) + 1e-12)
    k1 = int(fps)
    cdb = np.concatenate([[0.0], np.cumsum(fdb)])
    lvl = np.full(nf, fdb.mean())
    lvl[k1:] = (cdb[k1 + 1 :] - cdb[1 : nf - k1 + 1]) / k1
    cands = []  # best start per loop length
    for lag in range(l_lo, e_hi - s_lo + 1):
        d = np.diagonal(sim, lag)
        c = np.concatenate([[0.0], np.cumsum(d)])
        s = np.arange(max(s_lo, wb), min(s_hi, e_hi - lag) + 1)
        if not len(s):
            continue
        score = (c[s + wa] - c[s - wb]) / (wb + wa)
        score = score - 0.03 * np.abs(lvl[s + lag] - lvl[s])
        # tie-break toward longer loops so the repeat is heard less often
        score = score + 0.03 * lag / nf
        i = int(np.argmax(score))
        cands.append((float(score[i]), int(s[i]), int(s[i] + lag)))
    # the strongest few distinct candidates, re-ranked by what the seam actually sounds like
    cands.sort(reverse=True)
    top: list[tuple[float, int, int]] = []
    for c in cands:
        if all(abs(c[1] - t[1]) > fps or abs(c[2] - t[2]) > fps for t in top):
            top.append(c)
        if len(top) == 8:
            break
    med = float(np.median(onset))
    best = None
    for sim_score, sf, ef in top:
        start = sf * HOP
        end, corr = _align(mono, start, ef * HOP, sr)
        xf = XFADE if corr > 0.5 else 0.3
        n = int(xf * sr)
        a, b = mono[start - n : start], mono[end - n : end]
        rho = max(0.0, float((a * b).sum() / (np.sqrt((a**2).sum() * (b**2).sum()) + 1e-9)))
        rep = seam_report(x, sr, start / sr, end / sr, xf, med, rho)
        final = sim_score - 0.05 * max(rep["fluxExcess"], 0) - 0.03 * abs(rep["levelStepDb"]) - 0.2 * max(rep["jumpVsP99"] - 1, 0)
        if best is None or final > best[0]:
            best = (final, sim_score, start, end, corr, xf, rho, rep)
    _, sim_score, start, end, corr, xf, rho, rep = best
    return {
        "start": round(lead, 3),
        # 6 decimals keep the sample-exact alignment (4 would be off by up to 2 samples)
        "loopStart": round(start / sr, 6),
        "loopEnd": round(end / sr, 6),
        "xfade": xf,
        "rho": round(rho, 3),
        "bpm": round(bpm, 1),
        "similarity": round(sim_score, 3),
        "phaseCorr": round(corr, 3),
        "duration": round(dur, 3),
        "seam": rep,
    }


def _align(mono: np.ndarray, start: int, end: int, sr: int) -> tuple[int, float]:
    """Move `end` (within one hop) so the audio before it best matches the audio before `start`."""
    n, r = int(0.25 * sr), HOP
    a = mono[start - n : start]
    b = mono[end - n - r : end + r]
    cc = np.correlate(b, a, "valid")
    e2 = np.concatenate([[0.0], np.cumsum(b**2)])
    norm = np.sqrt((e2[n:] - e2[:-n])[: len(cc)] * (a**2).sum()) + 1e-9
    k = int(np.argmax(cc / norm))
    return end - r + k, float((cc / norm)[k])


def _jsround(v: float) -> int:
    """Math.round (halves go up), not Python's half-to-even."""
    return int(np.floor(v + 0.5))


def apply_seam(x: np.ndarray, sr: int, start: float, end: float, xfade: float, rho: float = 1.0) -> np.ndarray:
    """What AudioEngine.bakeLoopSeam does to the decoded buffer (raised-cosine blend, loudness-held)."""
    y = x.copy()
    s, e = _jsround(start * sr), _jsround(end * sr)
    n = min(_jsround(xfade * sr), s, e - s)
    rho = min(1.0, max(0.0, rho))
    t = (np.arange(n) + 1) / (n + 1)
    w = (0.5 - 0.5 * np.cos(np.pi * t))[:, None]
    k = 1 / np.sqrt(w * w + (1 - w) * (1 - w) + 2 * rho * w * (1 - w))
    y[e - n : e] = (y[e - n : e] * (1 - w) + y[s - n : s] * w) * k
    y[e : e + 3] = y[s : s + 3]
    return y


def seam_report(x: np.ndarray, sr: int, start: float, end: float, xfade: float, onset_median: float | None = None,
                rho: float = 1.0) -> dict:
    """Listen-proxy metrics for the loop jump end -> start.

    The looped audio around the jump is [end-2s, end) (blended) + [start, start+2s); the
    natural reference is the original [start-2s, start+2s). Everything after the jump is
    identical in both, so the numbers isolate what the seam adds:
      jumpVsP99   sample step at the jump / 99th percentile of the track's own sample steps
      naturalVsP99  the same for the original step into `start` (the jump can't beat this)
      fluxExcess  onset strength at the jump minus the original's at `start`, in track medians
      preSim      feature similarity of the last second before the jump vs the original
      levelStepDb RMS change across the jump (0.5 s each side) minus the original's change
      blendDipDb  worst 20 ms level inside the blend vs the power-weighted mix of the two
                  stretches it blends (0 = loudness holds through the blend)
    """
    y = apply_seam(x, sr, start, end, xfade, rho)
    s, e = _jsround(start * sr), _jsround(end * sr)
    pre = post = int(2 * sr)
    seam = np.concatenate([y[e - pre : e], y[s : s + post]])
    ref = x[s - pre : s + post]
    j = pre
    diffs = np.abs(np.diff(x, axis=0)).max(1)
    jump = float(np.abs(seam[j] - seam[j - 1]).max())
    if onset_median is None:
        onset_median = float(np.median(features(x.mean(1), sr)[2]))
    f_s, _, on_s = features(seam.mean(1), sr)
    f_r, _, on_r = features(ref.mean(1), sr)
    fj = j // HOP
    win = slice(max(fj - 2, 0), fj + 3)
    excess = (on_s[win].max() - on_r[win].max()) / (onset_median + 1e-9)
    k = int(sr / HOP)
    pre_sim = float((f_s[fj - k : fj] * f_r[fj - k : fj]).sum(1).mean())
    h = int(0.5 * sr)
    rms = lambda v: float(np.sqrt((v**2).mean()) + 1e-9)
    step = 20 * np.log10(rms(seam[j : j + h]) / rms(seam[j - h : j])) - 20 * np.log10(rms(ref[j : j + h]) / rms(ref[j - h : j]))
    p99 = float(np.percentile(diffs, 99))
    n = min(_jsround(xfade * sr), s, e - s)
    w20 = int(0.02 * sr)
    dips = []
    for i in range(0, n - w20 + 1, w20 // 2):
        wm = 0.5 - 0.5 * np.cos(np.pi * (i + w20 / 2) / n)
        want = np.sqrt((1 - wm) * rms(x[e - n + i : e - n + i + w20]) ** 2 + wm * rms(x[s - n + i : s - n + i + w20]) ** 2)
        dips.append(20 * np.log10(rms(y[e - n + i : e - n + i + w20]) / want))
    return {
        "jumpVsP99": round(jump / p99, 2),
        # the step the track itself takes into `start`; a jump no bigger than this is not a click
        "naturalVsP99": round(float(np.abs(x[s] - x[s - 1]).max()) / p99, 2),
        "fluxExcess": round(float(excess), 2),
        "preSim": round(pre_sim, 3),
        "levelStepDb": round(float(step), 2),
        "blendDipDb": round(float(min(dips)) if dips else 0.0, 2),
    }


def fit_all(ids: list[str], out_dir: Path, manifest: Path, target_lufs: float, bpms: dict[str, float]) -> None:
    data = json.loads(manifest.read_text()) if manifest.exists() else {}
    for tid in ids:
        path = out_dir / f"{tid}.mp3"
        if not path.exists():
            print(f"{tid}: missing {path.name}")
            continue
        x, sr = L.decode(path)
        loop = fit(x, sr, bpms.get(tid))
        # what repeats is the loop, so that is what gets level-matched
        loud = L.lufs(x[_jsround(loop["loopStart"] * sr) : _jsround(loop["loopEnd"] * sr)], sr)
        gain = 10 ** ((target_lufs - loud) / 20)
        peak = float(np.abs(x).max())
        rep = loop["seam"]
        data[tid] = {
            "src": f"audio/music/{tid}.mp3",
            **({"start": loop["start"]} if loop["start"] > 0 else {}),
            "loopStart": loop["loopStart"],
            "loopEnd": loop["loopEnd"],
            "xfade": loop["xfade"],
            "rho": loop["rho"],
            "gain": round(gain, 3),
        }
        beats = (loop["loopEnd"] - loop["loopStart"]) * loop["bpm"] / 60
        print(
            f"{tid:9s} dur {loop['duration']:6.1f}s  start {loop['start']:4.2f}  loop {loop['loopStart']:6.2f}-{loop['loopEnd']:6.2f}"
            f" ({beats:5.1f} beats @ {loop['bpm']:.0f})  sim {loop['similarity']:.3f} corr {loop['phaseCorr']:.2f}"
            f"  {loud:6.1f} LUFS peak {L.db(peak):5.1f} dBFS gain {gain:.2f}  seam {rep}"
        )
    order = {k: i for i, k in enumerate(bpms)}
    data = dict(sorted(data.items(), key=lambda kv: order.get(kv[0], len(order))))
    manifest.write_text(json.dumps(data, indent=2) + "\n")
