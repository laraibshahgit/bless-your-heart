import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/.netlify/functions': 'http://localhost:8888',
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        // Vendor chunk split — keeps the React + Radix + Lucide payload in
        // its own content-hashed chunk so app-only deploys don't bust the
        // vendor cache. On a second visit after an app deploy, returning
        // users only re-download the small app chunk; the vendor chunk
        // serves from disk/HTTP cache. Audit run 37/001.
        //
        // Splitting choices:
        //  - `react-vendor`: React + React DOM. Largest single dep (~135 KB
        //    ungzip), most stable across deploys, must hydrate before any
        //    paint. Worth its own chunk so version bumps invalidate only it.
        //  - `radix`: @radix-ui/react-dialog and @radix-ui/react-slot. Only
        //    used by DistressInterstitial (lazy) and CreditsDialog (lazy
        //    post-37/001). With both consumers lazy, this chunk should
        //    naturally be loaded only when needed; manualChunks here just
        //    pins the chunk identity so cross-consumer cache hits work.
        //  - `posthog-js` is already its own chunk by virtue of the
        //    dynamic import in `src/lib/analytics.ts` — no manual entry
        //    needed.
        //
        // We DON'T pre-split lucide-react: it's ~3 icons used (tree-shaken
        // to a few KB). A dedicated chunk would add HTTP overhead for less
        // than its own gzip win.
        // Function form: rolldown requires a callback, not the legacy
        // object shape. Returning a chunk name routes the module into that
        // chunk; returning undefined falls through to default chunking.
        manualChunks(id: string): string | undefined {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/@radix-ui/')) {
            return 'radix';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
