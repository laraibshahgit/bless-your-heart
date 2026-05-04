import { useEffect, useRef, useState } from 'react';
import { placeholders } from '@/content/placeholders';
import { MAX_PROMPT_LENGTH } from '@/types';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const SESSION_KEY = 'byh:lastPrompt';
// Show character counter only as the user nears the limit — keep the UI calm
// for 90% of the typing experience.
const COUNTER_VISIBLE_THRESHOLD = Math.floor(MAX_PROMPT_LENGTH * 0.9);

// sessionStorage can throw in third-party iframe / cookie-blocked / quota-full
// contexts. Treat persistence as best-effort: a failure must never bubble up
// and crash the input. Helpers swallow the error and let the caller move on.
function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* persistence is best-effort; ignore quota/security errors */
  }
}

export function PromptInput({ value, onChange, disabled }: PromptInputProps) {
  const [placeholder] = useState(() => placeholders[Math.floor(Math.random() * placeholders.length)]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const saved = safeSessionGet(SESSION_KEY);
    if (saved && !value) onChange(saved);
  }, []);

  function handleChange(newValue: string) {
    const cleaned = newValue.replace(/\n/g, '');
    onChange(cleaned);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      safeSessionSet(SESSION_KEY, cleaned);
    }, 300);
  }

  const showCounter = value.length >= COUNTER_VISIBLE_THRESHOLD;

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
        maxLength={MAX_PROMPT_LENGTH}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        className="w-full bg-paper text-ink-deep placeholder:text-ink-faint placeholder:italic font-serif text-body-lg px-5 py-4 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-accent-sage/50 transition-shadow"
      />
      {showCounter && (
        <span className="absolute right-4 bottom-2 text-caption text-feedback-quiet">
          {value.length} / {MAX_PROMPT_LENGTH}
        </span>
      )}
    </div>
  );
}
