import { useState, useCallback, lazy, Suspense } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { HeroExamples } from '@/components/HeroExamples';
import { PromptInput } from '@/components/PromptInput';
import { PresetButtons } from '@/components/PresetButtons';
import { GenerateButton } from '@/components/GenerateButton';
import { PosterReveal } from '@/components/PosterReveal';
import { callGenerate } from '@/lib/api';
import { track } from '@/lib/analytics';
import { loadingPhrases } from '@/content/copy';
import type { PosterPhase, Hotline } from '@/types';

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
    if (!canGenerate) return;
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

    const elapsed = performance.now() - startedAt;
    const remaining = Math.max(0, LOAD_FLOOR_MS - elapsed);
    if (remaining > 0) await sleep(remaining);

    if (result.status === 'ok') {
      track('generation_completed', { fittingRung: result.fittingRung });
      setExcludePhotoIds((prev) => [...prev, result.photoId]);
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
  }, [prompt, excludePhotoIds, canGenerate, selectedPreset]);

  function handleRegenerate() {
    handleGenerate();
    track('regenerate_clicked', { regenDepth: excludePhotoIds.length });
  }

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
            <p className="text-caption text-feedback-quiet italic">{inlineError}</p>
          )}
        </div>

        <PosterReveal
          state={posterState}
          onRegenerate={handleRegenerate}
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
