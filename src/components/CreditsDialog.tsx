import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { getAllCredits } from '@/lib/photos';

export function CreditsDialog() {
  const credits = getAllCredits();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-accent-sage hover:underline">see credits</button>
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
