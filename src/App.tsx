import { useState, useCallback, useRef, lazy, Suspense } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { HeroExamples } from '@/components/HeroExamples';
import { PromptInput } from '@/components/PromptInput';
import { PresetButtons } from '@/components/PresetButtons';
import { GenerateButton } from '@/components/GenerateButton';
import { PosterReveal } from '@/components/PosterReveal';
import { callGenerate } from '@/lib/api';
import { prefetchPhoto } from '@/lib/photos';
import { track } from '@/lib/analytics';
import { errorCopy, loadingPhrases } from '@/content/copy';
import { MAX_EXCLUDE_PHOTO_IDS, type PosterPhase, type Hotline } from '@/types';

const DistressInterstitial = lazy(() =>
  import('@/components/DistressInterstitial').then((m) => ({ default: m.DistressInterstitial }))
);

const LOAD_FLOOR_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pickLoadingPhrase(): string {
  return loadingPhrases[Math.floor(Math.random() * loadingPhrases.length)];
}

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [posterState, setPosterState] = useState<PosterPhase>({ phase: 'idle' });
  const [excludePhotoIds, setExcludePhotoIds] = useState<string[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [distressData, setDistressData] = useState<{ open: boolean; hotline: Hotline | null }>({
    open: false,
    hotline: null,
  });
  const [loading, setLoading] = useState(false);

  // Concurrency guards for handleGenerate — see audit run 29/001.
  //
  // `inFlightRef` is the synchronous mutex that the state-derived `canGenerate`
  // check is not. `<GenerateButton type="submit">` lives inside a `<form
  // onSubmit>`: clicking the button fires React's onClick AND the browser's
  // submit event in the same tick, both invoking handleGenerate. The closure
  // captures `canGenerate` at render time, so until the next render lands the
  // freshly-set `loading=true`, both invocations see `canGenerate=true`, both
  // pass the guard, and both fire `callGenerate` — doubling Anthropic spend
  // and overwriting state when the responses arrive in arbitrary order. A ref
  // is the standard React primitive for this: the assignment is synchronous
  // (unlike `setLoading`), so the second invocation in the same tick sees the
  // mutated value and bails. Cleared in `finally` so an exception thrown
  // out of the callGenerate path (or any future code in the handler body)
  // doesn't permanently jam the button.
  //
  // `generationIdRef` is defense in depth for stale-response overwrites. Even
  // with the in-flight mutex, a future entry path that bypasses the mutex (or
  // a refactor that reorders the assignment) would still let an older response
  // overwrite a newer one — the response handler trusts whatever resolves
  // last. Tagging each fire with an incrementing id and discarding any
  // response whose id is no longer current is the canonical fix for "old
  // request finishes after new request" races. Cheap (one ref, two checks),
  // mirrors the `cancelled`-flag pattern used in PosterCanvas image-load
  // (audit run 28/001).
  const inFlightRef = useRef(false);
  const generationIdRef = useRef(0);

  const isGenerating = loading;
  const canGenerate = prompt.trim().length > 0 && !isGenerating;

  function handlePresetSelect(preset: string) {
    setSelectedPreset(preset);
    setPrompt(preset);
    setInlineError(null);
  }

  function handlePromptChange(value: string) {
    setPrompt(value);
    if (selectedPreset && value !== selectedPreset) {
      setSelectedPreset(null);
    }
    setInlineError(null);
  }

  const handleGenerate = useCallback(async () => {
    // Synchronous re-entry guard — see comment on inFlightRef declaration.
    // Sits BEFORE the canGenerate check because canGenerate is state-derived
    // and lags by one render behind the in-flight assignment.
    if (inFlightRef.current) return;
    if (!canGenerate) return;
    inFlightRef.current = true;
    const myGenerationId = ++generationIdRef.current;

    try {
      setLoading(true);
      setInlineError(null);
      const phrase = pickLoadingPhrase();
      setPosterState({ phase: 'loading', phrase });

      const source = selectedPreset
        ? (prompt === selectedPreset ? 'preset' : 'edited_preset')
        : 'freeform';
      track('prompt_submitted', { source, length: prompt.length });

      const startedAt = performance.now();

      const result = await callGenerate(prompt.trim(), excludePhotoIds);

      // Stale-response guard — if a later generation has been started, drop
      // this response on the floor. Without it, an old request that arrives
      // after a new one has been issued would overwrite the newer poster.
      if (myGenerationId !== generationIdRef.current) return;

      if (result.status === 'distress') {
        setLoading(false);
        setPosterState((prev) => prev.phase === 'loading' ? { phase: 'idle' } : prev);
        track('generation_distress');
        setDistressData({ open: true, hotline: result.hotline });
        return;
      }

      if (result.status === 'blocked') {
        setLoading(false);
        setPosterState((prev) => prev.phase === 'loading' ? { phase: 'idle' } : prev);
        track('generation_blocked', { reason: result.message.includes('people') ? 'real_person' : 'slur' });
        setInlineError(result.message);
        return;
      }

      if (result.status === 'rate_limited') {
        setLoading(false);
        setPosterState((prev) => prev.phase === 'loading' ? { phase: 'idle' } : prev);
        track('generation_rate_limited');
        setInlineError(result.message);
        return;
      }

      // Fire-and-forget photo prefetch BEFORE the LOAD_FLOOR_MS hold so the
      // photo fetch runs in parallel with the anticipation beat. By the time
      // PosterCanvas mounts (after the hold) and calls loadImage() with the
      // same crossOrigin='anonymous' URL, the browser HTTP cache hits and
      // decode resolves in ~30 ms instead of waiting on a fresh network
      // round trip. Saves roughly 200–2000 ms of perceived blank-canvas
      // time depending on photo size and network. Both `ok` and
      // `safe_fallback` carry a photoId; `distress`/`blocked`/`rate_limited`
      // never reach this branch (they early-returned above). Audit run
      // 37/001.
      if (result.status === 'ok' || result.status === 'safe_fallback') {
        prefetchPhoto(result.photoId);
      }

      const elapsed = performance.now() - startedAt;
      const remaining = Math.max(0, LOAD_FLOOR_MS - elapsed);
      if (remaining > 0) await sleep(remaining);

      // Re-check after the LOAD_FLOOR_MS sleep — the user could have
      // triggered a new generation during the anticipation beat.
      if (myGenerationId !== generationIdRef.current) return;

      if (result.status === 'ok') {
        track('generation_completed', { fittingRung: result.fittingRung });
        // Cap the accumulator at MAX_EXCLUDE_PHOTO_IDS to mirror the server-side
        // Zod bound. Without the slice, a user who regenerates >50 times would
        // start hitting 400 responses (the array would outgrow the contract).
        // Keep the most-recent N entries — matches the "don't repeat the last
        // few photos" intent and is robust against eventual library growth.
        setExcludePhotoIds((prev) => [...prev, result.photoId].slice(-MAX_EXCLUDE_PHOTO_IDS));
        setPosterState({
          phase: 'settled',
          line1: result.line1,
          line2: result.line2,
          photoId: result.photoId,
          fittingRung: result.fittingRung,
        });
      } else if (result.status === 'safe_fallback') {
        track('generation_safe_fallback');
        setPosterState({
          phase: 'settled',
          line1: result.line1,
          line2: result.line2,
          photoId: result.photoId,
          fittingRung: 4,
        });
      } else if (result.status === 'error') {
        track('generation_error', { kind: 'unknown' });
        setPosterState({
          phase: 'error',
          message: result.message,
          retryable: result.retryable,
        });
      }

      setLoading(false);
    } finally {
      // Always release the mutex, even if a synchronous throw escaped above.
      // Without this a thrown exception would permanently jam the button.
      // Only release if WE own it (stale-response early-returns leave the
      // mutex held by whoever incremented generationIdRef most recently).
      if (myGenerationId === generationIdRef.current) {
        inFlightRef.current = false;
      }
    }
  }, [prompt, excludePhotoIds, canGenerate, selectedPreset]);

  function handleRegenerate() {
    handleGenerate();
    track('regenerate_clicked', { regenDepth: excludePhotoIds.length });
  }

  // Fires when the canvas pipeline can't produce a poster despite the API
  // returning `ok` — typically a hung photo CDN (loadImage 15s timeout) or a
  // rare `checkFit` miss. Without this handler the UI sat in `settled` with a
  // blank canvas indefinitely; route to `error` so the user gets the standard
  // retry affordance instead of a silent dead end.
  const handleCanvasFailure = useCallback(() => {
    track('canvas_render_failed');
    setPosterState({
      phase: 'error',
      message: errorCopy.frontend.canvasWriteFailed,
      retryable: true,
    });
  }, []);

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Header />

      <main className="flex-1 px-4 pb-section">
        <div className="text-center space-y-breathe max-w-2xl mx-auto">
          <h1 className="font-serif text-display lg:text-display-lg italic text-ink-deep">
            What's going on?
          </h1>

          <HeroExamples />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleGenerate();
            }}
            className="space-y-4"
          >
            <PromptInput
              value={prompt}
              onChange={handlePromptChange}
              disabled={isGenerating}
            />

            <PresetButtons
              selected={selectedPreset}
              onSelect={handlePresetSelect}
              disabled={isGenerating}
            />

            <GenerateButton
              loading={isGenerating}
              disabled={!canGenerate}
              onClick={handleGenerate}
            />
          </form>

          {inlineError && (
            // role="alert" makes assistive tech announce blocked/rate-limited
            // messages immediately when they appear. Without it, users who
            // submitted via screen reader would silently see no feedback —
            // the form just stops responding. Audit run 34/001.
            <p role="alert" className="text-caption text-feedback-quiet italic">{inlineError}</p>
          )}
        </div>

        <PosterReveal
          state={posterState}
          onRegenerate={handleRegenerate}
          onCanvasFailure={handleCanvasFailure}
        />
      </main>

      <Footer />

      <Suspense fallback={null}>
        {distressData.hotline && (
          <DistressInterstitial
            open={distressData.open}
            hotline={distressData.hotline}
            onClose={() => setDistressData({ open: false, hotline: null })}
          />
        )}
      </Suspense>
    </div>
  );
}
