import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { downloadPoster, isIOSSafari } from '@/lib/download';
import { downloadConfirmation, downloadCopy, errorCopy } from '@/content/copy';
import { track } from '@/lib/analytics';

// Status auto-reset durations. Error stays visible longer than success because
// users need a beat to register what failed; the success confirmation just has
// to register that the file is on its way.
const ERROR_DISPLAY_MS = 3000;
const SUCCESS_DISPLAY_MS = 2500;

export function DownloadButton() {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'confirmed' | 'error'>('idle');
  const [showIOSHint, setShowIOSHint] = useState(false);
  // Track the auto-reset timer so we can clear it on unmount and avoid
  // setStatus on a dropped component (PosterReveal unmounts this whole subtree
  // when the user regenerates from the 'settled' state).
  const resetRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(resetRef.current), []);

  async function handleDownload() {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const onIOSSafari = isIOSSafari();

    clearTimeout(resetRef.current);
    setStatus('downloading');
    if (onIOSSafari) setShowIOSHint(true);

    const success = await downloadPoster(canvas);

    if (!success) {
      setStatus('error');
      resetRef.current = setTimeout(() => setStatus('idle'), ERROR_DISPLAY_MS);
      return;
    }

    track('poster_downloaded');

    if (onIOSSafari) {
      setStatus('idle');
      return;
    }

    setStatus('confirmed');
    resetRef.current = setTimeout(() => setStatus('idle'), SUCCESS_DISPLAY_MS);
  }

  return (
    <div className="text-center">
      <Button
        variant="primary"
        onClick={handleDownload}
        disabled={status === 'downloading'}
      >
        <Download className="w-4 h-4" />
        Download
      </Button>

      {showIOSHint && (
        <p className="mt-2 text-caption text-ink-faint italic">
          {downloadCopy.iosHint}
        </p>
      )}

      {status === 'confirmed' && (
        <p className="mt-2 text-caption text-ink-soft italic animate-in fade-in duration-200">
          {downloadConfirmation}
        </p>
      )}

      {status === 'error' && (
        <p className="mt-2 text-caption text-feedback-quiet italic">
          {errorCopy.frontend.downloadFailed}
        </p>
      )}
    </div>
  );
}
