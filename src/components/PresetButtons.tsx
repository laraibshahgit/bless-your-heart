import { Button } from '@/components/ui/button';
import { presets } from '@/content/presets';

interface PresetButtonsProps {
  selected: string | null;
  onSelect: (preset: string) => void;
  disabled?: boolean;
}

export function PresetButtons({ selected, onSelect, disabled }: PresetButtonsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-lg mx-auto">
      {presets.map((preset) => (
        <Button
          key={preset}
          type="button"
          variant="preset"
          disabled={disabled}
          data-selected={selected === preset}
          onClick={() => onSelect(preset)}
          aria-pressed={selected === preset}
          className="h-auto px-4 py-3 rounded-xl text-body font-semibold whitespace-normal text-center leading-snug shadow-sm"
        >
          {preset}
        </Button>
      ))}
    </div>
  );
}
