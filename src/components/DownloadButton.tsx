import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { downloadPoster, isIOSSafari } from '@/lib/download';
import { downloadConfirmation, errorCopy } from '@/content/copy';
import { track } from '@/lib/analytics';

export function DownloadButton() {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'confirmed' | 'error'>('idle');
  const [showIOSHint, setShowIOSHint] = useState(false);

  async function handleDownload() {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    setStatus('downloading');

    if (isIOSSafari()) {
      setShowIOSHint(true);
    }

    const success = await downloadPoster(canvas);

    if (success) {
      track('poster_downloaded');
      if (!isIOSSafari()) {
        setStatus('confirmed');
        setTimeout(() => setStatus('idle'), 2500);
      } else {
        setStatus('idle');
      }
    } else {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
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
          On iPhone? Long-press the image after the new tab opens to save.
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
