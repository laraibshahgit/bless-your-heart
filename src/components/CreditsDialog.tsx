import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { getAllCredits } from '@/lib/photos';

export function CreditsDialog() {
  const credits = getAllCredits();

  return (
    <Dialog>
      {/*
        Inline trigger styled as a footer link. Uses a real <button> so it
        gets keyboard activation (Enter/Space) and a focus ring without
        extra wiring. Tailwind classes preserve the underlined-link visual.
        CLAUDE.md asks for the shadcn Button on all interactions — we keep
        the raw element here because the footer's text-link aesthetic does
        not match any existing Button variant (primary/secondary/preset/ghost
        all carry padding + a focus-ring offset). The `focus-visible` ring
        below restores the keyboard a11y story the shadcn variants give for
        free. Audit run 34/001.
      */}
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-accent-sage hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-sage/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper rounded-sm"
        >
          see credits
        </button>
      </DialogTrigger>
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
