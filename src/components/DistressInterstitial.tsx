import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Hotline } from '@/types';
import { track } from '@/lib/analytics';

interface DistressInterstitialProps {
  open: boolean;
  hotline: Hotline;
  onClose: () => void;
}

// Defense-in-depth: hotline.phone is server-controlled today, but if a future
// contributor adds a value with a non-dial-pad character (e.g. ";javascript:")
// it should not become an executable href. Strip whitespace then verify only
// dial-pad characters remain before constructing the tel: URL.
function safeTelHref(rawPhone: string): string | null {
  const stripped = rawPhone.replace(/\s/g, '');
  return /^[+\d()\-]+$/.test(stripped) ? `tel:${stripped}` : null;
}

// HTTPS-only hotline URL allowlist; renders findahelpline.com if the configured
// URL is missing or not https:. Plain http: is rejected so a downgrade attack
// (or a future hotline entry with http://) never produces a non-TLS link from
// a TLS-served interstitial.
function safeHotlineHref(rawUrl: string | undefined): string {
  if (!rawUrl) return 'https://findahelpline.com';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    /* fall through */
  }
  return 'https://findahelpline.com';
}

export function DistressInterstitial({ open, hotline, onClose }: DistressInterstitialProps) {
  function handleClose() {
    track('distress_dismissed');
    onClose();
  }

  const telHref = hotline.phone ? safeTelHref(hotline.phone) : null;
  const hotlineUrl = safeHotlineHref(hotline.url);

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
        {hotline.phone && telHref && (
          <p className="font-serif text-body-lg font-medium text-ink-deep">
            <a href={telHref} className="hover:text-accent-sage">
              {hotline.name}: {hotline.phone}
            </a>
          </p>
        )}
        <p className="font-serif text-body text-ink-soft italic">
          Or visit{' '}
          <a
            href={hotlineUrl}
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
