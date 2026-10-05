import { defineConfig } from 'vite';
import { precacheServiceWorker } from './tools/build-sw.mjs';

export default defineConfig({
  base: './',
  plugins: [precacheServiceWorker()],
  build: {
    target: ['es2022', 'safari16'],
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    host: true,
    // Generated output (cap sync, art/audio pipelines) must not reload open pages.
    watch: { ignored: ['**/ios/**', '**/art-src/**', '**/dist/**', '**/docs/**', '**/tools/**'] },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
