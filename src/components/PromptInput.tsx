import { useEffect, useRef, useState } from 'react';
import { placeholders } from '@/content/placeholders';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const SESSION_KEY = 'byh:lastPrompt';

export function PromptInput({ value, onChange, disabled }: PromptInputProps) {
  const [placeholder] = useState(() => placeholders[Math.floor(Math.random() * placeholders.length)]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved && !value) onChange(saved);
  }, []);

  function handleChange(newValue: string) {
    const cleaned = newValue.replace(/\n/g, '');
    onChange(cleaned);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      sessionStorage.setItem(SESSION_KEY, cleaned);
    }, 300);
  }

  const showCounter = value.length >= 180;

  return (
    <div className="relative w-full max-w-lg mx-auto">
      <label htmlFor="prompt-input" className="sr-only">What's going on?</label>
      <input
        ref={inputRef}
        id="prompt-input"
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        maxLength={200}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        className="w-full bg-paper text-ink-deep placeholder:text-ink-faint placeholder:italic font-serif text-body-lg px-5 py-4 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-accent-sage/50 transition-shadow"
      />
      {showCounter && (
        <span className="absolute right-4 bottom-2 text-caption text-feedback-quiet">
          {value.length} / 200
        </span>
      )}
    </div>
  );
}
