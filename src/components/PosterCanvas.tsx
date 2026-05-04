import { useRef, useEffect, useState } from 'react';
import { composite, loadImage, setupCanvas, checkFit } from '@/lib/compositor';
import { getPhotoUrl, getPhotoById } from '@/lib/photos';
import { ensureFontsReady } from '@/lib/fonts';

interface PosterCanvasProps {
  line1: string;
  line2: string;
  photoId: string;
  onFitFailure?: () => void;
  onReady?: () => void;
}

export function PosterCanvas({ line1, line2, photoId, onFitFailure, onReady }: PosterCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [displaySize, setDisplaySize] = useState(360);

  useEffect(() => {
    function updateSize() {
      const w = window.innerWidth;
      if (w < 640) setDisplaySize(Math.min(w - 32, 360));
      else if (w < 1024) setDisplaySize(480);
      else setDisplaySize(540);
    }
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const photo = getPhotoById(photoId);
        if (!photo) return;

        await ensureFontsReady();
        const img = await loadImage(getPhotoUrl(photoId));
        if (cancelled) return;

        const fit = await checkFit(line1, line2, photo);
        if (!fit.ok) {
          onFitFailure?.();
          return;
        }

        setupCanvas(canvas, displaySize);
        composite({ canvas, img, photo, line1, line2, scale: fit.scale });
        onReady?.();
      } catch (err) {
        // Network failure on the photo URL or a canvas-context exception would
        // otherwise become an unhandled promise rejection (the user would just
        // see a blank canvas hang). Treat any failure during setup as a fit
        // failure so the caller routes back to idle and the user can retry.
        if (cancelled) return;
        console.error(JSON.stringify({ event: 'poster_render_failed', error: String(err) }));
        onFitFailure?.();
      }
    })();

    return () => { cancelled = true; };
  }, [line1, line2, photoId, displaySize]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Poster reading: ${line1}. ${line2}`}
      className="rounded-xl shadow-lg mx-auto block"
      style={{ width: displaySize, height: displaySize }}
    />
  );
}
