#!/usr/bin/env node
/**
 * Character voice clips for The Soundtrack of Wes and Liz (ElevenLabs).
 *
 * Collects every spoken line in the game, records the missing ones and
 * writes src/data/voices.json (voiceKey(who, text) -> "audio/voice/<file>.mp3"),
 * which core/audio.ts uses for speakLines()/speak().
 *
 *   node tools/voices_build.mjs           record missing clips, write voices.json
 *   node tools/voices_build.mjs --dry     list lines, what is missing, nothing is sent
 *   --only=liz,jocelyn   limit recording to these speakers (no pruning)
 *   --redo=<text>        re-record lines whose key contains <text> (a fresh take)
 *   --no-stt             skip the speech-to-text check of new clips
 *   --keep               keep clips no line uses any more
 *
 * Idempotent: a clip's file name hashes everything that shapes the
 * performance (speaker, spoken text, voice, model, settings, format), so an
 * existing file is always current and an unchanged line costs nothing.
 * Every new take is checked (length vs. word count, silence, clipping, and
 * a speech-to-text transcript vs. the script) and retried with another seed
 * if it fails. A final pass loudness-normalises every clip losslessly (MP3
 * global_gain, 1.5 dB steps). Cast, direction and extra lines live in
 * tools/voices_config.mjs. See docs/VOICES.md.
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import vm from 'node:vm';
import { CAST, DIRECTION, EXTRA_LINES, FORMAT, MODEL, MOOD_TAGS, TARGET_LUFS } from './voices_config.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public/audio/voice');
const MAP_FILE = join(ROOT, 'src/data/voices.json');
const API = 'https://api.elevenlabs.io';
const WORDS_PER_SEC = 2.7;

/** Same as voiceKey() in src/core/audio.ts. */
export function voiceKey(who, text) {
  return `${who}|${text.replace(/\s+/g, ' ').trim()}`;
}

// ------------------------------------------------------------------ lines

