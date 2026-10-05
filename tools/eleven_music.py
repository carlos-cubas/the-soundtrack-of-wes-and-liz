#!/usr/bin/env python3
"""Generate the game's music with the ElevenLabs Music API and fit each track for looping.

Usage:
  python3 tools/eleven_music.py gen [ids...] [--force]   compose public/audio/music/<id>.mp3
  python3 tools/eleven_music.py fit [ids...]             loop points + loudness -> src/data/music.json

`gen` skips tracks that already exist unless --force. `fit` never re-encodes: the mp3
stays exactly as ElevenLabs delivered it, and music.json carries the loop region,
seam crossfade and playback gain that core/audio.ts applies at runtime.

All tracks are original instrumentals generated from the prompts below (see docs/AUDIO.md).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import eleven_lib as L  # noqa: E402

OUT = L.ROOT / "public/audio/music"
MANIFEST = L.ROOT / "src/data/music.json"
LEDGER = L.ROOT / "tools/eleven_ledger.json"
MODEL = "music_v2_5"
FORMAT = "mp3_44100_128"
TARGET_LUFS = -18.0

LOOP_HINT = "Steady tempo and groove the whole way through, loop-friendly, no fade-out, no big ending."

# id -> (seconds, prompt). Never name artists or songs: everything here is original.
TRACKS: dict[str, tuple[int, str]] = {
    "title": (90, "Warm, hopeful indie-pop romantic-comedy main theme. Bright jangly clean electric guitar, soft piano chords, "
              "glockenspiel melody, warm bass, light brushed drums and handclaps. A sunny small-town love story about two "
              "next-door neighbors: sweet, a little nostalgic, optimistic. 112 BPM, major key."),
    "map": (90, "Laid-back strolling suburban afternoon. Light fingerpicked acoustic guitar, ukulele strums, a playful whistled "
            "melody, upright bass, soft shaker and finger snaps. Relaxed and friendly, walking around the neighborhood on a "
            "sunny day. 96 BPM, major key."),
    "narration": (75, "Soft storybook underscore. Gentle felt piano melody with light warm strings and a touch of celesta, tender "
                  "and calm, like turning the pages of a picture book about two childhood neighbors. 72 BPM, major key, even "
                  "quiet dynamics."),
    "reward": (40, "Opens with a short bright two-bar celebratory fanfare, then settles into a soft, happy, steady groove that "
               "keeps repeating: sparkling glockenspiel, plucky pizzicato strings, warm bass, light claps. The feel-good moment "
               "of unlocking a new song on a playlist. 120 BPM, major key."),
    "l1": (72, "Playful kid-cartoon bounce with an 8-bit chiptune flavor. Bouncy square-wave lead, bubbly synth bass, toy piano, "
           "xylophone and springy percussion. A cheeky frog hopping up the floors of a pink toy dreamhouse, retro platform "
           "game level music. 140 BPM, major key, energetic."),
    "l2": (72, "Quirky mischievous garden caper. Sneaky pizzicato strings, marimba, bassoon, tiptoeing upright bass, woodblock "
           "and tambourine. Two kids up to no good in the backyard knocking over garden gnomes, cartoon heist energy. "
           "128 BPM, minor key with playful turns."),
    "l3": (56, "Driving, tense indie-rock escape. Urgent overdriven guitars, pounding drums, fast eighth-note bass, ticking "
           "hi-hats. Racing through a crowded high-school house party to get to the car in fifteen seconds. 160 BPM, minor "
           "key, relentless constant energy, no breakdown."),
    "l4": (76, "Upbeat mall pop fashion-runway track. Glossy synth-pop chords, four-on-the-floor kick, funky slap bass, finger "
           "snaps, sparkly arpeggios. Catwalk strut confidence, a shopping-mall dress-up montage. 118 BPM, major key."),
    "l5": (72, "Hype high-school gym sports anthem. Stomping drums in a stomp-stomp-clap rhythm, big handclaps, punchy brass "
           "stabs, chunky bass, marching snare. Pumped-up dodgeball game in a school gym. 126 BPM, major key."),
    "l6": (76, "Retro 1950s diner jukebox instrumental in a doo-wop style. Walking upright bass, twangy clean electric guitar, "
           "piano triplets, warm tenor saxophone melody, brushed shuffle drums, finger snaps. Sweet, cozy milkshake-and-fries "
           "diner. Slow 12/8 shuffle, about 80 BPM, major key."),
    "sq1": (80, "Cozy acoustic date-night music. Warm fingerpicked acoustic guitar, soft Rhodes electric piano, gentle upright "
            "bass, brushed drums, a small tender melody. Sitting in a car at night with someone you like. 84 BPM, major key, "
            "intimate."),
    "sq2": (80, "Tender, bittersweet piano piece about memories and family. Solo felt piano with soft cello and warm strings, "
            "slow and heartfelt, a little sad but hopeful, looking through old photos of a mother who is gone. 68 BPM, "
            "even dynamics."),
    "sq3": (62, "Urgent stormy cinematic percussion. Thundering taiko and toms, driving low string ostinato, tense staccato "
            "violins, rumbling bass, the feel of heavy rain and wind. Racing through a storm to close a car window. 140 BPM, "
            "minor key, constant urgency."),
    "ending": (90, "Sweet, euphoric romantic finale. Soaring indie-pop with shimmering electric guitars, big warm piano chords, "
               "swelling strings, glockenspiel, joyful drums and handclaps. Happily ever after under the stars. 116 BPM, "
               "major key, uplifting."),
}


def ledger() -> dict:
    return json.loads(LEDGER.read_text()) if LEDGER.exists() else {}


def gen(ids: list[str], force: bool) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    book = ledger()
    for tid in ids:
        secs, prompt = TRACKS[tid]
        out = OUT / f"{tid}.mp3"
        if out.exists() and not force:
            print(f"{tid}: exists, skipping")
            continue
        body = {
            "prompt": f"{prompt} Instrumental only, no vocals. {LOOP_HINT}",
            "music_length_ms": secs * 1000,
            "model_id": MODEL,
            "force_instrumental": True,
        }
        t0 = time.time()
        try:
            data, headers = L.post("/v1/music", body, f"output_format={FORMAT}", timeout=900)
        except RuntimeError as e:
            print(f"{tid}: FAILED {e}")
            continue
        out.write_bytes(data)
        # the Music API returns no cost header (SFX does); keep the song id for support requests
        cost = next((v for k, v in headers.items() if "cost" in k.lower()), None)
        book[tid] = {"seconds": secs, "bytes": len(data), "cost": cost, "model": MODEL, "format": FORMAT,
                     "prompt": body["prompt"], "songId": headers.get("song-id"), "at": time.strftime("%Y-%m-%d %H:%M")}
        LEDGER.write_text(json.dumps(book, indent=2))
        print(f"{tid}: {len(data) / 1e6:.2f} MB in {time.time() - t0:.0f}s, cost={cost}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["gen", "fit"])
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    ids = a.ids or list(TRACKS)
    bad = [i for i in ids if i not in TRACKS]
    if bad:
        sys.exit(f"unknown ids: {bad}")
    if a.cmd == "gen":
        gen(ids, a.force)
    else:
        import eleven_loop

        bpms = {t: float(re.search(r"(\d+) BPM", TRACKS[t][1]).group(1)) for t in TRACKS}
        eleven_loop.fit_all(ids, OUT, MANIFEST, TARGET_LUFS, bpms)


if __name__ == "__main__":
    main()
