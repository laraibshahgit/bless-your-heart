import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F7F3EC',
        paper: '#FBF8F2',
        'ink-deep': '#2A2622',
        'ink-soft': '#5C5650',
        'ink-faint': '#9A938B',
        'accent-sage': '#8B9D83',
        'accent-sage-deep': '#6F8267',
        'accent-rust': '#B47855',
        'accent-gold': '#E8B830',
        'border-mist': '#E5DFD4',
        'feedback-quiet': '#D9D4C8',
        lavender: '#F0EDF6',
        'sky-wash': '#eef4fb',
        'dark-surface': '#26221E',
        'dark-raised': '#38342E',
        'dark-border': '#4E4A44',
        'dark-text': '#C8C0B0',
        'dark-text-muted': '#A8A090',
        'dark-text-faint': '#6A6258',
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      fontSize: {
        display: ['3rem', { lineHeight: '1.1', fontWeight: '500' }],
        'display-lg': ['3.75rem', { lineHeight: '1.1', fontWeight: '500' }],
        headline: ['2rem', { lineHeight: '1.15', fontWeight: '500' }],
        'headline-lg': ['2.5rem', { lineHeight: '1.15', fontWeight: '500' }],
        'body-lg': ['1.125rem', { lineHeight: '1.5', fontWeight: '400' }],
        body: ['1rem', { lineHeight: '1.55', fontWeight: '400' }],
        label: ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }],
        caption: ['0.8125rem', { lineHeight: '1.4', fontWeight: '400' }],
      },
      spacing: {
        breathe: '1.75rem',
        section: '4rem',
      },
      borderRadius: {
        pill: '9999px',
      },
      transitionTimingFunction: {
        soft: 'cubic-bezier(0.4, 0, 0.2, 1)',
        touch: 'cubic-bezier(0.2, 0, 0.4, 1)',
      },
      transitionDuration: {
        reveal: '600ms',
        anticipation: '800ms',
      },
      keyframes: {
        'pulse-opacity': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'pulse-opacity': 'pulse-opacity 1600ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
