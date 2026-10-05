// Vite plugin: after a production build, fill in dist/sw.js with the list of
// every built file and a content hash, so the service worker precaches the
// whole game and a new deploy replaces the old cache.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const SKIP = /(^|\/)\.|\.map$|^sw\.js$/;

function listFiles(dir, root = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, root);
    return [relative(root, full).split(sep).join('/')];
  });
}

export function precacheServiceWorker() {
  let outDir = 'dist';
  return {
    name: 'precache-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    // writeBundle (not closeBundle) so a failed build never touches dist/sw.js.
    writeBundle: {
      order: 'post',
      handler() {
        const swPath = join(outDir, 'sw.js');
        const files = listFiles(outDir).filter((f) => !SKIP.test(f)).sort();
        const hash = createHash('sha256');
        for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
        const version = hash.digest('hex').slice(0, 12);
        const assets = ['./', ...files];

        const src = readFileSync(swPath, 'utf8');
        const out = src
          .replace("const VERSION = 'dev';", `const VERSION = '${version}';`)
          .replace('const ASSETS = [];', `const ASSETS = ${JSON.stringify(assets, null, 2)};`);
        if (!out.includes(version) || out.includes('const ASSETS = [];')) {
          throw new Error('build-sw: placeholders not found in sw.js');
        }
        writeFileSync(swPath, out);
        console.log(`sw.js: precaching ${assets.length} files, version ${version}`);
      },
    },
  };
}
