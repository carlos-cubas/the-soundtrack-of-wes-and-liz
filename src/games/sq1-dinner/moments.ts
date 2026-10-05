/**
 * Side Quest 1, "Not the Hollywood Version": the six moments of the date.
 *
 * Deck: Wes takes Liz to dinner and makes sure it is not the Hollywood-perfect
 * version she expects, so she sees he treats her the same as always. Each
 * moment has one "real Wes" move and two movie clichés.
 */
import { shuffled } from './rng';

export interface Choice {
  /** Line-art icon name from src/ui/icons.ts. */
  icon: string;
  text: string;
  /** True for the one move the real Wes would make. */
  real: boolean;
  /** Liz's reaction when Wes picks this. */
  react: string;
}

export interface Moment {
  id: string;
  title: string;
  /** Liz sets the scene. */
  setup: string;
  mood?: string;
  choices: Choice[];
}

export const SECONDS_PER_MOMENT = 12;
export const START_HEARTS = 3;

export const MOMENTS: Moment[] = [
  {
    id: 'arrive',
    title: 'Arriving',
    setup: "Okay, Bennett, what's the plan? A limo? Rose petals? A slow-motion walk to the door?",
    choices: [
      { icon: 'sneaker', real: true, text: 'Race her to the booth. Loser buys the fries.', react: "You false-started! That doesn't count! …Fine. Fries are on me." },
      { icon: 'rose', real: false, text: 'Hand her a single red rose, with a little bow.', react: 'A rose? Wes… are you okay? This feels like a movie set.' },
      { icon: 'carpet', real: false, text: 'Roll out a red carpet from your car to the door.', react: 'Is that a CARPET? Where do you even get a carpet?' },
    ],
  },
  {
    id: 'order',
    title: 'Ordering',
    setup: "Everything on this menu looks good. I'm going to be here forever.",
    choices: [
      { icon: 'burger', real: true, text: 'Order her usual before she even opens the menu.', react: 'Extra pickles. You remembered? Since when do you pay attention?' },
      { icon: 'candle', real: false, text: 'Ask for candlelight and "your finest sparkling cider."', react: "Wes. It's a diner. The candle is a ketchup bottle." },
      { icon: 'baguette', real: false, text: 'Order for her in a fancy French accent.', react: 'Did you just say "le cheeseburger"? Who ARE you right now?' },
    ],
  },
  {
    id: 'jukebox',
    title: 'The Jukebox',
    setup: "Ooh, a jukebox! Bet you can't find one good song on there.",
    choices: [
      { icon: 'drum', real: true, text: 'Play her favorite song and air-drum to it. Badly.', react: "That's my song! You're a terrible drummer. Never stop." },
      { icon: 'violin', real: false, text: 'Hire a violinist to serenade her at the table.', react: 'Why is there a man with a violin at my elbow? Make it stop.' },
      { icon: 'disco', real: false, text: 'Sweep her into a slow dance between the booths.', react: 'The cook is staring at us. Wes, sit DOWN.' },
    ],
  },
  {
    id: 'talk',
    title: 'Small Talk',
    setup: 'So… what do we even talk about? This is weird. Is this weird?',
    choices: [
      { icon: 'gnome', real: true, text: 'Tease her about screaming at a gnome head in 2011.', react: 'I was SEVEN and it was a SEVERED HEAD! …Okay, it was a little funny.' },
      { icon: 'scroll', real: false, text: 'Recite a love sonnet you memorized for tonight.', react: '"Shall I compare thee…" Are you reading that off your hand?' },
      { icon: 'eyes', real: false, text: 'Gaze into her eyes in total silence. For a minute.', react: "You're blinking weird. Do you need a doctor?" },
    ],
  },
  {
    id: 'spill',
    title: 'The Spill',
    setup: 'Oh no. No, no, no. Chocolate shake. All over my dress.',
    mood: 'sad',
    choices: [
      { icon: 'hoodie', real: true, text: 'Hand her your hoodie. Again.', react: "Your hoodie. Again. This is becoming a habit, Bennett. …It's warm, though." },
      { icon: 'cape', real: false, text: 'Scoop her up and carry her out dramatically.', react: 'PUT ME DOWN! Our fries are still on the table!' },
      { icon: 'snail', real: false, text: 'Dab her dress with a silk hanky, in slow motion.', react: 'Are you doing slow motion? On purpose? Stop it.' },
    ],
  },
  {
    id: 'goodnight',
    title: 'Goodnight',
    setup: 'So… this is me. Thanks for tonight, Wes. It was actually really nice.',
    mood: 'happy',
    choices: [
      { icon: 'parking', real: true, text: '"See you in the parking spot, Buxbaum."', react: 'In your dreams, Bennett. That spot is MINE.' },
      { icon: 'stars', real: false, text: 'Kiss her hand under the stars.', react: 'Did you just kiss my hand? Like a duke? Are you okay?' },
      { icon: 'firework', real: false, text: 'Promise to love her until the stars burn out.', react: "…You've been watching my movies, haven't you?" },
    ],
  },
];

/** Liz when Wes freezes up and the timer runs out. */
export const TIMEOUT_LINES = [
  'Earth to Wes. Are you buffering?',
  "You've been frozen for, like, a year. Blink twice if you need help.",
  'Hello? Did you fall asleep with your eyes open?',
];

/** The moment's choices in a random order (the real one can land anywhere). */
export function dealChoices(m: Moment, rng: () => number = Math.random): Choice[] {
  return shuffled(m.choices, rng);
}

/** 5 stars for a flawless date, one star off per slip (heart lost), never below 1. */
export function starsFor(slips: number): number {
  return Math.max(1, 5 - slips);
}
