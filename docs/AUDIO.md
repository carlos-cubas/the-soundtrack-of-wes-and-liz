# Audio: music and sound effects

All music and most sound effects are original recordings generated with ElevenLabs
(Music API `music_v2_5`, Sound Effects API `eleven_text_to_sound_v3`) from the
prompts below. Those are the newest music and sound-effects models available on this plan;
see [Models](#models). The model is recorded for every file in the tables below. Nothing imitates a specific song or artist. The only real songs in the game are
the 30-second Apple previews on the soundtrack screen, which stream at runtime and are not
shipped. Voices (`data/voices.json`) are documented separately.

The WebAudio synth stays as the fallback, so the game is never silent: chiptune tracks in
`src/audio/tracks.ts` for every music id, and synth versions of every `SfxName` in
`core/audio.ts`.

## Files

```
public/audio/music/<id>.mp3   14 tracks, 44.1 kHz stereo 128 kbps mp3 as delivered (16.5 MB)
public/audio/sfx/<name>.m4a   26 effects, mono AAC 64 kbps; rain is a stereo 96 kbps loop (0.4 MB)
src/data/music.json           id -> { src, start?, loopStart, loopEnd, xfade, rho, gain }
src/data/sfx.json             name -> { src, gain, vary?, loop? }
tools/eleven_lib.py           API calls, afconvert I/O, BS.1770 loudness
tools/eleven_music.py         gen: compose tracks; fit: loop points + gain -> music.json
tools/eleven_loop.py          loop search, seam blend (numpy twin of the runtime), seam metrics
tools/eleven_sfx.py           gen: raw PCM takes; make: trim/normalise/encode -> sfx.json
tools/eleven_check.py         listen-proxy report over everything that ships
tools/eleven_ledger.json      what was generated: prompt, length, model, cost header
```

Total shipped audio from these tools: **16.9 MB**.

The music stays exactly as ElevenLabs encoded it (there is no mp3 encoder on the build
machine, and re-encoding would add a second generation of loss). Everything the player needs
to loop and level-match a track is metadata in `music.json`.

## How playback works (`src/core/audio.ts`)

- `playMusic(id)` looks the id up in `music.json`. It fetches and decodes the file into an
  AudioBuffer and keeps the 2 most recent decoded tracks (about 35 MB each). The old track
  keeps playing while the new one loads (about 200 ms in desktop Chromium), then the two
  crossfade over 0.4 s.
  Playback goes through a per-track gain node into the existing `musicGain` bus, so voice
  ducking and the music setting work unchanged. If there is no file or it fails to load, it
  falls back to the synth track in `TRACKS`.
- Music files are fetched in parallel, but decoded one at a time. A burst of 35 MB decodes on
  an iPhone (title, map, narration and level at once, when the player rushes) is the case this
  protects.
  - **Order:** the track the player is about to hear goes to the front, and preloads queue
    behind it.
  - **Dropped decodes:** a decode is dropped before it starts if the player asked for the track
    and has since moved on, or if it was only a preload the cache has let go of.
  - **No duplicates:** a load still in flight is reused even after the two-entry cache has
    dropped it, so a track is never decoded twice at once.
  - **Retry:** after an error, the wanted track gets one retry before the synth fallback. A
    request that hasn't delivered its whole file in 15 s is aborted and counts as an error,
    so a stalled network can't leave the music "loading" forever.
  - **Timeout:** a decode that hasn't finished in 12 s goes straight to the synth, because a
    stalled decode would only stall again. The queue then waits up to 2 s for it to settle
    before starting the next one.
  - **SFX:** they are small, about 400 KB in all, so they load in parallel outside the queue.
- In the native app, Capacitor's iOS scheme handler answers `.mp3`/`.m4a` with a bare
  `URLResponse`. fetch then reports status 0 even though the whole file is in the body, so
  status 0 with bytes counts as success. Before this fix, every recorded track and effect fell
  back to synth in the app.
- Recovery on iOS:
  - **Context:** a `suspended` or `interrupted` AudioContext is resumed on the next tap, and
    when the page becomes visible again. It is not resumed the moment its state changes:
    under a `playback` session that would take the audio back from an app the player just
    started.
  - **Watchdog:** when the music isn't playing or loading, it restarts the track the game
    wants. That covers a looping source that ended on its own or a context that came back. It
    runs when the context returns to `running`, on every tap and every 1.5 s, and allows at
    most one restart per 1.5 s.
- A file plays from `start` (skips lead-in silence), runs into the loop, and repeats
  `[loopStart, loopEnd)` gaplessly with `AudioBufferSourceNode.loop`. The intro before
  `loopStart` plays once. On decode, the last `xfade` seconds before `loopEnd` are blended
  (raised cosine) with the `xfade` seconds before `loopStart`, so the waveform carries straight
  on across the jump. The blend is boosted by `1/sqrt(w² + (1-w)² + 2ρw(1-w))`, where ρ is the
  measured correlation of the two stretches, so the blend holds its loudness instead of
  dipping. Loop points are snapped to whole frames of the decoded buffer, because iOS decodes
  at 48 kHz while the files are 44.1 kHz. If the points don't fit the buffer (a truncated file
  or a stale `music.json`), the track loops whole and no blend is applied.
