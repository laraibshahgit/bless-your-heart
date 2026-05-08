import { useEffect, useRef, useState } from 'react';
import { placeholders } from '@/content/placeholders';
import { MAX_PROMPT_LENGTH } from '@/types';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const SESSION_KEY = 'byh:lastPrompt';

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
    if (saved && !value) {
      // The browser's `maxLength` attribute on `<input>` only enforces user
      // typing — a value set programmatically (e.g. tampered sessionStorage)
      // can exceed it. Truncate defensively so the restored prompt fits the
      // server's Zod `.max(MAX_PROMPT_LENGTH)` and the user is never silently
      // blocked by a 400 on submit.
      onChange(saved.slice(0, MAX_PROMPT_LENGTH));
    }
  }, []);

  // Cancel any pending sessionStorage write on unmount so a stale debounce
  // doesn't fire after the component is gone (in dev/StrictMode the double-
  // mount cycle would otherwise dispatch two writes for one keystroke).
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function handleChange(newValue: string) {
    const cleaned = newValue.replace(/\n/g, '');
    onChange(cleaned);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      safeSessionSet(SESSION_KEY, cleaned);
    }, 300);
  }

  const showCounter = value.length > 0;

  return (
    <div className="relative w-full max-w-lg mx-auto">
      <label htmlFor="prompt-input" className="sr-only">Tell me about your day</label>
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
        className="w-full bg-white text-ink-deep font-medium placeholder:text-ink-soft placeholder:italic placeholder:font-medium font-serif text-body-lg px-5 py-4 rounded-xl border-2 border-[#D4CFDF] shadow-md focus:outline-none focus:ring-2 focus:ring-accent-sage/50 focus:border-accent-sage/40 transition-shadow"
      />
      {showCounter && (
        <span className="absolute right-4 bottom-2 text-caption text-ink-faint">
          {value.length} / {MAX_PROMPT_LENGTH}
        </span>
      )}
    </div>
  );
}
