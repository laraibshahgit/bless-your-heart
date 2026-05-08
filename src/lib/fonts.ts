import { LINE1_FONT_PX, LINE2_FONT_PX, WATERMARK_FONT_PX } from './poster-layout';

const FONT_SPECS = [
  `700 ${LINE1_FONT_PX}px "Cormorant Garamond"`,
  `italic 600 ${LINE2_FONT_PX}px "Cormorant Garamond"`,
  `400 ${WATERMARK_FONT_PX}px "Cormorant Garamond"`,
] as const;

let fontsReadyPromise: Promise<void> | null = null;
let fontsVerified = false;

export function ensureFontsReady(): Promise<void> {
  if (fontsVerified) return Promise.resolve();
  if (fontsReadyPromise) return fontsReadyPromise;

  fontsReadyPromise = (async () => {
    try {
      await document.fonts.ready;
      const results = await Promise.all(FONT_SPECS.map(s => document.fonts.load(s)));

      if (results.every(faces => faces.length > 0)) {
        fontsVerified = true;
        return;
      }

      // At least one spec resolved with no matching face. Retry once after a
      // short delay — some browsers need a tick between @font-face CSS
      // injection and face availability in the FontFaceSet.
      await new Promise<void>(r => setTimeout(r, 100));
      const retry = await Promise.all(FONT_SPECS.map(s => document.fonts.load(s)));

      if (retry.every(faces => faces.length > 0)) {
        fontsVerified = true;
        return;
      }

      // Fonts still not available. Clear the cached promise so the next call
      // retries (e.g. after network recovers). The compositor will fall back
      // to the system serif, which still produces a readable poster.
      fontsReadyPromise = null;
    } catch (err) {
      // Clear the cached promise so future calls retry instead of
      // permanently returning this rejected promise.
      fontsReadyPromise = null;
      throw err;
    }
  })();

  return fontsReadyPromise;
}
