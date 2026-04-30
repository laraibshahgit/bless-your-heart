import { saveAs } from 'file-saver';

function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function isIOSSafari(): boolean {
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
  } catch {
    return false;
  }
}
