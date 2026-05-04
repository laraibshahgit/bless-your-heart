import { LINE1_FONT_PX, LINE2_FONT_PX, WATERMARK_FONT_PX } from './poster-layout';

let fontsReadyPromise: Promise<void> | null = null;

export function ensureFontsReady(): Promise<void> {
  if (fontsReadyPromise) return fontsReadyPromise;

  fontsReadyPromise = (async () => {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load(`500 ${LINE1_FONT_PX}px "Cormorant Garamond"`),
      document.fonts.load(`italic 400 ${LINE2_FONT_PX}px "Cormorant Garamond"`),
      document.fonts.load(`400 ${WATERMARK_FONT_PX}px "Cormorant Garamond"`),
    ]);
  })();

  return fontsReadyPromise;
}
