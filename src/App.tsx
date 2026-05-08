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
  const seenCuratedRef = useRef(new Map<string, number[]>());

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

      const curatedKey = prompt.trim().toLowerCase();
      const curatedExcludes = seenCuratedRef.current.get(curatedKey) ?? [];
      const result = await callGenerate(prompt.trim(), excludePhotoIds, curatedExcludes);

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

      // Curated outputs are pre-approved memory lookups — skip the
      // anticipation beat so they display instantly (<200ms total).
      const isCurated = result.status === 'ok' && result.curatedIndex !== undefined;
      if (!isCurated) {
        const elapsed = performance.now() - startedAt;
        const remaining = Math.max(0, LOAD_FLOOR_MS - elapsed);
        if (remaining > 0) await sleep(remaining);
      }

      // Re-check after the LOAD_FLOOR_MS sleep — the user could have
      // triggered a new generation during the anticipation beat.
      if (myGenerationId !== generationIdRef.current) return;

      if (result.status === 'ok') {
        track('generation_completed', { fittingRung: result.fittingRung });
        if (result.curatedIndex !== undefined) {
          const seen = seenCuratedRef.current.get(curatedKey) ?? [];
          seenCuratedRef.current.set(curatedKey, [...seen, result.curatedIndex]);
        }
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
    <div className="bg-lavender flex flex-col">
      {/* Sky hero section — photo fades into lavender */}
      <section
        className="relative bg-cover bg-top"
        style={{ backgroundImage: "url('/hero-sky.jpg')" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.12) 35%, rgba(240,237,246,0.15) 58%, rgba(240,237,246,0.7) 80%, #F0EDF6 100%)',
          }}
        />
        <div className="relative z-10">
          <Header />
          <div className="text-center px-4 pt-4 pb-16 lg:pb-20 space-y-8 max-w-2xl mx-auto">
            <h1 className="font-serif text-display lg:text-display-lg italic text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)] [text-shadow:0_2px_16px_rgba(0,0,0,0.6),0_0_50px_rgba(0,0,0,0.3)]">
              Tell me about your day
            </h1>
            <p className="font-serif text-lg lg:text-xl text-white max-w-lg mx-auto leading-relaxed [text-shadow:0_2px_12px_rgba(0,0,0,0.7),0_0_40px_rgba(0,0,0,0.4)]">
              Affirmation posters for people who hate affirmations.
              <br />
              Type your situation, get a savagely honest poster. Download, share, heal. Somehow.
            </p>
            <HeroExamples />
          </div>
        </div>
      </section>

      <main className="px-4 pt-4 pb-4">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
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
            <p role="alert" className="text-caption text-ink-faint italic">{inlineError}</p>
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
