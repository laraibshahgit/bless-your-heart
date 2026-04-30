import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

interface GenerateButtonProps {
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}

export function GenerateButton({ loading, disabled, onClick }: GenerateButtonProps) {
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      disabled={disabled || loading}
      onClick={onClick}
      className="min-w-[160px]"
    >
      {loading ? null : <Sparkles className="w-4 h-4" />}
      {loading ? '' : 'Generate'}
    </Button>
  );
}
