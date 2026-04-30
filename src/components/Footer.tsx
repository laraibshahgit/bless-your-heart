import { CreditsDialog } from './CreditsDialog';

export function Footer() {
  return (
    <footer className="bg-paper py-8 mt-section text-center text-caption text-ink-faint space-y-2">
      <p className="italic">Bless Your Heart · made with affection and resignation</p>
      <p>
        A comedy product, not therapy. If you're in crisis, please reach out:{' '}
        <a href="tel:988" className="text-accent-sage hover:underline">988</a> (US) ·{' '}
        <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer" className="text-accent-sage hover:underline">
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