- Before the first user gesture, `playMusic` only records the id. `unlock()` creates the
  context, starts decoding the SFX, and starts the queued track (iOS needs a gesture before
  audio can play).
- `stopMusic()` fades out over 0.25 s and sets `audio.music.id` to null. Calling `playMusic`
  with the id that is already playing does nothing unless you pass `{ restart: true }`. Going
  back to the track that is still audible while another one loads just cancels the load.
- Fades start from the level the code scheduled, never from `AudioParam.value`, which lags
  scheduled events. Without this, a stop that landed in the first 30 ms of a start would burst
  in at full gain.
- After a song preview ends, the track comes back at its loop instead of replaying the intro.
- `audio.music.source` is `'file' | 'synth' | null`. `preloadMusic(id)` warms the cache.
  `music.stepListeners` fire only while a synth track plays, because files have no step clock.
- `sfx(name)` plays the decoded file through the `sfxGain` bus, using the file's `gain` and a
  random ±`vary` playback-rate spread, and falls back to the synth if the file isn't loaded. The
  same effect fired twice within 30 ms plays once. `tap`, `click`, `back`, `tick`, `error`,
  `perfect` and `miss` stay synth on purpose: they are crisp UI and rhythm cues.
- `setRain(on, level)` loops the recorded rain bed (or filtered noise if it isn't loaded),
  fading in over 0.6 s and out over 0.5 s. It goes through the SFX bus, so turning SFX off
  mutes it. `level` is relative to the old default of 0.12.
- New `SfxName`s: `whoa`, `cheer`, `splat`, `ribbit`, `camera` (each has a synth fallback).
- Test hook `window.__audioDebug`: `state()` (context, current id, file or synth, cached
  tracks, decoded SFX, rain), `log` (recent music/sfx events with `via: 'file' | 'synth'`),
  `level()` (master RMS), and `audio` (the engine).

## Models

The scoped key can't call `GET /v1/models` (it lacks `models_read`). So the newest ids were
established three ways:
1. **The docs.** They list `music_v1`, `music_v2` and `music_v2_5` for music, and only
   `eleven_text_to_sound_v2` for sound effects.
2. **The API's validation errors.** An unknown `model_id` gets a 422 that names the allowed
   values. With an invalid length the request fails validation either way, so nothing is
   generated.
   - **Sound effects:** the 422 says `'eleven_text_to_sound_v2' or 'eleven_text_to_sound_v3'`.
   - **Music:** `music_v2_5` passes, while `music_v3`, `music_v3_5`, `music_v4` and
     `eleven_music_v4` are rejected as invalid model ids.
3. **A paid test generation.** Generating with `eleven_text_to_sound_v3` works on this plan,
   including `loop: true`, at the same price as v2.

So `music_v2_5` (all 14 tracks) and `eleven_text_to_sound_v3` (all 26 effects) are the newest
models available. ElevenLabs' "v4" models (`eleven_v4`, `eleven_v4_turbo`) are text-to-speech
only, so they apply to the voices, not to music or effects. The first SFX pass was made with
`eleven_text_to_sound_v2`, and every effect was then regenerated with v3 using the same prompts
and processing. The two passes were compared on onsets, length and spectrum; no v3 take came
out silent or broken, so all 26 v3 takes shipped.

## Levels

Music is normalised so the loop region, which is what repeats, sits at **-18 LUFS**
integrated at the track's gain. It then goes through `musicGain` (0.55). SFX are normalised so
their loudest 400 ms sits at **-16 LUFS**, plus a per-effect offset (thunder +3 dB, page -5 dB,
and so on), before `sfxGain` (0.8). SFX are measured as dual-mono, because a mono buffer plays
on both speakers. That leaves effects about 5 dB above the music. The rain bed sits at
-25 LUFS before the SFX bus at the default level.

## Music

Every prompt gets `Instrumental only, no vocals. Steady tempo and groove the whole way through,
loop-friendly, no fade-out, no big ending.` appended, and is sent with `force_instrumental`.

| id | prompt |
|---|---|
| `title` | Warm, hopeful indie-pop romantic-comedy main theme. Bright jangly clean electric guitar, soft piano chords, glockenspiel melody, warm bass, light brushed drums and handclaps. A sunny small-town love story about two next-door neighbors: sweet, a little nostalgic, optimistic. 112 BPM, major key. |
| `map` | Laid-back strolling suburban afternoon. Light fingerpicked acoustic guitar, ukulele strums, a playful whistled melody, upright bass, soft shaker and finger snaps. Relaxed and friendly, walking around the neighborhood on a sunny day. 96 BPM, major key. |
| `narration` | Soft storybook underscore. Gentle felt piano melody with light warm strings and a touch of celesta, tender and calm, like turning the pages of a picture book about two childhood neighbors. 72 BPM, major key, even quiet dynamics. |
| `reward` | Opens with a short bright two-bar celebratory fanfare, then settles into a soft, happy, steady groove that keeps repeating: sparkling glockenspiel, plucky pizzicato strings, warm bass, light claps. The feel-good moment of unlocking a new song on a playlist. 120 BPM, major key. |
| `l1` | Playful kid-cartoon bounce with an 8-bit chiptune flavor. Bouncy square-wave lead, bubbly synth bass, toy piano, xylophone and springy percussion. A cheeky frog hopping up the floors of a pink toy dreamhouse, retro platform game level music. 140 BPM, major key, energetic. |
| `l2` | Quirky mischievous garden caper. Sneaky pizzicato strings, marimba, bassoon, tiptoeing upright bass, woodblock and tambourine. Two kids up to no good in the backyard knocking over garden gnomes, cartoon heist energy. 128 BPM, minor key with playful turns. |
| `l3` | Driving, tense indie-rock escape. Urgent overdriven guitars, pounding drums, fast eighth-note bass, ticking hi-hats. Racing through a crowded high-school house party to get to the car in fifteen seconds. 160 BPM, minor key, relentless constant energy, no breakdown. |
| `l4` | Upbeat mall pop fashion-runway track. Glossy synth-pop chords, four-on-the-floor kick, funky slap bass, finger snaps, sparkly arpeggios. Catwalk strut confidence, a shopping-mall dress-up montage. 118 BPM, major key. |
| `l5` | Hype high-school gym sports anthem. Stomping drums in a stomp-stomp-clap rhythm, big handclaps, punchy brass stabs, chunky bass, marching snare. Pumped-up dodgeball game in a school gym. 126 BPM, major key. |
| `l6` | Retro 1950s diner jukebox instrumental in a doo-wop style. Walking upright bass, twangy clean electric guitar, piano triplets, warm tenor saxophone melody, brushed shuffle drums, finger snaps. Sweet, cozy milkshake-and-fries diner. Slow 12/8 shuffle, about 80 BPM, major key. |
| `sq1` | Cozy acoustic date-night music. Warm fingerpicked acoustic guitar, soft Rhodes electric piano, gentle upright bass, brushed drums, a small tender melody. Sitting in a car at night with someone you like. 84 BPM, major key, intimate. |
| `sq2` | Tender, bittersweet piano piece about memories and family. Solo felt piano with soft cello and warm strings, slow and heartfelt, a little sad but hopeful, looking through old photos of a mother who is gone. 68 BPM, even dynamics. |
| `sq3` | Urgent stormy cinematic percussion. Thundering taiko and toms, driving low string ostinato, tense staccato violins, rumbling bass, the feel of heavy rain and wind. Racing through a storm to close a car window. 140 BPM, minor key, constant urgency. |
| `ending` | Sweet, euphoric romantic finale. Soaring indie-pop with shimmering electric guitars, big warm piano chords, swelling strings, glockenspiel, joyful drums and handclaps. Happily ever after under the stars. 116 BPM, major key, uplifting. |

There is no `boss` track, because the boss level builds its own beat.

### Loops and listen-proxy numbers

`fit` searches for the loop. It builds a self-similarity matrix of per-frame features
(40 log bands plus chroma, 23 ms hop), scores each candidate on how well the 3 s before
`loopEnd` match the 3 s before `loopStart`, and penalises any loudness mismatch. It keeps the
best 8 candidates, aligns `loopEnd` to the sample by waveform cross-correlation, and re-ranks
them on the seam metrics. Every loop it found is a whole number of bars at the prompt's tempo
(title 24 bars, l1 24, l4 20, l5 16, reward 12, and so on).

The seam metrics compare the looped audio, `[loopEnd-2s, loopEnd)` (blended) followed by
`[loopStart, loopStart+2s)`, against the original `[loopStart-2s, loopStart+2s)`:

- **jump/p99**: the sample step at the jump divided by the track's own 99th-percentile sample
  step. At every seam it equals the step the original music takes into `loopStart`
  (`naturalVsP99` in `eleven_check.py`), so the blend leaves no discontinuity of its own.
- **flux excess**: onset strength at the jump minus the original's onset strength at
  `loopStart`, in track medians. Around 0 means the jump adds no transient.
- **pre-sim**: feature similarity of the last second before the jump against the original.
  1 means identical.
- **level step**: the RMS change across the jump minus the original's change.
- **blend dip**: the worst 20 ms level inside the blend, against the power-weighted mix of the
  two stretches it blends. The ρ boost halves it: without the boost, `l5` dips -4.5 dB (worst)
  / -1.5 dB (mean). With it, `l5` dips -2.4 / -0.4 dB, and every track's mean is within 0.5 dB.

| id | model | length | size | intro → loop (s) | loop loudness / file peak | gain | jump/p99 (natural) | flux excess | pre-sim | level step | blend dip |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `title` | `music_v2_5` | 90 s | 1.44 MB | 0.00 → 33.04–84.47 (xfade 0.3, ρ 0.62) | -13.7 LUFS / -1.4 dBFS | 0.61 | 0.11 (0.11) | 0.00 | 0.83 | +0.07 dB | -1.29 dB |
| `map` | `music_v2_5` | 90 s | 1.44 MB | 0.00 → 26.66–81.65 (xfade 0.12, ρ 0.65) | -12.2 LUFS / -0.7 dBFS | 0.51 | 0.07 (0.07) | 0.00 | 0.76 | -0.16 dB | -1.45 dB |
| `narration` | `music_v2_5` | 75 s | 1.20 MB | 0.00 → 32.18–67.18 (xfade 0.12, ρ 0.66) | -13.5 LUFS / -1.3 dBFS | 0.59 | 0.65 (0.65) | 0.00 | 0.76 | +0.40 dB | -0.51 dB |
| `reward` | `music_v2_5` | 40 s | 0.64 MB | 1.95 → 9.03–33.03 (xfade 0.3, ρ 0.36) | -12.7 LUFS / -0.5 dBFS | 0.55 | 0.17 (0.17) | 0.05 | 0.84 | -0.03 dB | -0.57 dB |
| `l1` | `music_v2_5` | 72 s | 1.15 MB | 0.00 → 13.17–54.31 (xfade 0.12, ρ 0.39) | -12.4 LUFS / 0.0 dBFS | 0.52 | 0.40 (0.40) | 0.00 | 0.92 | +0.21 dB | -0.62 dB |
| `l2` | `music_v2_5` | 72 s | 1.15 MB | 0.00 → 29.19–59.19 (xfade 0.12, ρ 0.53) | -13.6 LUFS / -1.2 dBFS | 0.60 | 0.35 (0.35) | 0.10 | 0.83 | -0.18 dB | -0.23 dB |
| `l3` | `music_v2_5` | 56 s | 0.90 MB | 0.00 → 26.80–50.79 (xfade 0.3, ρ 0.38) | -11.6 LUFS / -0.4 dBFS | 0.48 | 0.17 (0.17) | -0.00 | 0.62 | -0.39 dB | -0.99 dB |
| `l4` | `music_v2_5` | 76 s | 1.22 MB | 1.95 → 32.25–72.92 (xfade 0.3, ρ 0.34) | -12.4 LUFS / -0.6 dBFS | 0.52 | 0.02 (0.02) | 0.00 | 0.83 | -0.01 dB | -2.22 dB |
| `l5` | `music_v2_5` | 72 s | 1.15 MB | 0.00 → 26.33–56.81 (xfade 0.3, ρ 0.19) | -13.1 LUFS / -0.0 dBFS | 0.57 | 0.11 (0.11) | 0.00 | 0.58 | -0.42 dB | -2.44 dB |
| `l6` | `music_v2_5` | 76 s | 1.22 MB | 0.20 → 7.01–55.03 (xfade 0.12, ρ 0.70) | -11.7 LUFS / -0.7 dBFS | 0.48 | 0.11 (0.11) | 0.01 | 0.67 | +0.03 dB | -0.15 dB |
| `sq1` | `music_v2_5` | 80 s | 1.28 MB | 0.30 → 22.62–56.92 (xfade 0.12, ρ 0.68) | -14.7 LUFS / -1.4 dBFS | 0.69 | 0.43 (0.43) | -0.00 | 0.79 | -1.01 dB | -0.20 dB |
| `sq2` | `music_v2_5` | 80 s | 1.28 MB | 0.00 → 38.96–74.27 (xfade 0.12, ρ 0.73) | -13.7 LUFS / -0.7 dBFS | 0.61 | 0.31 (0.31) | 0.29 | 0.57 | -1.81 dB | -0.28 dB |
| `sq3` | `music_v2_5` | 62 s | 0.99 MB | 0.00 → 31.00–58.44 (xfade 0.3, ρ 0.23) | -13.2 LUFS / -0.5 dBFS | 0.57 | 0.16 (0.16) | 0.01 | 0.40 | -0.11 dB | -1.59 dB |
| `ending` | `music_v2_5` | 90 s | 1.44 MB | 0.00 → 16.04–65.69 (xfade 0.3, ρ 0.45) | -12.7 LUFS / -0.3 dBFS | 0.54 | 0.59 (0.59) | 0.03 | 0.68 | -0.31 dB | -0.77 dB |

After gain, every loop plays at -18.0 LUFS. Three
tracks were regenerated once and compared on these numbers. `reward` take 1 (32 s) had no
clean loop: it peaked at 0.44 similarity with a +5.4 dB level step, so take 2 with a
fanfare-then-groove prompt replaced it. For `l5` and `sq3`, a second take with a
repeat-oriented prompt scored worse, so the first takes stayed. Those two through-composed
cinematic tracks have the lowest pre-sim (0.41 to 0.58). Their seams still land on 16-bar
boundaries with no click, no extra onset and less than 0.5 dB of level step.

## Sound effects

ElevenLabs returns stereo 44.1 kHz PCM. `make` then does the following to each take:
1. Downmix to mono.
2. Start 5 ms before the first 5 ms frame within 20 dB of the loudest, so quiet pre-noise doesn't become input latency.
3. Cap the length.
4. Fade the tail with a raised cosine.
5. Peak-normalise to -1 dBFS.
6. Encode as AAC with `afconvert`, which records the encoder delay. Chromium decodes it sample-exact: an onset test lands on the same sample as the WAV.

The rain bed is generated with `loop: true`. Its tail is blended into its head, and the second
channel is a circular shift of the first, which makes a wide stereo bed and keeps it seamless.
The wrap step is 1.05 × p99 at 44.1 kHz. In steady noise that is inaudible, since 1% of its
samples step further.

| name | model | prompt | kept | size | loudest 400 ms | gain | vary |
|---|---|---|---|---|---|---|---|
| `jump` | `eleven_text_to_sound_v3` | cartoon spring boing for a small frog jumping, one short bouncy boing (0.6 s requested) | 0.32 s | 7.0 KB | -11.2 LUFS | 0.57 | 0.06 |
| `land` | `eleven_text_to_sound_v3` | soft little cartoon landing thump on a wooden floor, one short thud (0.5 s requested) | 0.35 s | 7.2 KB | -17.6 LUFS | 0.84 | 0.08 |
| `hit` | `eleven_text_to_sound_v3` | cartoon bonk impact with a comic squeaky toy honk, getting hit, one short hit (0.6 s requested) | 0.43 s | 7.8 KB | -19.2 LUFS | 1.44 | 0.04 |
| `bonk` | `eleven_text_to_sound_v3` | rubber basketball bouncing hard off someone's head, cartoon bonk, one hit (0.6 s requested) | 0.60 s | 9.0 KB | -15.9 LUFS | 0.99 | 0.05 |
| `collect` | `eleven_text_to_sound_v3` | bright magical sparkle pickup chime, short video game collect sound (0.6 s requested) | 0.23 s | 6.2 KB | -17.5 LUFS | 0.83 | 0.03 |
| `grab` | `eleven_text_to_sound_v3` | quick fabric rustle of grabbing a shirt off a clothes hanger, short (0.5 s requested) | 0.33 s | 7.0 KB | -18.2 LUFS | 0.98 | 0.06 |
| `pop` | `eleven_text_to_sound_v3` | cartoon pop of a garden gnome's head popping off, like a cork, one short pop (0.5 s requested) | 0.13 s | 5.4 KB | -20.2 LUFS | 1.61 | 0.07 |
| `star` | `eleven_text_to_sound_v3` | single bright twinkling star ding, glockenspiel with sparkle, short (0.8 s requested) | 0.54 s | 8.8 KB | -8.9 LUFS | 0.31 |  |
| `win` | `eleven_text_to_sound_v3` | short triumphant cheerful victory jingle, bright brass and glockenspiel, level complete (2.5 s requested) | 1.69 s | 17.5 KB | -10.2 LUFS | 0.46 |  |
| `lose` | `eleven_text_to_sound_v3` | short comedic sad trombone wah wah wah fail jingle, game over (2.2 s requested) | 1.52 s | 16.3 KB | -12.0 LUFS | 0.50 |  |
| `unlock` | `eleven_text_to_sound_v3` | magical unlock shimmer, quick rising harp glissando ending on a bell ding (1.2 s requested) | 0.85 s | 11.0 KB | -9.3 LUFS | 0.32 |  |
| `claim` | `eleven_text_to_sound_v3` | reward claimed chime, bright bell chord with a sparkle, satisfying and short (1.2 s requested) | 0.94 s | 11.7 KB | -11.1 LUFS | 0.40 |  |
| `whoosh` | `eleven_text_to_sound_v3` | fast air whoosh swipe, short (0.6 s requested) | 0.30 s | 6.8 KB | -15.5 LUFS | 0.67 | 0.06 |
| `swish` | `eleven_text_to_sound_v3` | quick light swish of a ball flying past, short (0.5 s requested) | 0.28 s | 6.7 KB | -23.3 LUFS | 1.46 | 0.08 |
| `squirt` | `eleven_text_to_sound_v3` | squeezing a plastic ketchup bottle, short wet squirt (0.6 s requested) | 0.30 s | 6.8 KB | -16.8 LUFS | 0.85 | 0.06 |
| `splat` | `eleven_text_to_sound_v3` | wet ketchup splat onto a plate, short (0.6 s requested) | 0.31 s | 6.9 KB | -18.6 LUFS | 1.08 | 0.06 |
| `splash` | `eleven_text_to_sound_v3` | foot stomping into a rain puddle, water splash, short (0.8 s requested) | 0.74 s | 10.2 KB | -16.4 LUFS | 1.05 | 0.05 |
| `thunder` | `eleven_text_to_sound_v3` | loud close thunder crack followed by a deep rolling rumble (3.5 s requested) | 2.33 s | 22.6 KB | -10.4 LUFS | 0.74 |  |
| `kiss` | `eleven_text_to_sound_v3` | cute cartoon kiss smooch, one short mwah (0.6 s requested) | 0.42 s | 7.8 KB | -13.4 LUFS | 0.51 | 0.04 |
| `scream` | `eleven_text_to_sound_v3` | cartoon little kid shouting eww in disgust, short (1 s requested) | 0.65 s | 9.4 KB | -8.4 LUFS | 0.33 |  |
| `page` | `eleven_text_to_sound_v3` | single paper page turn of a storybook, short (0.6 s requested) | 0.38 s | 7.4 KB | -16.1 LUFS | 0.56 | 0.05 |
| `whoa` | `eleven_text_to_sound_v3` | small crowd of teenagers going whoa in amazement, short (1.4 s requested) | 1.29 s | 14.5 KB | -8.5 LUFS | 0.30 |  |
| `cheer` | `eleven_text_to_sound_v3` | small crowd of teenagers cheering and clapping, short (2.2 s requested) | 1.93 s | 19.5 KB | -9.1 LUFS | 0.32 |  |
| `ribbit` | `eleven_text_to_sound_v3` | cute cartoon frog ribbit croak, one short croak (0.6 s requested) | 0.48 s | 8.1 KB | -9.5 LUFS | 0.37 | 0.06 |
| `camera` | `eleven_text_to_sound_v3` | camera shutter click with a flash pop, fashion photo, short (0.5 s requested) | 0.22 s | 6.2 KB | -16.1 LUFS | 0.65 | 0.03 |
| `rain` | `eleven_text_to_sound_v3` | steady heavy rain falling on a car roof and pavement, constant, no thunder (12 s requested, loop) | 11.50 s | 140.4 KB | -11.9 LUFS (integrated) | 0.22 |  |

## Verification

`python3 tools/eleven_check.py` produced the numbers above and exits 0. It fails when a seam
adds something audible:
- a jump bigger than the music's own step into `loopStart`
- an extra onset (flux excess above 1)
- a level step over 2 dB
- a blend dip deeper than 3 dB
- music.json gains that no longer match the files

A deliberately broken manifest trips the gates as intended: `title` with `loopEnd` 12 ms off,
`l5` with the ρ boost removed, and `map` with a stale gain.

A Playwright script, kept out of the repo, ran against a production build (`vite preview`,
with the service worker). It used an 844×390 touch viewport and one click to unlock audio, and
passed 79 of 79 checks in each of Chromium, Google Chrome and WebKit 26.6:
- Before the gesture, `title` is queued with no context. After it, `title` plays from its file.
- All 26 SFX decode. Every `SfxName` plays: from its file where `sfx.json` lists one, from the synth otherwise.
- All 14 music ids start from file with a crossfade and produce audible output. Starting from the decode cache takes 100 to 300 ms.
- During a map → title switch, master RMS never drops below 0.016.
- `stopMusic()` reaches silence, and `audio.music.id` becomes null.
- A stop that lands right after a cached start stays silent (peak 0). The same build with the old `.value` read-back fails this check with a 0.020 RMS burst.
- Going A → B (still loading) → A keeps A playing, with no restart.
- Playing the same id again is a no-op, and `{ restart: true }` restarts the track.
- Each decoded track is rendered across `loopEnd` in an OfflineAudioContext. The output after the wrap matches the buffer from `loopStart` exactly. In every browser and track, the step across the wrap equals the music's own step into `loopStart`. The largest is 1.37 × p99, a drum attack in `ending` under WebKit.
- `setRain` plays the file loop and then turns off. The rain wrap, rendered at 48 kHz, is 0.49 × p99.
- With the service worker blocked, `map.mp3`, `l2.mp3` and `jump.m4a` aborted and `l3.mp3` served as garbage, playback falls back to the synth tracks and the synth SFX. The decode failure is logged.
- `?play=l1` plays `l1` from its file.
- No console errors.

### Native app (iOS simulator)

A temporary, query-gated harness (since removed) ran the fast skip inside the real app on the
iPhone 17 Pro Max simulator, with iOS 26.3 and Capacitor. It fired a fresh New game, tapped the
prologue every 40–150 ms, then Liz's House → play → Next → Start, and sampled
`__audioDebug` for 8 s.

- **Before:** every music and SFX fetch failed with status 0, so `l1` and everything else came
  from the synth. WebKit flipped the audio-session category 11 times during the prologue.
- **After:** title, map, narration and `l1` all play from file. On the final code:
  - 6/6 at 120 ms taps
  - 4/4 at 40 ms taps

  The session stays `MediaPlayback` throughout: 392 category updates, no flips.

`tests/audio-music.test.ts` (21 tests) runs the same races against a fake AudioContext whose
decodes the test resolves in any order. It covers:
- fast skips
- one decode at a time, and no duplicate decode
- crossfades not counting as an unexpected end
- the retry, then the synth fallback
- status-0 responses, empty bodies, and HTTP errors that have a body
- stalled decodes, and fetches that never answer (aborted, retried, then synth)
- stop during a load, and A → B → A
- resuming on a tap
- restarting a dropped source
- the watchdog and its restart limit

Breaking the `onended` guard, the HTTP status check, the in-flight reuse or the restart limit
each makes at least one test fail.

## Known issues

- Nobody has listened to these. Quality was judged from prompts and listen-proxy numbers only,
  and the SFX in particular (`scream`, `whoa`, `kiss` and other voice-like ones) deserve a
  listen on a phone.
- The iOS audio session, ringer switch included:
  - **Who decides:** WebKit picks the audio-session category itself, from its GPU process.
    A native `AVAudioSession.setCategory(.playback, .mixWithOthers)` in AppDelegate never
    reached it, so that call has been removed. WebKit's own log in the simulator shows it
    setting `AmbientSound` for Web Audio and `MediaPlayback / LongFormAudio` while a voice
    `<audio>` plays. Capacitor's status-0 answers for media files are deliberate upstream
    behaviour; only Range requests get a real 206. So the engine's acceptance of status 0
    with a body stays.
  - **The churn:** skipping through the voiced prologue flipped the category 11 times in about
    1.2 s.
  - **What the engine does:** it sets `navigator.audioSession.type = 'playback'` everywhere it
    exists, Safari 17+ and the app's WKWebView alike. WebKit then holds `MediaPlayback` all
    the way through: 238 category updates in six fast runs, no flips.
  - **Trade-off:** music, SFX and voices all play with the silent switch on, and the game
    pauses music the player has running in other apps. No web setting gives "playback but mix
    with others".
  - **Older Safari:** it ignores the setting, so Web Audio still follows the switch there.
- The ElevenLabs mp3s have no gapless (LAME) header. Browsers may trim a different decoder
  delay, a constant few ms, which shifts `start` slightly. Loop length and seam continuity are
  unaffected, and WebKit and Chromium both measure clean.
- First play of a track on an iPhone waits for its decode. With one decode at a time, that can
  include finishing the decode already running, probably well under a second. The old track
  keeps playing until then. `playLevel` preloads the level's track while the narration is on
  screen.

## Regenerating

```sh
python3 tools/eleven_music.py gen l3 --force   # new take of one track (billed)
python3 tools/eleven_music.py fit              # refit loops + gains for all tracks -> music.json
WESLIZ_SFX_RAW=/some/dir python3 tools/eleven_sfx.py gen splat   # raw take (billed)
WESLIZ_SFX_RAW=/some/dir python3 tools/eleven_sfx.py make        # trim/encode -> sfx.json
python3 tools/eleven_check.py                  # report; exits 1 on a clicking seam or level drift
```

The key comes from `elevenlabs_api_key=` in `.env`, or `ELEVENLABS_API_KEY`. It is scoped
and has no `user_read`, so the credit balance can't be queried. Raw SFX takes live outside the
repo, so `make` needs the raw directory from the original run, or fresh `gen` takes. `fit` is
deterministic: running it again produces the same `music.json`.

## Credits used

- Music: 1,197 s generated (≈ 20 min): 1,031 s shipped, plus 166 s of discarded takes.
  The Music API sends no cost header. At the published API rate of $0.15 per minute, that is
  about $3.
- SFX: 26 generations with `eleven_text_to_sound_v3`, 373 credits by the `character-cost`
  header (about 10 per second). A first pass on `eleven_text_to_sound_v2` cost 378 credits over
  27 generations, and two v3 test generations cost 36. That makes 787 credits for SFX in all.

## Licensing

All tracks and effects were generated with ElevenLabs on the project's paid plan. ElevenLabs'
terms give the subscriber the right to use generated output, including commercially (see the
Eleven Music and Sound Effects terms; re-check them before an App Store release). The prompts
describe genre, instruments and mood only, and never name an artist or a song.
