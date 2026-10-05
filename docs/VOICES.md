# Character voices

Every spoken line in the game is a recorded ElevenLabs clip in `public/audio/voice/`.
`src/data/voices.json` maps `voiceKey(who, text)` → `"audio/voice/<file>.mp3"`, and
`core/audio.ts` plays that clip for `speak()` / `speakLines()`. A line without a clip falls
back to Web Speech for narration and stays silent in dialogue (`tts: false`).

```
node tools/voices_build.mjs          # record what's missing, rewrite voices.json
node tools/voices_build.mjs --dry    # list every line and whether it has a clip; sends nothing
python3 tools/voices_check.py        # listen-check every clip; exits 1 if anything is flagged
```

Requires Node 25 (it imports `src/data/story.ts` directly), macOS `afconvert` (decoding),
and `elevenlabs_api_key=…` in `.env`. The script re-runs itself with `--use-system-ca`
because the office TLS proxy's root CA only exists in the macOS keychain.

## Adding lines

Run the build after adding lines. It finds lines in these places:

1. **`src/data/story.ts`**: every level's `narration` paragraphs and PROLOGUE (as `wes`,
   which is how `narration.ts` and `title.ts` speak them), every `outro` / `outroAlt` /
   `failLine` and `CHUCKS_REVEAL` (each with its `who`), and ENDING (`narrator`).
2. **Literal dialogue anywhere under `src/`**, written either as an object literal
   `{ who: 'jocelyn', text: 'Five stars. Obviously.', mood: 'happy' }` or as a call
   `audio.speak('Five stars. Obviously.', { who: 'jocelyn' })`. `who` and `text` must
   be plain string literals in the same object or call. The scan doesn't follow variables or
   `${}` templates.
3. **Text built at runtime**, for example a line picked by score or a filled-in template:
   list every variant in `EXTRA_LINES` in `tools/voices_config.mjs`.

Rules:
- `who` must have an entry in `CAST`. An unknown speaker prints a warning and exits 1.
- The game must pass exactly the same text to `speak` (whitespace collapses). If one
  character changes, the clip no longer matches and the line gets re-recorded on the next run.
- `*stage directions*` are kept in the key but not spoken.
- `mood` (`happy` / `sad` / `mad`) turns into an audio tag through `MOOD_TAGS`, unless the
  line has a `DIRECTION` entry.

## Direction

`DIRECTION` in `tools/voices_config.mjs` maps `"who|start of the line"` to eleven_v4 audio
tags such as `[mischievously]`, `[tearfully]`, `[shrieking]` or `[trying not to laugh]`.
The tags go in front of the line and aren't spoken. The longest matching prefix wins. The
build warns when a prefix matches zero lines or more than one. Changing a tag re-records only
that line.

## How a clip is made

- The file name is `<who>-<sha1(who, spoken text, voice, model, settings, format)[:10]>.mp3`.
  If the file exists, it's current. Anything that changes the performance gets a new
  file, and the old one is deleted on the next full run (`--keep` skips the delete; so does
  any run with `--only` or a failed line).
