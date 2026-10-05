#!/usr/bin/env python3
"""Listen-check the recorded voice clips (numpy; decodes with macOS afconvert).

    python3 tools/voices_check.py           summary + every flagged clip
    python3 tools/voices_check.py --all     one row per clip

For every entry in src/data/voices.json: the file exists, speech length is
plausible for the word count (~2.7 words/s), nothing is silent or clipped,
no long dead air, and loudness (ITU-R BS.1770, computed independently of
tools/voices_build.mjs) is consistent. Also reports orphan files and total
size. Exits 1 if anything is flagged.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import wave

import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
VOICE_DIR = os.path.join(ROOT, 'public', 'audio', 'voice')
BUDGET_MB = 25
WORDS_PER_SEC = 2.7


def decode(path):
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'a.wav')
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16', path, wav], check=True)
        with wave.open(wav) as w:
            rate, ch = w.getframerate(), w.getnchannels()
            x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32768
    return rate, x.reshape(-1, ch).mean(axis=1)


def biquad_power(b, a, f, rate):
    z = np.exp(-1j * 2 * np.pi * f / rate)
    return np.abs((b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)) ** 2


def k_weight(f, rate):
    """|H(f)|^2 of the BS.1770 K-weighting filter (shelf + high-pass)."""
    A = 10 ** (3.999843853973347 / 40)
    w = 2 * np.pi * 1681.974450955533 / rate
    al, c = np.sin(w) / (2 * 0.7071752369554196), np.cos(w)
    sa = 2 * np.sqrt(A) * al
    shelf = biquad_power([A * (A + 1 + (A - 1) * c + sa), -2 * A * (A - 1 + (A + 1) * c), A * (A + 1 + (A - 1) * c - sa)],
                         [A + 1 - (A - 1) * c + sa, 2 * (A - 1 - (A + 1) * c), A + 1 - (A - 1) * c - sa], f, rate)
    w = 2 * np.pi * 38.13547087602444 / rate
    al, c = np.sin(w) / (2 * 0.5003270373238773), np.cos(w)
    hp = biquad_power([(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al], f, rate)
    return shelf * hp


def loudness(x, rate):
    """Gated integrated loudness, weighting applied in the frequency domain."""
    blk, hop = int(rate * 0.4), int(rate * 0.1)
    if len(x) < blk:
        x = np.pad(x, (0, blk - len(x)))
    starts = np.arange(0, len(x) - blk + 1, hop)
    frames = np.stack([x[s:s + blk] for s in starts])
    spec = np.abs(np.fft.rfft(frames, axis=1)) ** 2 * k_weight(np.fft.rfftfreq(blk, 1 / rate), rate)
    spec[:, 1:-1] *= 2  # one-sided spectrum: Parseval
    ms = spec.sum(axis=1) / blk / blk
    L = -0.691 + 10 * np.log10(ms + 1e-12)
    gated = ms[L > -70]
    if not len(gated):
        return -70.0
    rel = -0.691 + 10 * np.log10(gated.mean()) - 10
    gated = gated[-0.691 + 10 * np.log10(gated + 1e-12) > rel]
    return float(-0.691 + 10 * np.log10(gated.mean()))


def measure(path):
    rate, x = decode(path)
    fr = rate // 100
    n = len(x) // fr
    db = 10 * np.log10((x[:n * fr].reshape(n, fr) ** 2).mean(axis=1) + 1e-12)
    active = np.flatnonzero(db > -45)
    gaps = np.diff(active) if len(active) > 1 else np.array([0])
    return {
        'duration': len(x) / rate,
        'speech': (active[-1] - active[0] + 1) / 100 if len(active) else 0.0,
        'lead': active[0] / 100 if len(active) else len(x) / rate,
        'longest_pause': (gaps.max() - 1) / 100,
        'peak': 20 * np.log10(np.abs(x).max() + 1e-9),
        'clipped': int((np.abs(x) >= 0.999).sum()),
        'lufs': loudness(x, rate),
    }


def word_count(text):
    """Rough spoken word count; "2021" is read as "twenty twenty-one"."""
    text = re.sub(r'\*[^*]*\*', ' ', text)
    return sum(-(-len(re.sub(r'\D', '', w)) // 2) if re.fullmatch(r'\d+\W*', w) else 1
               for w in text.split() if re.search(r'\w', w))


def main():
    show_all = '--all' in sys.argv
    voices = json.load(open(os.path.join(ROOT, 'src', 'data', 'voices.json')))
    rows, flagged = [], 0
    for key, rel in voices.items():
        who, text = key.split('|', 1)
        path = os.path.join(ROOT, 'public', rel)
        if not os.path.exists(path):
            print(f'MISSING {rel} for {key}')
            flagged += 1
            continue
        m = measure(path)
        n = word_count(text)
        expected = max(0.6, n / WORDS_PER_SEC)
        m.update(who=who, file=os.path.basename(rel), text=text, words=n, ratio=m['speech'] / expected)
        rows.append(m)

    median = float(np.median([r['lufs'] for r in rows])) if rows else 0.0
    for r in rows:
        issues = []
        if r['lufs'] < -45:
            issues.append('silent')
        if r['ratio'] < 0.45 or r['ratio'] > 2.4:
            issues.append(f"length {r['ratio']:.2f}x expected")
        if r['clipped'] > 20 or r['peak'] > -0.1:
            issues.append(f"clipping (peak {r['peak']:.1f} dBFS, {r['clipped']} samples)")
        if r['longest_pause'] > 1.8:
            issues.append(f"{r['longest_pause']:.1f}s pause")
        if r['lead'] > 1.0:
            issues.append(f"{r['lead']:.1f}s before speech")
        if abs(r['lufs'] - median) > 4:
            issues.append(f"loudness {r['lufs']:.1f} LUFS vs median {median:.1f}")
        r['issues'] = issues
        flagged += bool(issues)
        if show_all or issues:
            print(f"{'!!' if issues else 'ok'} {r['file']:24s} {r['speech']:5.1f}s/{r['words']:3d}w ({r['ratio']:.2f}x) "
                  f"{r['lufs']:6.1f} LUFS pk {r['peak']:5.1f}  {'; '.join(issues)}  | {r['text'][:60]}")

    print('\nby speaker            clips  speech s   LUFS min/med/max   words/s')
    for who in sorted({r['who'] for r in rows}):
        rs = [r for r in rows if r['who'] == who]
        lu = sorted(r['lufs'] for r in rs)
        wps = sum(r['words'] for r in rs) / max(1e-9, sum(r['speech'] for r in rs))
        print(f"  {who:20s} {len(rs):5d} {sum(r['speech'] for r in rs):9.1f}   {lu[0]:6.1f} {lu[len(lu) // 2]:6.1f} {lu[-1]:6.1f}   {wps:6.2f}")

    used = {os.path.basename(v) for v in voices.values()}
    files = [f for f in os.listdir(VOICE_DIR) if f.endswith('.mp3')] if os.path.isdir(VOICE_DIR) else []
    orphans = sorted(set(files) - used)
    size = sum(os.path.getsize(os.path.join(VOICE_DIR, f)) for f in files) / 1e6
    lufs = [r['lufs'] for r in rows]
    print(f"\n{len(rows)} clips · {sum(r['duration'] for r in rows):.0f}s audio · {size:.2f} MB (budget {BUDGET_MB} MB) · "
          f"loudness {min(lufs):.1f} … {max(lufs):.1f} LUFS, median {median:.1f}, "
          f"{sum(abs(l - median) <= 1.5 for l in lufs)}/{len(lufs)} within ±1.5 dB · {len(orphans)} orphan files · {flagged} flagged")
    for f in orphans:
        print(f'  orphan: {f}')
    sys.exit(1 if flagged or orphans or size > BUDGET_MB else 0)


if __name__ == '__main__':
    main()