const STR = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|\`(?:[^\`\\$]|\\.)*\``;
const LINE_OBJ = /\{[^{}]*?\bwho:\s*(['"])([\w-]+)\1[^{}]*\}/g;
const TEXT_FIELD = new RegExp(String.raw`\btext:\s*(${STR})`);
const MOOD_FIELD = /\bmood:\s*(['"])([\w-]+)\1/;
const SPEAK_CALL = new RegExp(String.raw`\.speak\(\s*(${STR})\s*(?:,\s*\{([^{}]*)\})?\s*\)`, 'g');
const WHO_FIELD = /\bwho:\s*(['"])([\w-]+)\1/;

/** Every line the game can speak, keyed by voiceKey. */
export async function collectLines() {
  const lines = new Map();
  const add = (who, text, mood, from) => {
    const key = voiceKey(who, text);
    if (!lines.has(key)) lines.set(key, { key, who, text: key.slice(who.length + 1), mood, from });
  };
  const story = await import(pathToFileURL(join(ROOT, 'src/data/story.ts')).href);
  story.PROLOGUE.forEach((p, i) => add('wes', p, undefined, `PROLOGUE[${i}]`));
  for (const lv of Object.values(story.LEVELS)) {
    lv.narration.forEach((p, i) => add('wes', p, undefined, `${lv.id}.narration[${i}]`));
    const groups = { outro: lv.outro, outroAlt: lv.outroAlt, failLine: lv.failLine && [lv.failLine] };
    for (const [field, ls] of Object.entries(groups)) (ls ?? []).forEach((l, i) => add(l.who, l.text, l.mood, `${lv.id}.${field}[${i}]`));
  }
  story.CHUCKS_REVEAL.forEach((l, i) => add(l.who, l.text, l.mood, `CHUCKS_REVEAL[${i}]`));
  story.ENDING.forEach((p, i) => add('narrator', p, undefined, `ENDING[${i}]`));

  // Literal lines anywhere else in src/: { who: 'x', text: '…' } objects
  // and audio.speak('…', { who: 'x' }) calls.
  for (const file of walk(join(ROOT, 'src'))) {
    const src = readFileSync(file, 'utf8');
    const at = (i) => `${relative(ROOT, file)}:${src.slice(0, i).split('\n').length}`;
    for (const m of src.matchAll(LINE_OBJ)) {
      const t = TEXT_FIELD.exec(m[0]);
      if (t) add(m[2], vm.runInNewContext(t[1]), MOOD_FIELD.exec(m[0])?.[2], at(m.index));
    }
    for (const m of src.matchAll(SPEAK_CALL)) add(WHO_FIELD.exec(m[2] ?? '')?.[2] ?? 'wes', vm.runInNewContext(m[1]), undefined, at(m.index));
  }
  for (const l of EXTRA_LINES) add(l.who, l.text, l.mood, 'voices_config EXTRA_LINES');
  return [...lines.values()];
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(name)) yield p;
  }
}

/** DIRECTION entry for a line: the longest key prefix that matches. */
export function direction(key) {
  let best = null;
  for (const p of Object.keys(DIRECTION)) if (key.startsWith(p) && (!best || p.length > best.length)) best = p;
  return best;
}

/** The text sent to ElevenLabs: audio tags + the line, stage directions removed. */
export function performance(line) {
  const plain = line.text.replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim();
  const d = direction(line.key);
  const tags = d ? DIRECTION[d] : MOOD_TAGS[line.mood];
  return tags ? `${tags} ${plain}` : plain;
}

/** Words actually spoken (audio tags and stage directions removed). */
export function spokenWords(text) {
  return text.replace(/\[[^\]]*\]|\*[^*]*\*/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

/** Rough spoken word count: "2021" is read as "twenty twenty-one". */
export function wordCount(words) {
  return words.reduce((n, w) => n + (/^\d+\W*$/.test(w) ? Math.ceil(w.replace(/\D/g, '').length / 2) : 1), 0);
}

export function clipFile(line, spoken) {
  const c = CAST[line.who];
  const h = createHash('sha1').update(JSON.stringify([line.who, spoken, c.voice_id, c.model ?? MODEL, c.settings, FORMAT])).digest('hex');
  return `${line.who}-${h.slice(0, 10)}.mp3`;
}

// -------------------------------------------------------------------- api

function apiKey() {
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  const m = /^\s*elevenlabs_api_key\s*=\s*["']?([^"'\s]+)/m.exec(env);
  if (!m) throw new Error('elevenlabs_api_key missing from .env');
  return m[1];
}

async function call(path, init, attempt = 0) {
  const r = await fetch(API + path, { ...init, headers: { 'xi-api-key': apiKey(), ...init.headers } });
  if (r.ok) return r;
  if ((r.status === 429 || r.status >= 500) && attempt < 5) {
    await new Promise((res) => setTimeout(res, 1500 * 2 ** attempt));
    return call(path, init, attempt + 1);
  }
  throw new Error(`${path} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
}

export async function tts(who, text, seed) {
  const c = CAST[who];
  const r = await call(`/v1/text-to-speech/${c.voice_id}?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: c.model ?? MODEL, voice_settings: c.settings, seed }),
  });
  return { mp3: Buffer.from(await r.arrayBuffer()), credits: Number(r.headers.get('character-cost') ?? 0) };
}

export async function transcribe(mp3) {
  const fd = new FormData();
  fd.append('model_id', 'scribe_v1');
  fd.append('tag_audio_events', 'false');
  fd.append('file', new Blob([mp3], { type: 'audio/mpeg' }), 'clip.mp3');
  const r = await call('/v1/speech-to-text', { method: 'POST', body: fd });
  return (await r.json()).text ?? '';
}

/**
 * 0..1 similarity of a transcript to the script: 1 - edit distance over
 * letters only, so "Dreamhouse"/"dream house" match, and doubled letters
 * collapse so "EWWW"/"Ew" and "AAAAAH"/"Ah" match too.
 */
export function scriptMatch(script, heard) {
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').replace(/(\p{L})\1+/gu, '$1');
  const a = norm(script);
  const b = norm(heard);
  if (!a.length) return 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return Math.max(0, 1 - prev[b.length] / a.length);
}

// ------------------------------------------------------------------ audio

/** Decode with afconvert (macOS) and measure the clip. */
export function analyse(mp3) {
  const dir = mkdtempSync(join(tmpdir(), 'voice-'));
  try {
    writeFileSync(join(dir, 'a.mp3'), mp3);
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16', join(dir, 'a.mp3'), join(dir, 'a.wav')]);
    const { rate, x } = readWav(readFileSync(join(dir, 'a.wav')));
    let peak = 0;
    let clipped = 0;
    for (const v of x) {
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
    }
    const db = (p) => 10 * Math.log10(p + 1e-12);
    // speech starts/ends where 10 ms frames rise above -45 dBFS
    const fr = Math.round(rate / 100);
    const active = [];
    for (let i = 0; i + fr <= x.length; i += fr) {
      let s = 0;
      for (let j = i; j < i + fr; j++) s += x[j] * x[j];
      active.push(db(s / fr) > -45);
    }
    const first = active.indexOf(true);
    const last = active.lastIndexOf(true);
    return {
      duration: x.length / rate,
      lufs: loudness(x, rate),
      peakDb: 20 * Math.log10(peak + 1e-9),
      clipped,
      lead: first < 0 ? x.length / rate : first / 100,
      tail: first < 0 ? 0 : (active.length - 1 - last) / 100,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readWav(buf) {
  let i = 12;
  let rate = 44100;
  let ch = 1;
  while (i + 8 <= buf.length) {
    const id = buf.toString('latin1', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    if (id === 'fmt ') {
      ch = buf.readUInt16LE(i + 10);
      rate = buf.readUInt32LE(i + 12);
    } else if (id === 'data') {
      const n = Math.floor(Math.min(size, buf.length - i - 8) / 2 / ch);
      const x = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        let s = 0;
        for (let c = 0; c < ch; c++) s += buf.readInt16LE(i + 8 + (k * ch + c) * 2);
        x[k] = s / ch / 32768;
      }
      return { rate, x };
    }
    i += 8 + size + (size & 1);
  }
  throw new Error('no data chunk in decoded WAV');
}

/** Integrated loudness, ITU-R BS.1770 (K-weighting, 400 ms blocks, gated). */
export function loudness(x, rate) {
  const biquad = (b, a, input) => {
    const out = new Float64Array(input.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let n = 0; n < input.length; n++) {
      const y = (b[0] * input[n] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2) / a[0];
      x2 = x1; x1 = input[n]; y2 = y1; y1 = y;
      out[n] = y;
    }
    return out;
  };
  // stage 1: +4 dB high shelf ~1.7 kHz; stage 2: high-pass ~38 Hz
  let w = (2 * Math.PI * 1681.974450955533) / rate;
  const A = 10 ** (3.999843853973347 / 40);
  let al = Math.sin(w) / (2 * 0.7071752369554196);
  const c = Math.cos(w);
  const sa = 2 * Math.sqrt(A) * al;
  const shelf = biquad(
    [A * (A + 1 + (A - 1) * c + sa), -2 * A * (A - 1 + (A + 1) * c), A * (A + 1 + (A - 1) * c - sa)],
    [A + 1 - (A - 1) * c + sa, 2 * (A - 1 - (A + 1) * c), A + 1 - (A - 1) * c - sa],
    x,
  );
  w = (2 * Math.PI * 38.13547087602444) / rate;
  al = Math.sin(w) / (2 * 0.5003270373238773);
  const k = biquad([(1 + Math.cos(w)) / 2, -(1 + Math.cos(w)), (1 + Math.cos(w)) / 2], [1 + al, -2 * Math.cos(w), 1 - al], shelf);
  const blk = Math.round(rate * 0.4);
  const hop = Math.round(rate * 0.1);
  const ms = [];
  for (let i = 0; i + blk <= k.length; i += hop) {
    let s = 0;
    for (let j = i; j < i + blk; j++) s += k[j] * k[j];
    ms.push(s / blk);
  }
  if (!ms.length) {
    let s = 0;
    for (const v of k) s += v * v;
    ms.push(s / Math.max(1, k.length));
  }
  const L = (p) => -0.691 + 10 * Math.log10(p + 1e-12);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const abs = ms.filter((p) => L(p) > -70);
  if (!abs.length) return -70;
  const rel = L(mean(abs)) - 10;
  const gated = abs.filter((p) => L(p) > rel);
  return L(mean(gated.length ? gated : abs));
}

const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES = [44100, 48000, 32000];

/**
 * Lossless MP3 gain (what mp3gain does): add `steps` × 1.5 dB to every
 * granule's global_gain in the Layer III side info. No re-encode.
 */
export function mp3Gain(mp3, steps) {
  const b = Buffer.from(mp3);
  if (!steps) return b;
  let i = 0;
  if (b.toString('latin1', 0, 3) === 'ID3') i = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f)) + (b[5] & 0x10 ? 10 : 0);
  const bit = (pos) => (b[pos >> 3] >> (7 - (pos & 7))) & 1;
  const get8 = (pos) => { let v = 0; for (let k = 0; k < 8; k++) v = (v << 1) | bit(pos + k); return v; };
  const set8 = (pos, v) => {
    for (let k = 0; k < 8; k++) {
      const p = pos + k;
      const m = 1 << (7 - (p & 7));
      if ((v >> (7 - k)) & 1) b[p >> 3] |= m;
      else b[p >> 3] &= ~m;
    }
  };
  let frames = 0;
  while (i + 4 <= b.length) {
    const h = b.readUInt32BE(i);
    const ver = (h >>> 19) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const layer = (h >>> 17) & 3; // 1 = Layer III
    const bri = (h >>> 12) & 15;
    const sri = (h >>> 10) & 3;
    if (h >>> 21 !== 0x7ff || ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) {
      i++;
      continue;
    }
    if (!((h >>> 16) & 1)) throw new Error('CRC-protected MP3 frames are not supported');
    const mpeg1 = ver === 3;
    const mono = ((h >>> 6) & 3) === 3;
    const nch = mono ? 1 : 2;
    const rate = RATES[sri] / (mpeg1 ? 1 : ver === 2 ? 2 : 4);
    const len = Math.floor(((mpeg1 ? 144 : 72) * BITRATES[mpeg1 ? 1 : 2][bri] * 1000) / rate) + ((h >>> 9) & 1);
    const sideLen = mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17;
    const tag = b.toString('latin1', i + 4 + sideLen, i + 8 + sideLen);
    if (tag !== 'Xing' && tag !== 'Info') {
      const base = (i + 4) * 8;
      let pos = base + (mpeg1 ? 9 + (mono ? 5 : 3) + 4 * nch : 8 + (mono ? 1 : 2));
      for (let g = 0; g < (mpeg1 ? 2 : 1); g++) {
        for (let c = 0; c < nch; c++) {
          const gp = pos + 21; // after part2_3_length (12) + big_values (9)
          set8(gp, Math.max(0, Math.min(255, get8(gp) + steps)));
          pos += mpeg1 ? 59 : 63;
        }
      }
      frames++;
    }
    i += len;
  }
  if (!frames) throw new Error('no MPEG Layer III frames found');
  return b;
}

/** Gain steps that bring a clip to TARGET_LUFS without pushing peaks over -0.5 dBFS. */
export function gainSteps(a) {
  const d = TARGET_LUFS - a.lufs;
  if (Math.abs(d) < 0.8) return 0; // already as close as 1.5 dB steps allow; don't flip-flop between runs
  let n = Math.round(d / 1.5);
  while (n > 0 && a.peakDb + n * 1.5 > -0.5) n--;
  return n;
}

/** Problems with a take, empty if it passes. */
export function problems(a, words, accuracy) {
  const out = [];
  const expected = Math.max(0.6, words / WORDS_PER_SEC);
  const ratio = (a.duration - a.lead - a.tail) / expected;
  if (a.lufs < -40) out.push('silent');
  if (ratio < 0.45) out.push(`too short (${ratio.toFixed(2)}x)`);
  if (ratio > 2.4) out.push(`too long (${ratio.toFixed(2)}x)`);
  if (a.clipped > 20) out.push(`clipped (${a.clipped} samples)`);
  if (accuracy !== undefined && accuracy < 0.75) out.push(`transcript ${Math.round(accuracy * 100)}%`);
  return out;
}

// ------------------------------------------------------------------- main

async function record(line, spoken, opts) {
  const words = wordCount(spokenWords(spoken));
  const base = parseInt(createHash('sha1').update(line.key).digest('hex').slice(0, 7), 16);
  let best = null;
  let credits = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const seed = opts.fresh ? Math.floor(Math.random() * 2 ** 31) : base + attempt;
    const take = await tts(line.who, spoken, seed);
    credits += take.credits;
    const a = analyse(take.mp3);
    const heard = opts.stt ? await transcribe(take.mp3) : undefined;
    const accuracy = heard === undefined ? undefined : scriptMatch(spokenWords(spoken).join(' '), heard);
    const issues = problems(a, words, accuracy);
    const score = issues.length * 10 - (accuracy ?? 1);
    if (!best || score < best.score) best = { ...take, a, heard, accuracy, issues, score };
    if (!issues.length) break;
    console.log(`  retake ${line.key.slice(0, 60)}: ${issues.join(', ')}${heard !== undefined ? ` — heard "${heard}"` : ''}`);
  }
  return { ...best, credits };
}

async function main() {
  const { values: args } = parseArgs({
    options: { dry: { type: 'boolean' }, only: { type: 'string' }, redo: { type: 'string' }, 'no-stt': { type: 'boolean' }, keep: { type: 'boolean' } },
  });
  const only = args.only ? new Set(args.only.split(',')) : null;
  const lines = await collectLines();
  const old = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {};
  const unknown = lines.filter((l) => !CAST[l.who]);
  for (const l of unknown) console.warn(`! no voice cast for "${l.who}" (${l.from}): ${l.text}`);
  for (const p of Object.keys(DIRECTION)) {
    const n = lines.filter((l) => direction(l.key) === p).length;
    if (n !== 1) console.warn(`! DIRECTION "${p}" matches ${n} lines (expected 1)`);
  }

  const jobs = lines
    .filter((l) => CAST[l.who])
    .map((l) => {
      const spoken = performance(l);
      const file = clipFile(l, spoken);
      const redo = !!args.redo && l.key.includes(args.redo);
      return { line: l, spoken, file, todo: redo || !existsSync(join(OUT_DIR, file)), redo };
    });
  const todo = jobs.filter((j) => j.todo && (!only || only.has(j.line.who)));
  console.log(`${lines.length} lines found, ${jobs.length} castable, ${jobs.length - jobs.filter((j) => j.todo).length} already recorded, ${todo.length} to record`);
  if (args.dry) {
    for (const j of jobs) console.log(`${j.todo ? '+' : '='} ${j.file}  ${j.line.from}  ${j.spoken}`);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  let credits = 0;
  const failed = [];
  const queue = [...todo];
  const worker = async () => {
    for (let j; (j = queue.shift()); ) {
      try {
        const r = await record(j.line, j.spoken, { stt: !args['no-stt'], fresh: j.redo });
        writeFileSync(join(OUT_DIR, j.file), r.mp3);
        credits += r.credits;
        const acc = r.accuracy === undefined ? '' : ` · transcript ${Math.round(r.accuracy * 100)}%`;
        console.log(`${r.issues.length ? '?' : '✓'} ${j.file} ${r.a.duration.toFixed(1)}s${acc}${r.issues.length ? ` · ${r.issues.join(', ')} — heard "${r.heard}"` : ''}`);
      } catch (e) {
        failed.push(j);
        console.error(`✗ ${j.line.key}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker)); // the API allows 3 concurrent requests

  const map = {};
  for (const j of jobs) {
    if (existsSync(join(OUT_DIR, j.file))) map[j.line.key] = `audio/voice/${j.file}`;
    else if (old[j.line.key] && existsSync(join(ROOT, 'public', old[j.line.key]))) map[j.line.key] = old[j.line.key]; // stale take beats silence
  }
  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MAP_FILE, JSON.stringify(sorted, null, 2) + '\n');

  // Loudness pass over every clip; lossless and idempotent, so TARGET_LUFS
  // can change without re-recording anything.
  const used = new Set(Object.values(map).map((p) => p.split('/').pop()));
  const levels = [];
  for (const f of used) {
    const path = join(OUT_DIR, f);
    const mp3 = readFileSync(path);
    const a = analyse(mp3);
    const steps = gainSteps(a);
    if (steps) writeFileSync(path, mp3Gain(mp3, steps));
    levels.push(a.lufs + steps * 1.5);
  }
  levels.sort((a, b) => a - b);
  const near = levels.filter((l) => Math.abs(l - TARGET_LUFS) <= 0.75).length;
  if (levels.length) console.log(`loudness: ${near}/${levels.length} clips within 0.75 dB of ${TARGET_LUFS} LUFS · range ${levels[0].toFixed(1)} … ${levels.at(-1).toFixed(1)} · median ${levels[levels.length >> 1].toFixed(1)}`);

  if (!args.keep && !only && !failed.length) {
    for (const f of readdirSync(OUT_DIR)) if (f.endsWith('.mp3') && !used.has(f)) unlinkSync(join(OUT_DIR, f));
  }
  const bytes = readdirSync(OUT_DIR).reduce((s, f) => s + statSync(join(OUT_DIR, f)).size, 0);
  console.log(`\nvoices.json: ${Object.keys(map).length}/${lines.length} lines voiced · ${todo.length - failed.length} recorded now · ${credits} credits · public/audio/voice ${(bytes / 1e6).toFixed(2)} MB`);
  if (failed.length || unknown.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Corporate TLS proxies sign with a root CA that only the OS store has.
  if (!process.execArgv.includes('--use-system-ca')) {
    const r = spawnSync(process.execPath, ['--use-system-ca', ...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  }
  await main();
}
