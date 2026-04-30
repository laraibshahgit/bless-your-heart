const synonymMap: Record<string, string[]> = {
  monday: ['day', 'week', 'morning', 'weekend', 'tomorrow', 'weekday'],
  coffee: ['morning', 'cup', 'mug', 'brew', 'awake', 'tired', 'caffeine'],
  sleep: ['rest', 'awake', 'bed', 'eyes', 'dark', 'dawn', 'insomnia', 'tired', 'night'],
  tired: ['rest', 'awake', 'bed', 'eyes', 'energy', 'exhausted', 'sleep'],
  work: ['office', 'meeting', 'email', 'deadline', 'career', 'job', 'boss', 'desk', 'manager'],
  job: ['office', 'meeting', 'email', 'deadline', 'career', 'work', 'boss', 'manager'],
  boss: ['office', 'meeting', 'email', 'work', 'job', 'management', 'manager', 'supervisor'],
  meeting: ['calendar', 'agenda', 'conference', 'room', 'call', 'zoom', 'attendee', 'deck', 'slide', 'presentation', 'productive', 'mandatory'],
  email: ['inbox', 'reply', 'send', 'message', 'notification', 'unread', 'thread', 'cc'],
  schedule: ['calendar', 'agenda', 'time', 'block', 'slot', 'appointment', 'booking'],
  deadline: ['due', 'late', 'overdue', 'clock', 'countdown', 'urgent', 'rush'],
  commute: ['traffic', 'drive', 'train', 'road', 'highway', 'car', 'bus', 'subway'],
  family: ['relatives', 'parents', 'dinner', 'holidays', 'home', 'gathering'],
  mom: ['mother', 'parents', 'family', 'home', 'dinner'],
  dad: ['father', 'parents', 'family', 'home'],
  dating: ['romance', 'love', 'text', 'swipe', 'single', 'app', 'match'],
  breakup: ['romance', 'love', 'text', 'heart', 'single', 'ex'],
  ex: ['romance', 'love', 'text', 'past', 'single', 'back'],
  money: ['wallet', 'account', 'paycheck', 'debt', 'broke', 'bills', 'rent', 'budget'],
  bills: ['wallet', 'account', 'paycheck', 'debt', 'money', 'rent', 'due'],
  rent: ['wallet', 'landlord', 'apartment', 'money', 'bills', 'due'],
  adulting: ['bills', 'responsibility', 'grown', 'taxes', 'laundry', 'groceries'],
  wedding: ['family', 'ceremony', 'dress', 'toast', 'invitation', 'reception'],
  sister: ['sibling', 'family', 'relatives'],
  brother: ['sibling', 'family', 'relatives'],
  gym: ['workout', 'exercise', 'run', 'sweat', 'treadmill', 'fit', 'muscle'],
  diet: ['food', 'eat', 'calories', 'salad', 'pizza', 'snack', 'hungry'],
  anxiety: ['worry', 'nervous', 'panic', 'stress', 'overthink', 'spiral'],
  stress: ['overwhelm', 'pressure', 'tense', 'anxiety', 'burnout'],
  friend: ['text', 'plans', 'cancel', 'social', 'group', 'chat'],
  phone: ['screen', 'notification', 'scroll', 'app', 'text', 'battery'],
};

export function checkSynonymMap(contentWords: string[], line2Tokens: string[]): boolean {
  for (const word of contentWords) {
    const synonyms = synonymMap[word];
    if (!synonyms) continue;
    if (synonyms.some((s) => line2Tokens.includes(s))) return true;
  }
  return false;
}
