import type { Hotline } from '@/types';

const hotlineMap: Record<string, Hotline> = {
  US: { countryCode: 'US', name: '988 Suicide & Crisis Lifeline', phone: '988', url: 'https://988lifeline.org' },
  GB: { countryCode: 'GB', name: 'Samaritans', phone: '116 123', url: 'https://www.samaritans.org' },
  CA: { countryCode: 'CA', name: 'Talk Suicide Canada', phone: '988', url: 'https://talksuicide.ca' },
  AU: { countryCode: 'AU', name: 'Lifeline Australia', phone: '13 11 14', url: 'https://www.lifeline.org.au' },
  IE: { countryCode: 'IE', name: 'Samaritans Ireland', phone: '116 123', url: 'https://www.samaritans.org' },
  NZ: { countryCode: 'NZ', name: 'Need to Talk?', phone: '1737' },
  IN: { countryCode: 'IN', name: 'iCall', phone: '9152987821' },
  DE: { countryCode: 'DE', name: 'Telefonseelsorge', phone: '0800 111 0 111' },
  FR: { countryCode: 'FR', name: 'SOS Amitié', phone: '09 72 39 40 50' },
};

const fallbackHotline: Hotline = {
  countryCode: 'INTL',
  name: 'Find a Helpline',
  phone: '',
  url: 'https://findahelpline.com',
};

export function getHotlineForCountry(countryCode: string): Hotline {
  return hotlineMap[countryCode.toUpperCase()] ?? fallbackHotline;
}
