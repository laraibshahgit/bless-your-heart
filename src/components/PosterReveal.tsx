import { useState, useRef, useEffect } from 'react';
import { PosterCanvas } from './PosterCanvas';
import { DownloadButton } from './DownloadButton';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import type { PosterPhase } from '@/types';

interface PosterRevealProps {
  state: PosterPhase;
  onRegenerate: () => void;
  // Fired when the canvas pipeline cannot produce a poster after the API
  // already returned `ok` — image fetch timeout, decode failure, or a fit
  // miss. Without this, the UI strands in `settled` with a blank canvas.
  onCanvasFailure?: () => void;
}

export function PosterReveal({ state, onRegenerate, onCanvasFailure }: PosterRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  // Reset canvasReady when leaving `settled`. Without this, regenerating from a
  // settled poster leaves canvasReady=true across the brief loading phase, and
  // the moment the new poster's `settled` lands the scroll effect fires *before*
  // PosterCanvas has finished its async draw pipeline (font load → image fetch →
  // checkFit → composite, ~100–1000ms). The user gets scrolled to a freshly-
  // mounted blank canvas, then watches it fill in. The fresh-mount draw still
  // calls onReady on completion, but by then the scroll has already fired
  // against stale state. Audit run 36/001.
  useEffect(() => {
    if (state.phase !== 'settled') {
      setCanvasReady(false);
    }
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === 'settled' && canvasReady) {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [state.phase, canvasReady]);

  if (state.phase === 'idle') return null;

  return (
    <div ref={containerRef} className="w-full max-w-xl mx-auto mt-breathe space-y-4">
      {state.phase === 'loading' && (
        // Reserve the eventual poster's footprint during the anticipation
        // beat so the layout doesn't jump 360–540 px when `settled` lands
        // and PosterCanvas mounts. Width tracks PosterCanvas's
        // `computeSize()` breakpoints exactly: <640 → min(viewport-32,
        // 360), 640–1023 → 480, ≥1024 → 540. `aspect-square` makes the
        // height follow the width. The loading phrase centers inside the
        // reserved square so the user's eye anchors where the poster
        // will land. Audit run 37/001.
        <div className="mx-auto aspect-square w-[min(calc(100vw-2rem),360px)] sm:w-[480px] lg:w-[540px] flex items-center justify-center text-center">
          {/*
            role="status" + aria-live="polite" makes screen readers announce
            the rotating loading phrase when it appears, without interrupting
            whatever the user was hearing. Without it, the loading state is
            silent for non-sighted users — they hear nothing between clicking
            Generate and the canvas being announced. Audit run 34/001.
          */}
          <p
            role="status"
            aria-live="polite"
            className="font-serif italic text-body-lg text-ink-soft animate-pulse-opacity px-4"
          >
            {state.phrase}
          </p>
        </div>
      )}

      {state.phase === 'settled' && (
        <div className="space-y-4 animate-in fade-in duration-reveal">
          <PosterCanvas
            line1={state.line1}
            line2={state.line2}
            photoId={state.photoId}
            onReady={() => setCanvasReady(true)}
            onFitFailure={onCanvasFailure}
          />
          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={onRegenerate}>
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Regenerate
            </Button>
            <DownloadButton />
          </div>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="text-center py-12 space-y-4">
          {/*
            role="alert" gives the error announcement priority over any
            in-flight live-region updates (a screen reader will interrupt
            and read the error). Mirrors the loading branch above. Audit
            run 34/001.
          */}
          <p role="alert" className="font-serif italic text-body text-feedback-quiet">
            {state.message}
          </p>
          {state.retryable && (
            <Button variant="secondary" onClick={onRegenerate}>
              Try Again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