- Model: **all 97 clips use `eleven_v4`**, the newest and most expressive model. Nothing needed
  a fallback. If v4 ever can't handle a voice or a line, give that speaker `model:
  'eleven_v3'` (or `'eleven_multilingual_v2'`) in `CAST`; the model is part of the clip hash,
  so only that speaker is re-recorded. `GET /v1/models` returns 401 because this key lacks
  the `models_read` permission. The id `eleven_v4` comes from the ElevenLabs models docs and
  was confirmed by the TTS endpoint accepting it for every clip and audition.
- Output `mp3_44100_96` (mono, 96 kbps). The seed comes from the line's key, so a deleted
  clip re-records the same way. `--redo=<text>` takes a fresh, random take of matching lines.
- Each take is checked. Speech length must be 0.45–2.4× the expected time at about 2.7
  words/s, the clip can't be silent or clipped, and an ElevenLabs Scribe transcript must match
  the script at 75% or more (letters only, doubled letters collapsed). A failing take is
  retried with another seed, up to 3 takes, and the best one is kept.
- Loudness: a final pass normalizes every clip to **−20 LUFS** (BS.1770, gated) without
  re-encoding. It adds to each granule's MP3 `global_gain`, in 1.5 dB steps, the way
  mp3gain does. Peaks stay under −0.5 dBFS, so a clip with a sharp transient can end up
  1–3 dB under target. The pass is idempotent, and changing `TARGET_LUFS` re-levels everything
  without re-recording.

## Cast

Every role was cast from existing voices; none were designed.

- **Searched first:** the account's voices (`GET /v2/voices`: 32 voices, 21 premade and 11
  professional) and the shared library (`GET /v1/shared-voices`, `language=en`, using the
  `search`, `gender`, `age` and `use_case` filters). Searches: teen boy, teenager, teen
  (female), young boy, little boy, child, kid, little girl, boy next door, charming,
  playful, cocky, witty, bright, sassy, smooth, jock, bro, party, goofy, mom, stepmom,
  storyteller, and young male `characters_animation`.
- **Found:** Gaming Russell (ryno) was already in the account. The other nine come from the
  shared library.
- **Designed:** none. Voice Design was tried once, for wes-kid ("a seven-year-old American
  boy…" with `eleven_ttv_v3`), and was refused with `403 blocked_generation`. ElevenLabs
  won't design child voices, so both 7-year-olds use library voices made for kid characters
  (adult-performed cartoon kids).
- **Not added to the account:** library voices work by id in text-to-speech (every clip
  returned 200), and adding them would only use up account voice slots. If one ever stops
  working by id, add it with `POST /v1/voices/add/{public_owner_id}/{voice_id}`.

Pitch is the median F0 from the audition clips.

| who | voice | id | settings (stability / speed) | why |
|---|---|---|---|---|
| wes | Cyrien – The Charming Rogue | `AFkIMdmeB0MMrr1tgGds` | 0.45 / 1.0 | young American, "charming, flirty, confident and playful": the smirk. ~113 Hz |
| liz | Penelope – Teen, Joyous and Expressive | `tJx7PsKA0xKckfV0qHhK` | 0.4 / 1.05 | teen girl, expressive, bright. ~264 Hz |
| wes-kid | Valf – Young, Playful & Sarcastic | `loY1uopAz31XyhAEhNSa` | 0.35 / 1.0 | "kid characters, mischievous boys". ~324 Hz |
| liz-kid | Candy – Young and Sweet | `Nggzl2QAXh3OijoXD116` | 0.35 / 1.05 | high, sassy, cartoony, good at shrieking EWWW. ~550 Hz shrieking |
| michael | Brayden – Cheery, Clear and Chill | `3XOBzXhnDY98yeWQ3GdM` | 0.55 / 1.0 | deep-voiced teen, smooth, polite, a bit flat on purpose. ~185 Hz |
| jocelyn | Kathie – Sassy & Playful | `o9B86nZP8mMLaT5FBEzP` | 0.4 / 1.0 | sassy, sarcastic, comedic timing. ~232 Hz |
| helena | Yvonne – Sweet Natural unscripted | `lLdl3pjVr6svNgC2Nerx` | 0.5 / 1.0 | "kind and sweet, loving middle-aged mom", natural rather than announcer |
| noah | Knox – Philosophical Gym Bro | `cgLpYGyXZhkyalKZ0xeZ` | 0.35 / 1.0 | goofy jock with emotional swings, built for v3/v4 |
| ryno | Gaming Russell (account voice) | `ZauUyVXAz5znrgRuElJ5` | 0.35 / 1.05 | young, excited, loud. No lines yet |
| narrator | Margot – Storyteller | `wnTuHlYPeBBHc2J3vMbA` | 0.5 / 1.0 | warm, gentle storyteller for the rom-com closing voice-over |

`similarity_boost` is 0.8 for every voice. To recast a role, change its `voice_id` and
re-run: only that speaker's lines are re-recorded. Runners-up from the auditions (all
eleven_v4, all transcribed correctly):

- wes: Aaron `B6uUx2p7cRgxseOUyP6P` ("boy-next-door charm", more earnest), Liam (premade) `TX3LPaxmHKxFdv7VOQHJ`
- liz: Jessica (premade) `cgSgspJ2msm6clMCkdW9`, Caroline Braden `yK2Ny0mq8WplixhD1td3`
- jocelyn: Laura (premade) `FGY2WhTYpPnrIDTdsKH5`
- helena: Bella (premade) `hpp4J3VqNfWAUOO0d1Us`, Lena `roYauZ4bOLAKvVZTPLre`
- michael: Josh `ZoiZ8fuDWInAcwPXaVeq`, Will (premade) `bIHbv24MWmeRgasZH58o`
- noah / ryno: Gus `wGkprrTXgBM5EC3Znt6U`, Chadwitch `eadgjmk4R4uojdsheG9t`
- narrator: Elizabeth `XhNlP8uwiH6XZSFnH1yL`, River (premade) `SAz9YHcvj6GT2YYXdXww`
- wes-kid: Teddy Twinkle `XjGYkUkzth8BPs29fmcV`. liz-kid: Cherry Twinkle `XJ2fW4ybq7HouelYYGcL`

## Notes

- Credits: eleven_v4 bills far below one credit per character (the `character-cost`
  header, for example 10 credits for a 74-character line). Recording the first 97 lines cost
  1,154 credits. The build prints what each run costs. This API key doesn't have the
  `user_read` permission, so the balance (`GET /v1/user/subscription`) can't be read here.
- "Buxbaum" comes out close to BUCKS-bawm (Scribe hears "Bucks Bomb"), which is right.
- Size: about 68 KB per clip, 6.6 MB for 97 clips. The budget is 25 MB.
- Run the build from one place at a time, normally the orchestrator at the end. Two runs at
  once would race on `voices.json`.
