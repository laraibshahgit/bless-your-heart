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

// On iOS Safari `saveAs` opens the PNG in a new tab instead of downloading
// (the browser blocks programmatic file saves), so we surface a hint that
// tells the user how to actually keep the image. Lives here, not in errorCopy,
// because it is not an error — the download did succeed, the OS just hands off
// to a different save flow.
export const downloadCopy = {
  iosHint: 'On iPhone? Long-press the image after the new tab opens to save.',
} as const;

// Copy for the distress interstitial. Intentionally sincere — the wellness-
// influencer voice ends here. The link prefix/label/suffix split exists so the
// component can wrap `findahelpline.com` in an <a> while keeping the surrounding
// sentence in copy.ts; see DistressInterstitial.tsx for the JSX assembly.
export const distressCopy = {
  headline: "This one isn't for jokes.",
  body: "If you're going through something serious, please talk to someone who can actually help. You're not alone in it.",
  hotlineLinkPrefix: 'Or visit ',
  hotlineLinkLabel: 'findahelpline.com',
  hotlineLinkSuffix: ' for support anywhere in the world.',
  closeAction: 'Take me back',
} as const;
