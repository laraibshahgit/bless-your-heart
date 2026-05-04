import { Button } from '@/components/ui/button';
import { presets } from '@/content/presets';

interface PresetButtonsProps {
  selected: string | null;
  onSelect: (preset: string) => void;
  disabled?: boolean;
}

export function PresetButtons({ selected, onSelect, disabled }: PresetButtonsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory py-2 px-1 scrollbar-none max-w-lg mx-auto">
      {presets.map((preset) => (
        <Button
          key={preset}
          // Without `type="button"`, an unset type on a <button> inside a
          // <form> defaults to `type="submit"` (HTML spec). Clicking a preset
          // would then fire the form's onSubmit alongside the React onClick,
          // generating with whichever prompt value was captured in the
          // handleGenerate closure at click time — i.e. before the preset's
          // setPrompt landed. Audit run 35/001.
          type="button"
          variant="preset"
          size="sm"
          disabled={disabled}
          data-selected={selected === preset}
          onClick={() => onSelect(preset)}
          aria-pressed={selected === preset}
          className="snap-start shrink-0"
        >
          {preset}
        </Button>
      ))}
    </div>
  );
}
