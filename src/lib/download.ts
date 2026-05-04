import { saveAs } from 'file-saver';

function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iP(ad|hone|od)/.test(navigator.userAgent) &&
    /Safari/.test(navigator.userAgent) &&
    !/CriOS|FxiOS/.test(navigator.userAgent)
  );
}

export async function downloadPoster(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );

    if (!blob) return false;

    const filename = `bless-your-heart-${shortId()}.png`;
    saveAs(blob, filename);
    return true;
  } catch (err) {
    console.error(JSON.stringify({ event: 'download_failed', error: String(err) }));
    return false;
  }
}
