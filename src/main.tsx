import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/400-italic.css';

import '@/styles/globals.css';

import App from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { initAnalytics } from '@/lib/analytics';
import { ensureFontsReady } from '@/lib/fonts';

initAnalytics();
ensureFontsReady();

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
