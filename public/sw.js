// Offline support for the installed PWA.
//
// Every file in the build is precached on install, so the whole game works with
// no connection. Same-origin requests are served cache-first; everything else
// (the Apple Music previews on audio-ssl.itunes.apple.com, artwork on
// mzstatic.com) is left to the network.
//
// VERSION and ASSETS are filled in at build time by tools/build-sw.mjs. A new
// build changes VERSION, which installs a fresh cache and drops the old one.

const VERSION = 'dev';
const ASSETS = [];

const CACHE = `wesliz-${VERSION}`;
const SCOPE = new URL('./', self.location).href;
const INDEX = new URL('./index.html', SCOPE).href;

// No skipWaiting(): a game that is already running keeps the version whose
// lazily loaded chunks it expects, and the update takes over on the next launch.
self.addEventListener('install', (event) => {
  // cache: 'reload' skips the HTTP cache so a fresh deploy never mixes in stale files.
  const requests = ASSETS.map((path) => new Request(new URL(path, SCOPE), { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('wesliz-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Network-only for anything cross-origin (song previews, artwork).
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Any page in scope (including ?play=l1 test links) is the single-page app.
    event.respondWith(fromCache(INDEX).then((hit) => hit || fetch(request)));
    return;
  }
  event.respondWith(cacheFirst(request));
});

async function fromCache(key) {
  const cache = await caches.open(CACHE);
  // ignoreVary: dev/preview servers send Vary: Origin, which would make module
  // scripts and crossorigin font requests miss the precache.
  return cache.match(key, { ignoreSearch: true, ignoreVary: true });
}

async function cacheFirst(request) {
  const hit = await fromCache(request);
  if (hit) return request.headers.has('range') ? sliceRange(request, hit) : hit;
  const res = await fetch(request);
  if (res.status === 200 && res.type === 'basic') {
    const copy = res.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return res;
}

// Safari asks for media in byte ranges and refuses a plain 200 from a service
// worker, so answer range requests for cached audio with a 206 slice.
async function sliceRange(request, response) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (!m) return response;
  const body = await response.arrayBuffer();
  const size = body.byteLength;
  let start = m[1] ? Number(m[1]) : size - Number(m[2]);
  let end = m[1] && m[2] ? Number(m[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  if (start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  });
}
