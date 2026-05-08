import { CreditsDialog } from './CreditsDialog';

export function Footer() {
  return (
    <footer className="py-6 mt-10 pt-5 border-t border-[#D4CFDF] text-center text-caption text-[#6A6578] space-y-2">
      <p className="italic">Bless Your Heart · made with affection and resignation</p>
      <p>
        A comedy product, not therapy. If you're in crisis, please reach out:{' '}
        <a
          href="tel:988"
          className="text-[#8B6DB0] hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-sage/50 focus-visible:ring-offset-2 focus-visible:ring-offset-lavender"
        >988</a> (US) ·{' '}
        <a
          href="https://findahelpline.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#8B6DB0] hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-sage/50 focus-visible:ring-offset-2 focus-visible:ring-offset-lavender"
        >
          findahelpline.com
        </a>{' '}
        (worldwide)
      </p>
      <p>
        Photos: <CreditsDialog /> · This site uses anonymous analytics
      </p>
    </footer>
  );
}
