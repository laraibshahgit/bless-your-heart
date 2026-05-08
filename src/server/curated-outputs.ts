interface CuratedPair {
  line1: string;
  line2: string;
}

interface CuratedSituation {
  triggers: string[];
  pairs: CuratedPair[];
}

const situations: CuratedSituation[] = [
  {
    triggers: ['monday again', 'monday again, somehow'],
    pairs: [
      { line1: 'Every week is a chance to start fresh.', line2: 'And every week you fuck it up by Wednesday. Bless your heart.' },
      { line1: 'New beginnings are everywhere.', line2: 'You said that last Monday too. And the one before. Adorable.' },
      { line1: 'This week is full of possibility.', line2: 'Same unread emails. Same dread. Same you. Goddamn.' },
      { line1: 'Mondays bring fresh opportunity.', line2: 'Here we fucking go again.' },
    ],
  },
  {
    triggers: ['just got dumped'],
    pairs: [
      { line1: 'This too shall pass.', line2: "And then you'll have to deal with some other bullshit. It never fucking ends." },
      { line1: 'You deserve someone who chooses you.', line2: 'I highly doubt that, lol.' },
      { line1: 'Better things are coming.', line2: "They're already coming for someone else. Someone your ex met last month." },
      { line1: "Love finds you when you're ready.", line2: 'His already found someone else. Took him forty-eight hours.' },
    ],
  },
  {
    triggers: ["i'm broke"],
    pairs: [
      { line1: "Money isn't everything.", line2: "It's the only thing your landlord cares about, though. Pay the fucking rent." },
      { line1: 'Abundance is a state of mind.', line2: "That's what broke people say to themselves at night." },
      { line1: 'True wealth comes from within.', line2: 'LMAO.' },
      { line1: 'The universe provides for those who trust.', line2: 'The universe does not give a shit about broke people. Pay the fucking rent.' },
    ],
  },
  {
    triggers: ['ex is engaged', 'my ex moved on'],
    pairs: [
      { line1: 'Your time will come.', line2: 'Theirs already did. With someone else. With a ring. On fucking Instagram.' },
      { line1: 'Love finds a way.', line2: 'It found one. Straight past you.' },
      { line1: 'What is meant to be will always find a way.', line2: 'So watch your fucking back.' },
      { line1: 'Comparison is the thief of joy.', line2: 'So is stalking their engagement photos at 2 AM. But here you are.' },
    ],
  },
  {
    triggers: ['embarrassed myself'],
    pairs: [
      { line1: 'Nobody remembers your mistakes.', line2: 'They do. They have a group chat. You are the topic.' },
      { line1: 'Every experience is a chance to grow.', line2: 'Nobody gives a shit. Everyone moved on. Except you.' },
      { line1: 'Vulnerability is a form of courage.', line2: 'Yours was a form of secondhand embarrassment.' },
      { line1: 'We are our own worst critic.', line2: 'No. Other people remember. They retell it at parties. You are a joke.' },
    ],
  },
  {
    triggers: ["can't sleep", "can't sleep, again"],
    pairs: [
      { line1: 'Rest comes to those at peace.', line2: 'So that explains your situation.' },
      { line1: 'Your body knows what it needs.', line2: 'It needs you to stop replaying the thing you said in 2011.' },
      { line1: 'Let your mind be still.', line2: 'It is replaying 2014 like a fucking documentary.' },
      { line1: 'Rest finds those who let go.', line2: "You haven't let go of anything since 2019. Continue staring at the ceiling." },
    ],
  },
  {
    triggers: ['no friends', 'group chat went silent'],
    pairs: [
      { line1: 'You are never truly alone.', line2: 'Your most humiliating memories will always fucking accompany you.' },
      { line1: 'Connection finds those who are ready.', line2: 'Your Hinge profile has zero views. Even the bots scrolled past.' },
      { line1: 'The right people will find you.', line2: 'Nobody gives a shit about you. Get over it.' },
      { line1: 'You are enough all on your own.', line2: "Apparently everyone else agrees. That's the problem." },
    ],
  },
  {
    triggers: ['feeling fat'],
    pairs: [
      { line1: 'You are more than a number.', line2: 'You are also the person who ate a whole pizza at 1 AM. And called it self-care.' },
      { line1: 'Your body is a temple.', line2: 'One that apparently has a drive-through and late-night hours.' },
      { line1: 'You are not a failure.', line2: 'You are just a quitter.' },
      { line1: 'Your body tells a story of resilience.', line2: 'And a story of cheese. Mostly cheese.' },
    ],
  },
  {
    triggers: ['got fired', 'got fired today'],
    pairs: [
      { line1: 'When one door closes, another opens.', line2: "Yours just slammed shut. The next one's locked. Good luck." },
      { line1: 'Every ending is a new beginning.', line2: 'Yours starts at the unemployment office. With a cardboard box and a sad desk plant.' },
      { line1: "Damn, that's really hard.", line2: 'But you really fucking sucked at your job, so.' },
      { line1: 'You will get through this like you always do.', line2: 'By crying.' },
    ],
  },
  {
    triggers: ['anxiety attack', 'therapist canceled'],
    pairs: [
      { line1: 'You are safe.', line2: 'Your brain disagrees. It has prepared a slideshow.' },
      { line1: 'Breathe.', line2: 'This too shall fucking pass.' },
      { line1: 'You have survived every bad day so far.', line2: 'It is only going to get worse.' },
      { line1: 'This feeling is temporary.', line2: "You are going to fuck things up again soon. Don't worry." },
    ],
  },
  {
    triggers: ['drank too much last night'],
    pairs: [
      { line1: 'Tomorrow is a fresh start.', line2: 'Last night you were not thinking about today. The texts cannot be unsent.' },
      { line1: 'Forgive yourself and move forward.', line2: 'Your sent folder cannot forgive you. Neither can your ex.' },
      { line1: 'Every day is a new beginning.', line2: 'This one starts with a headache and whatever the fuck you texted at 2 AM.' },
      { line1: 'Be gentle with yourself today.', line2: 'Your liver is not going to be.' },
    ],
  },
  {
    triggers: ['work meeting', 'pretending to work'],
    pairs: [
      { line1: 'Your voice deserves to be heard.', line2: "It won't be. It never fucking is. But bless your heart for trying." },
      { line1: 'Speak up, your ideas matter.', line2: "No, they don't. Karen is going to take credit anyway." },
      { line1: 'Bring your authentic self to the table.', line2: 'Not your real authentic self. Nobody wants to see that.' },
      { line1: "It's just a meeting. Don't worry.", line2: 'You are going to fuck it up anyway.' },
    ],
  },
  {
    triggers: ['dating issues', 'got left on read'],
    pairs: [
      { line1: 'The right person is out there.', line2: 'They saw your profile and kept scrolling. Aggressively.' },
      { line1: 'Be patient. Love takes time.', line2: "It does. Especially when nobody is texting back." },
      { line1: "You'll find your person when you stop looking.", line2: "Or you won't. That's also on the table." },
      { line1: 'Trust the timing of your life.', line2: 'The timing is shit. You know it. Keep swiping anyway.' },
    ],
  },
  {
    triggers: ['family dinner', 'family dinner tonight'],
    pairs: [
      { line1: 'There is no place like home.', line2: 'There is no bullshit like family bullshit. Smile through the casserole.' },
      { line1: 'Family is everything.', line2: "Especially when they're criticizing your career, your weight, and your relationship status. All in one breath." },
      { line1: 'Cherish these family moments.', line2: 'Your mom leaves you on read in the group chat. But sure, cherish away.' },
      { line1: 'Home is where the heart is.', line2: "And where your aunt is asking why you're still single. Again." },
    ],
  },
  {
    triggers: ['spiraling', 'self-sabotage'],
    pairs: [
      { line1: 'Manifest the life you want.', line2: 'You no longer wait for bad things to happen and ruin your happiness. You make them happen yourself.' },
      { line1: 'You are the author of your own story.', line2: 'And the story is a fucking horror novel.' },
      { line1: 'Trust your intuition.', line2: 'Yours is sabotaging you. It always has.' },
      { line1: 'You hold the power to change.', line2: "You won't. You'll do the same thing tomorrow. And the day after." },
    ],
  },
  {
    triggers: ['feeling good'],
    pairs: [
      { line1: 'Hold onto this feeling.', line2: "It's not going to last. Nothing ever does." },
      { line1: 'Embrace the joy you deserve.', line2: 'You will find a way to fuck this up by Tuesday. You always do.' },
      { line1: 'Today is a gift.', line2: 'Enjoy it. Tomorrow is going to be a bitch.' },
      { line1: "I'm glad you're feeling happy.", line2: "Don't get used to it. It won't last. It never does." },
    ],
  },
];

const triggerMap = new Map<string, CuratedSituation>();
for (const sit of situations) {
  for (const trigger of sit.triggers) {
    triggerMap.set(trigger.toLowerCase(), sit);
  }
}

export function getCuratedOutput(
  prompt: string,
  excludeIndices: number[] = []
): { line1: string; line2: string; index: number } | null {
  const situation = triggerMap.get(prompt.toLowerCase().trim());
  if (!situation) return null;

  const available = situation.pairs
    .map((pair, i) => ({ ...pair, index: i }))
    .filter(({ index }) => !excludeIndices.includes(index));

  if (available.length === 0) return null;

  const pick = available[Math.floor(Math.random() * available.length)];
  return pick;
}
