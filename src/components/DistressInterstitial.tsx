import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Hotline } from '@/types';
import { track } from '@/lib/analytics';

interface DistressInterstitialProps {
  open: boolean;
  hotline: Hotline;
  onClose: () => void;
}

export function DistressInterstitial({ open, hotline, onClose }: DistressInterstitialProps) {
  function handleClose() {
    track('distress_dismissed');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        className="bg-paper border-border-mist max-w-md text-center space-y-4"
        aria-modal="true"
      >
        <p className="font-serif text-headline italic text-ink-deep">
          This one isn't for jokes.
        </p>
        <p className="font-serif text-body text-ink-soft italic">
          If you're going through something serious, please talk to someone who can actually help. You're not alone in it.
        </p>
        {hotline.phone && (
          <p className="font-serif text-body-lg font-medium text-ink-deep">
            <a href={`tel:${hotline.phone.replace(/\s/g, '')}`} className="hover:text-accent-sage">
              {hotline.name}: {hotline.phone}
            </a>
          </p>
        )}
        <p className="font-serif text-body text-ink-soft italic">
          Or visit{' '}
          <a
            href={hotline.url ?? 'https://findahelpline.com'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-sage underline"
          >
            findahelpline.com
          </a>{' '}
          for support anywhere in the world.
        </p>
        <Button variant="secondary" onClick={handleClose}>
          Take me back
        </Button>
      </DialogContent>
    </Dialog>
  );
}
