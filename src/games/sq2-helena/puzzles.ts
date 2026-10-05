/**
 * Side Quest 2 content and pure logic for the memory match and the word
 * puzzle (no DOM, unit tested). The sliding puzzle lives in slide.ts.
 */
import { shuffled } from '../sq1-dinner/rng';

export type Speaker = 'liz' | 'helena' | 'wes';

export interface MemoryCard {
  id: string;
  /** Polaroid caption; its last word's initial is the drawn fallback if the art is missing. */
  label: string;
  img: string;
  /** The memory the pair brings back. */
  line: string;
  who: Speaker;
  mood?: string;
}

/** Old memories of Liz's mom mixed with new ones of Helena. */
export const MEMORY_CARDS: MemoryCard[] = [
  { id: 'vinyl', label: "Mom's records", img: 'img/puzzles/cards/vinyl.webp', who: 'liz', mood: 'sad', line: 'Mom\'s records. She played them every Sunday morning, way too loud.' },
  { id: 'mixtape', label: 'The mixtape', img: 'img/puzzles/cards/mixtape.webp', who: 'liz', line: 'The mixtape Mom made me for my first day of school. I still know every song.' },
  { id: 'cookies', label: "Helena's cookies", img: 'img/puzzles/cards/cookies.webp', who: 'helena', mood: 'happy', line: 'Snickerdoodles. Your dad says they were your mom\'s favorite, too.' },
  { id: 'teacup', label: "Mom's teacup", img: 'img/puzzles/cards/teacup.webp', who: 'helena', line: 'I kept her teacup on the top shelf, Liz. Where nothing could happen to it.' },
  { id: 'photo', label: 'The house photo', img: 'img/puzzles/cards/photo.webp', who: 'liz', mood: 'happy', line: 'Mom took this the day we moved in. She said a house is just walls until you love it.' },
  { id: 'flowers', label: 'Her flowers', img: 'img/puzzles/cards/flowers.webp', who: 'helena', mood: 'happy', line: 'I planted her favorite flowers by the porch. I hope that\'s okay.' },
];

/** Every this-many mismatches costs a heart. */
export const MISSES_PER_HEART = 3;

/** Twelve card ids (each of the six twice), shuffled. */
export function buildDeck(rng: () => number = Math.random): string[] {
  return shuffled(
    MEMORY_CARDS.flatMap((c) => [c.id, c.id]),
    rng,
  );
}

/** What Wes wants to tell Liz, built one word at a time. */
export const LESSON = "Holding on to the past won't stop the pain of the present";
export const LESSON_WORDS = LESSON.split(' ');

/** Every this-many wrong taps costs a heart. */
export const WRONG_TAPS_PER_HEART = 2;

/** Word tiles in a random order that never reads the sentence correctly. */
export function scrambleWords(rng: () => number = Math.random): string[] {
  for (;;) {
    const s = shuffled(LESSON_WORDS, rng);
    if (s.join(' ') !== LESSON) return s;
  }
}

/** Is `word` the next word of the lesson after `built` words? (Duplicates like "the" are interchangeable.) */
export function isNextWord(built: number, word: string): boolean {
  return LESSON_WORDS[built]?.toLowerCase() === word.toLowerCase();
}

export interface TalkLine {
  who: Speaker;
  text: string;
  mood?: string;
}

/** Short scenes between the puzzles, in the kitchen with Liz and Helena. */
export const TALK: { intro: TalkLine[]; afterMemory: TalkLine[]; afterSlide: TalkLine[] } = {
  intro: [
    { who: 'helena', text: "I found a box of your mom's things in the pantry. I thought maybe we could look through it together?" },
    { who: 'liz', mood: 'sad', text: "Those are hers. You can't just… go through her stuff." },
    { who: 'wes', text: "Nobody's taking anything, Liz. We'll just look. Together." },
  ],
  afterMemory: [
    { who: 'liz', mood: 'sad', text: "She kept Mom's teacup. On the top shelf. I thought she'd thrown it all away." },
    { who: 'helena', mood: 'happy', text: 'Never. Oh, and the frame on our family photo broke. Will you two help me put it back together?' },
    { who: 'wes', mood: 'happy', text: "A puzzle? Please. Bennett's got this." },
  ],
  afterSlide: [
    { who: 'liz', mood: 'sad', text: "It's the three of us. It feels like if I'm in the picture, I'm erasing her." },
    { who: 'helena', text: 'Your mom will always be your mom, Liz. I just want a spot in the picture too.' },
    { who: 'wes', text: "There's something I need you to hear, Libby. Help me find the right words." },
  ],
};
