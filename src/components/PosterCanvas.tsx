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
    function computeSize(): number {
      const w = window.innerWidth;
      if (w < 640) return Math.min(w - 32, 360);
      if (w < 1024) return 480;
      return 540;
    }
    setDisplaySize(computeSize());

    // rAF-throttle the resize handler: native `resize` fires per frame during
    // window drags (60+/sec on desktop). Without throttling, every fire would
    // setState → re-render PosterCanvas → re-execute the render-effect →
    // re-decode + redraw the photo. Coalescing to one update per animation
    // frame keeps the canvas redraw work bounded by the display refresh rate.
    let frame = 0;
    function onResize() {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setDisplaySize(computeSize());
      });
    }
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
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
        if (cancelled) return;
        const img = await loadImage(getPhotoUrl(photoId));
        if (cancelled) return;

        const fit = await checkFit(line1, line2, photo);
        // The Regenerate button is reachable from `settled` phase before the
        // canvas actually finishes drawing — a fast click can unmount this
        // effect mid-checkFit. Without this guard, a stale `!fit.ok` branch
        // would call onFitFailure and overwrite App's freshly-set `loading`
        // posterState with `error`, flashing a stale error over the new
        // generation. Mirrors the existing post-loadImage cancelled check.
        if (cancelled) return;
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
