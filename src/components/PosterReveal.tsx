import { useState, useRef, useEffect } from 'react';
import { PosterCanvas } from './PosterCanvas';
import { DownloadButton } from './DownloadButton';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import type { PosterPhase } from '@/types';

interface PosterRevealProps {
  state: PosterPhase;
  onRegenerate: () => void;
}

export function PosterReveal({ state, onRegenerate }: PosterRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    if (state.phase === 'settled' && canvasReady) {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [state.phase, canvasReady]);

  if (state.phase === 'idle') return null;

  return (
    <div ref={containerRef} className="w-full max-w-xl mx-auto mt-breathe space-y-4">
      {state.phase === 'loading' && (
        <div className="text-center py-12">
          <p className="font-serif italic text-body-lg text-ink-soft animate-pulse-opacity">
            {state.phrase}
          </p>
        </div>
      )}

      {state.phase === 'settled' && (
        <div className="space-y-4">
          <PosterCanvas
            line1={state.line1}
            line2={state.line2}
            photoId={state.photoId}
            onReady={() => setCanvasReady(true)}
          />
          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={onRegenerate}>
              <RefreshCw className="w-4 h-4" />
              Regenerate
            </Button>
            <DownloadButton />
          </div>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="text-center py-12 space-y-4">
          <p className="font-serif italic text-body text-feedback-quiet">{state.message}</p>
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
