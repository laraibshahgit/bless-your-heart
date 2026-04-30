export const loadingPhrases = [
  'The universe is composing itself.',
  'Aligning the chakras of your specific situation.',
  'Distilling what you said into something honest.',
  'Consulting the ancient wellness texts.',
  'Some moments take longer than others.',
] as const;

export const errorCopy = {
  rateLimit: 'Even the universe has a daily limit. Try again in a bit.',
  slurBlock: "Let's try a different one.",
  realPersonBlock: "The voice doesn't punch at people. Try a situation instead.",
  generation: {
    anthropicError: 'Even the universe is buffering. Try again.',
    timeout: "The cosmos is having one of those days. Give it a moment.",
    networkOffline: 'Your connection drifted off into the wilderness. Try again when it\'s back.',
    unknown: "Something didn't quite land. One more try?",
  },
  frontend: {
    canvasWriteFailed: "The image didn't quite render. One more try?",
    downloadFailed: 'Even the download is having a moment. Try once more.',
    fontLoadTimeout: 'The typography is taking its time. Refreshing might help.',
  },
  errorBoundary: 'The page lost the thread. Refreshing usually helps.',
} as const;

export const downloadConfirmation = 'Saved. Go forth.';
