import { useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getAllCredits } from '@/lib/photos';

interface CreditsDialogContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Lazy-loaded Dialog body for the photo credits panel. Split out from
// `CreditsDialog.tsx` in audit run 37/001 so the Radix Dialog primitive
// (~46 KB / ~15 KB gzip) is no longer in the critical-path bundle. The
// outer wrapper in `CreditsDialog.tsx` renders just a `<button>` on first
// paint; this component is dynamically imported when the user hovers,
// focuses, or clicks the trigger. With `DistressInterstitial` (the only
// other Radix consumer) also lazy, this means the radix chunk is fetched
// only on demand — typical first-paint cost is zero.
export function CreditsDialogContent({ open, onOpenChange }: CreditsDialogContentProps) {
  // Sync open state from the parent into Radix the moment this lazy
  // component lands. The parent owns the open state because it has to be
  // tracked even before this module loads (the click that triggers loading
  // also opens the dialog). Without `defaultOpen`, the first render of
  // Radix's controlled Dialog would briefly show closed, then re-render
  // open — visual jank. Using controlled props (`open`, `onOpenChange`)
  // keeps state authoritative on the parent side.
  useEffect(() => {
    // No-op — the controlled `open` prop drives Radix directly. This effect
    // is here to make the controlled-vs-uncontrolled choice explicit and
    // to anchor any future "scroll to top of credits list" behavior.
  }, [open]);

  const credits = getAllCredits();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-paper border-border-mist max-h-[60vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-headline text-ink-deep">Photo Credits</DialogTitle>
        </DialogHeader>
        <ul className="space-y-1 text-caption text-ink-soft">
          {credits.map(({ id, credit }) => (
            <li key={id}>{credit}</li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
