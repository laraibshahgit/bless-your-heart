import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Latin-only subset. The all-subsets entry (400.css) ships @font-face
// declarations for Cyrillic, Cyrillic-ext, Latin-ext, and Vietnamese — none
// of which this app uses (UI is English-only, Anthropic system prompts
// constrain the output language, and the user prompt input renders in the
// same family with a Georgia fallback for anything outside Latin-1). The
// `latin` subset (U+0000-00FF + a few punctuation/symbol blocks) covers
// English plus virtually all Western-European accented characters — café,
// naïve, résumé, etc. — and falls back to Georgia for anything outside
// that range, which is the same fallback path we already rely on for
// glyphs the font lacks. The all-subsets entry would otherwise pin
// ~24 unused woff/woff2 files into dist/assets and bloat the CSS with
// @font-face blocks the browser will never satisfy. Audit run 34/001.
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';

import '@/styles/globals.css';

import App from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { initAnalytics } from '@/lib/analytics';
import { ensureFontsReady } from '@/lib/fonts';

// Both calls are fire-and-forget. `initAnalytics` returns a Promise post
// audit-37/001 (deferred PostHog SDK load via requestIdleCallback so it
// doesn't block first paint), and `ensureFontsReady` returns the cached
// document.fonts.load promise. Neither is awaited here because nothing
// downstream of this point depends on either resolving — React mounts
// immediately and the per-component consumers of fonts (PosterCanvas) and
// analytics (App.tsx, etc.) check readiness themselves.
void initAnalytics();
void ensureFontsReady();

// Defensive: if `<div id="root">` is ever missing from index.html (template
// regression), throw a descriptive error instead of letting the `!`-suppressed
// null cause a generic "Cannot read property of null" deep inside React.
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
