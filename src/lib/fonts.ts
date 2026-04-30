let fontsReadyPromise: Promise<void> | null = null;

export function ensureFontsReady(): Promise<void> {
  if (fontsReadyPromise) return fontsReadyPromise;

  fontsReadyPromise = (async () => {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('500 64px "Cormorant Garamond"'),
      document.fonts.load('italic 400 44px "Cormorant Garamond"'),
      document.fonts.load('400 18px "Cormorant Garamond"'),
    ]);
  })();

  return fontsReadyPromise;
}
