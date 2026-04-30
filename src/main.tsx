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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
