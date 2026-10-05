// Resolve 30-second Apple Music previews for every song in the story data.
// Writes src/data/previews.json. Re-run if a preview URL ever goes stale.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/data/story.ts', import.meta.url), 'utf8');
const re = /(\w+): \{ id: '(\w+)', title: (['"])(.*?)\3, artist: (['"])(.*?)\5, search: (['"])(.*?)\7/g;
const songs = [...src.matchAll(re)].map((m) => ({ id: m[2], title: m[4], artist: m[6], search: m[8] }));
const out = {};
for (const s of songs) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(s.search)}&entity=song&limit=10&country=US`;
  const data = await (await fetch(url)).json();
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = norm(s.title.replace(/\(.*?\)/g, ''));
  const hit =
    data.results.find((r) => norm(r.trackName).startsWith(want) && norm(r.artistName).includes(norm(s.artist).slice(0, 5))) ??
    data.results.find((r) => norm(r.trackName).includes(want)) ??
    data.results[0];
  if (!hit) {
    console.log('MISS', s.id);
    continue;
  }
  out[s.id] = {
    previewUrl: hit.previewUrl,
    trackViewUrl: hit.trackViewUrl,
    matched: `${hit.trackName} — ${hit.artistName}`,
  };
  console.log(s.id.padEnd(22), '→', out[s.id].matched);
  await new Promise((r) => setTimeout(r, 350));
}
writeFileSync(new URL('../src/data/previews.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(Object.keys(out).length, 'of', songs.length, 'resolved');
