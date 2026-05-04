import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

interface GenerateButtonProps {
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}

export function GenerateButton({ loading, disabled, onClick }: GenerateButtonProps) {
  // While loading, the button intentionally has no visible text — the
  // anticipation beat lives in the rotating loading phrase under
  // PosterReveal. But an empty button is an a11y black hole: screen readers
  // announce just "button" with no context. Two fixes:
  //   1) `aria-label="Generating"` gives the button a name during the
  //      loading state.
  //   2) `aria-busy` tells AT this control is currently mid-action so they
  //      can announce that state if/when they choose to.
  // Audit run 34/001.
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      disabled={disabled || loading}
      onClick={onClick}
      aria-label={loading ? 'Generating' : undefined}
      aria-busy={loading || undefined}
      className="min-w-[160px]"
    >
      {loading ? null : <Sparkles className="w-4 h-4" aria-hidden="true" />}
      {loading ? '' : 'Generate'}
    </Button>
  );
}
