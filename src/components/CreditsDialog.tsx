import { lazy, Suspense, useState, useRef, useCallback } from 'react';

// Lazy-load the Dialog body so the Radix Dialog primitive doesn't ship in
// the critical-path bundle. The trigger button below renders synchronously
// on first paint; the dialog content (and the ~15 KB-gzip radix chunk) is
// fetched only when the user hovers, focuses, or clicks the link. Audit
// run 37/001.
const CreditsDialogContentLazy = lazy(() =>
  import('@/components/CreditsDialogContent').then((m) => ({ default: m.CreditsDialogContent }))
);

export function CreditsDialog() {
  const [open, setOpen] = useState(false);
  // `mounted` controls whether the lazy chunk is requested. Once true, we
  // never flip it back — the chunk stays in memory after the user closes
  // the dialog so reopening is instant. Memory cost is negligible (the
  // module is already in the JS heap).
  const [mounted, setMounted] = useState(false);
  // Hover/focus prefetch. We don't want to call setMounted on every pointer
  // event (re-renders), so we track `prefetched` in a ref and call lazy's
  // import directly via the trigger function we capture below.
  const prefetchedRef = useRef(false);

  const prefetch = useCallback(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    // Fire-and-forget the import. React.lazy's preload pattern: calling
    // the underlying import() warms the chunk cache so the subsequent
    // mount finds it ready and Suspense doesn't show its fallback. The
    // catch swallows network failures because the click path will retry.
    void import('@/components/CreditsDialogContent').catch(() => {
      prefetchedRef.current = false;
    });
  }, []);

  const handleClick = useCallback(() => {
    setMounted(true);
    setOpen(true);
  }, []);

  return (
    <>
      <button
        type="button"
        // Hover/focus prefetch — typical desktop hover-to-click latency is
        // 150–600 ms; that's enough for the radix chunk to arrive over the
        // wire before the click lands. On touch devices `onPointerEnter`
        // also fires on tap-down (before tap-up), which still gives the
        // network ~50–150 ms head start vs waiting for the click event.
        onPointerEnter={prefetch}
        onFocus={prefetch}
        onClick={handleClick}
        className="text-accent-sage hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-sage/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper rounded-sm"
      >
        see credits
      </button>
      {/*
        `mounted` gates the lazy import: until first interaction, this whole
        subtree returns null and Vite/Rollup keeps the radix chunk out of
        the critical path. Suspense fallback={null} mirrors the
        DistressInterstitial pattern — the dialog opens with a brief
        invisible window if the chunk is still in flight, but with hover/
        focus prefetch the chunk is almost always ready by the time the
        user actually clicks.
      */}
      {mounted && (
        <Suspense fallback={null}>
          <CreditsDialogContentLazy open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}
