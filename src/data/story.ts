/**
 * Story data for The Soundtrack of Wes and Liz.
 *
 * Every narration, level, reward and side quest comes from Samira Cubas's
 * game design deck (IRP Quarter 1). Narration text is hers, lightly
 * copy-edited for typos. Interlude dialogue is new, written to carry the
 * NPC appearances the deck describes (Michael, Helena and Jocelyn show up
 * "in the narrations that come between each level").
 */

export type LevelId = 'l1' | 'l2' | 'l3' | 'l4' | 'l5' | 'l6' | 'boss' | 'sq1' | 'sq2' | 'sq3';
export type ItemId = 'cap' | 'bat' | 'boombox' | 'jersey';
export type SongId = string;
export type Speaker = 'wes' | 'liz' | 'wes-kid' | 'liz-kid' | 'michael' | 'jocelyn' | 'helena' | 'noah' | 'ryno' | 'narrator';
export type MapLocId =
  | 'lizHouse'
  | 'wesHouse'
  | 'ryno'
  | 'mall'
  | 'gym'
  | 'stellas'
  | 'parking'
  | 'wesCar'
  | 'secret';

export interface Song {
  id: SongId;
  title: string;
  artist: string;
  /** iTunes search term used to find a 30-second preview. */
  search: string;
  /** Where it is earned. */
  source: string;
}

export interface DialogueLine {
  who: Speaker;
  text: string;
  /** Portrait mood variant, if the art exists. */
  mood?: string;
}

export interface LevelDef {
  id: LevelId;
  kind: 'level' | 'boss' | 'side';
  /** Short label, e.g. "Level 1", "Boss Level", "Side Quest". */
  label: string;
  title: string;
  /** Chapter of Better Than the Movies the level is based on. */
  chapter: string;
  /** Inspiration the deck names for the mini game. */
  basedOn: string;
  year: string;
  location: MapLocId;
  /** Narration paragraphs, in Wes's voice. */
  narration: string[];
  /** How-to-play bullet points shown before the game starts. */
  howTo: string[];
  /** Which levels must be complete before this one unlocks. */
  requires: LevelId[];
  /** Song always earned on completion. */
  song: SongId;
  /** Item earned on success (maybe conditional, see rewardRule). */
  item?: ItemId;
  /** Human-readable condition for the item. */
  itemRule?: string;
  /** Who you play as. */
  playAs: 'wes' | 'liz' | 'frog';
  /** Scene illustration shown with the narration. */
  scene: string;
  /** Music track id while playing. */
  music: string;
  /** Lines shown after completing the level. */
  outro: DialogueLine[];
  /** Alternative outro (e.g. Level 5 when Liz gets hit). */
  outroAlt?: DialogueLine[];
  /** Lines shown when the level is failed. */
  failLine?: DialogueLine;
}

export const SONGS: Record<SongId, Song> = {
  psa: { id: 'psa', title: 'Public Service Announcement (Interlude)', artist: 'JAY-Z', search: 'Public Service Announcement Interlude Jay-Z', source: 'Level 1' },
  sandman: { id: 'sandman', title: 'Enter Sandman', artist: 'Metallica', search: 'Enter Sandman Metallica', source: 'Level 2' },
  monkeywrench: { id: 'monkeywrench', title: 'Monkey Wrench', artist: 'Foo Fighters', search: 'Monkey Wrench Foo Fighters', source: 'Level 3' },
  lovers: { id: 'lovers', title: 'Lovers', artist: 'Anna of the North', search: 'Lovers Anna of the North', source: 'Level 4' },
  electric: { id: 'electric', title: 'Electric (feat. Khalid)', artist: 'Alina Baraz', search: 'Electric Alina Baraz Khalid', source: 'Level 5' },
  weareyoung: { id: 'weareyoung', title: 'We Are Young (feat. Janelle Monáe)', artist: 'fun.', search: 'We Are Young fun Janelle Monae', source: 'Level 6' },
  paradise: { id: 'paradise', title: 'Paradise', artist: 'Bazzi', search: 'Paradise Bazzi', source: 'Boss Level' },
  // Side quests and secrets draw from the deck's "Soundtrack ideas" list.
  someonelikeyou_vm: { id: 'someonelikeyou_vm', title: 'Someone Like You', artist: 'Van Morrison', search: 'Someone Like You Van Morrison', source: 'Side Quest: Not the Movies' },
  river: { id: 'river', title: 'River', artist: 'Joni Mitchell', search: 'River Joni Mitchell Blue', source: 'Side Quest: Letting Go' },
  badliar: { id: 'badliar', title: 'Bad Liar', artist: 'Selena Gomez', search: 'Bad Liar Selena Gomez', source: 'Side Quest: Moldy Car' },
  paperrings: { id: 'paperrings', title: 'Paper Rings', artist: 'Taylor Swift', search: 'Paper Rings Taylor Swift', source: 'Secret: Chuck Taylors' },
  // Bonus tracks unlocked when the playlist is finished.
  oceaneyes: { id: 'oceaneyes', title: 'Ocean Eyes', artist: 'Billie Eilish', search: 'Ocean Eyes Billie Eilish', source: 'Bonus' },
  upallnight: { id: 'upallnight', title: 'Up All Night', artist: 'Mac Miller', search: 'Up All Night Mac Miller', source: 'Bonus' },
  howwouldyoufeel: { id: 'howwouldyoufeel', title: 'How Would You Feel (Paean)', artist: 'Ed Sheeran', search: 'How Would You Feel Paean Ed Sheeran', source: 'Bonus' },
  hellooperator: { id: 'hellooperator', title: 'Hello Operator', artist: 'The White Stripes', search: 'Hello Operator White Stripes', source: 'Bonus' },
  sabotage: { id: 'sabotage', title: 'Sabotage', artist: 'Beastie Boys', search: 'Sabotage Beastie Boys', source: 'Bonus' },
  feelinalright: { id: 'feelinalright', title: "Feelin' Alright", artist: 'Joe Cocker', search: "Feelin' Alright Joe Cocker", source: 'Bonus' },
  someonelikeyou_adele: { id: 'someonelikeyou_adele', title: 'Someone Like You', artist: 'Adele', search: 'Someone Like You Adele', source: 'Bonus' },
  bellaluna: { id: 'bellaluna', title: 'Bella Luna', artist: 'Jason Mraz', search: 'Bella Luna Jason Mraz', source: 'Bonus' },
  forrestgump: { id: 'forrestgump', title: 'Forrest Gump', artist: 'Frank Ocean', search: 'Forrest Gump Frank Ocean', source: 'Bonus' },
  kiss: { id: 'kiss', title: 'Kiss', artist: 'Tom Jones (with The Art of Noise)', search: 'Kiss Art of Noise Tom Jones', source: 'Bonus' },
  deathwithdignity: { id: 'deathwithdignity', title: 'Death with Dignity', artist: 'Sufjan Stevens', search: 'Death with Dignity Sufjan Stevens', source: 'Bonus' },
  newyearsday: { id: 'newyearsday', title: "New Year's Day", artist: 'Taylor Swift', search: "New Year's Day Taylor Swift", source: 'Bonus' },
};

/** The order songs appear on "The Liz and Wes Playlist". */
export const PLAYLIST_ORDER: SongId[] = [
  'psa', 'sandman', 'monkeywrench', 'lovers', 'electric', 'weareyoung', 'paradise',
  'someonelikeyou_vm', 'river', 'badliar', 'paperrings',
];
export const BONUS_SONGS: SongId[] = [
  'oceaneyes', 'upallnight', 'howwouldyoufeel', 'hellooperator', 'sabotage', 'feelinalright',
  'someonelikeyou_adele', 'bellaluna', 'forrestgump', 'kiss', 'deathwithdignity', 'newyearsday',
];

export interface ItemDef {
  id: ItemId | 'chucks';
  name: string;
  effect: string;
  icon: string;
  earnedFrom: string;
}

export const ITEMS: Record<ItemId | 'chucks', ItemDef> = {
  cap: { id: 'cap', name: 'Baseball Cap', effect: 'Ask for a hint during a side quest.', icon: 'img/items/cap.png', earnedFrom: 'Level 5: make it through all ten rounds without getting hit' },
  bat: { id: 'bat', name: 'Baseball Bat', effect: 'Skip one obstacle during a side quest.', icon: 'img/items/bat.png', earnedFrom: 'Level 3: escape the party maze in time' },
  boombox: { id: 'boombox', name: 'Boombox', effect: 'Invincible for 30 seconds during a side quest.', icon: 'img/items/boombox.png', earnedFrom: 'Level 4: win Jocelyn over' },
  jersey: { id: 'jersey', name: 'No. 32 Jersey', effect: 'One extra life during a side quest.', icon: 'img/items/jersey.png', earnedFrom: 'Level 6: get a high rating on all five drawings' },
  chucks: { id: 'chucks', name: 'Chuck Taylors', effect: 'Move at double speed.', icon: 'img/items/chucks.png', earnedFrom: 'Hidden: finish all three side quests' },
};

export interface MapLoc {
  id: MapLocId;
  name: string;
  /** Position on the map image, normalised 0..1. */
  x: number;
  y: number;
}

/** Pin positions on Samira's hand-drawn map (img/map.webp). */
export const MAP_LOCS: Record<MapLocId, MapLoc> = {
  gym: { id: 'gym', name: 'School Gym', x: 0.17, y: 0.2 },
  wesCar: { id: 'wesCar', name: "Wesley's Car", x: 0.405, y: 0.17 },
  stellas: { id: 'stellas', name: "Stella's", x: 0.655, y: 0.19 },
  mall: { id: 'mall', name: 'The Mall', x: 0.668, y: 0.56 },
  ryno: { id: 'ryno', name: "Ryno's House", x: 0.68, y: 0.79 },
  lizHouse: { id: 'lizHouse', name: "Elizabeth Buxbaum's House", x: 0.165, y: 0.62 },
  wesHouse: { id: 'wesHouse', name: "Wesley Bennett's House", x: 0.4325, y: 0.63 },
  secret: { id: 'secret', name: 'Secret Area', x: 0.31, y: 0.66 },
  parking: { id: 'parking', name: 'Parking Spot', x: 0.32, y: 0.9 },
};

export const LEVELS: Record<LevelId, LevelDef> = {
  l1: {
    id: 'l1',
    kind: 'level',
    label: 'Level 1',
    title: 'Barbie and the Frog',
    chapter: 'Chapter 1',
    basedOn: 'Donkey Kong and The Princess and the Frog',
    year: '2011',
    location: 'lizHouse',
    playAs: 'frog',
    narration: [
      'I have loved Libby since the second grade, when I realized that I could turn her cheeks pink with just a word.',
      'We had just finished watching The Princess and the Frog in school when I came to the conclusion that Liz would love a frog in her Barbie Dreamhouse.',
      "I didn't consider that she might feel a sense of disgust toward the little creatures.",
    ],
    howTo: [
      'You are the frog. Climb Libby\'s Barbie Dreamhouse all the way to the roof.',
      'Barbie throws beach balls down at you. Jump over them or dodge them.',
      'Use the ladders to climb. Reach Barbie on the roof for a kiss!',
    ],
    requires: [],
    song: 'psa',
    scene: 'img/scenes/l1.webp',
    music: 'l1',
    outro: [
      { who: 'liz-kid', text: 'EWWW! There is a FROG in my Dreamhouse! WESLEY BENNETT!', mood: 'mad' },
      { who: 'wes-kid', text: 'He just wanted a kiss from Barbie. Like the movie!' },
      { who: 'liz-kid', text: 'That is NOT how the movie goes.', mood: 'mad' },
    ],
    failLine: { who: 'wes-kid', text: "Come on, little guy. Barbie's waiting. Try again!" },
  },
  l2: {
    id: 'l2',
    kind: 'level',
    label: 'Level 2',
    title: 'The Great Gnome Decapitation',
    chapter: 'Chapter 1',
    basedOn: 'Whack-a-Mole',
    year: '2011',
    location: 'wesHouse',
    playAs: 'wes',
    narration: [
      'I tried to make up for the frog incident by gifting Libby a guardian gnome for her little neighborhood library.',
      'As you could imagine, giving a little girl a severed gnome head might not have been the best way to go.',
    ],
    howTo: [
      'Garden gnomes keep popping out of the ground. Tap them to grab them!',
      'Every gnome you grab makes the rest pop up and hide faster.',
      'Grab 10 gnomes before 5 of them get away.',
    ],
    requires: ['l1'],
    song: 'sandman',
    scene: 'img/scenes/l2.webp',
    music: 'l2',
    outro: [
      { who: 'liz-kid', text: '*opens the little library* ...AAAAAH! Its HEAD! Where is the rest of it?!', mood: 'mad' },
      { who: 'wes-kid', text: "It's a guardian gnome. He guards your books. With his face." },
      { who: 'narrator', text: 'Ten years later…' },
    ],
    failLine: { who: 'wes-kid', text: 'They are too fast! One more try.' },
  },
  l3: {
    id: 'l3',
    kind: 'level',
    label: 'Level 3',
    title: 'Vomit Girl',
    chapter: 'Chapter 3',
    basedOn: 'Maze escape',
    year: '2021',
    location: 'ryno',
    playAs: 'wes',
    narration: [
      "About ten years after the frog and gnome scandal, Liz needed my help. Liz always had a thing for a boy named Michael, who moved out of our neighborhood a few years back. Once he finally moved back, Liz wanted to make her move.",
      "Michael and I were invited to a party at my friend Ryno's house, and I was her ticket to having a moment with Michael after all these years.",
      "What Liz didn't take into account was that we were going to a beer party, and that she might be the unlucky person to get barfed on.",
      "I don't want to say that I was happy with the outcome, but at least she didn't have her moment with Michael, and instead it gave me the opportunity to give her an extra pair of clothes.",
    ],
    howTo: [
      'Liz just got barfed on. Your spare clothes are in your car!',
      "Find your way out of Ryno's house to your car in 15 seconds.",
      'Squeeze past the crowds. Bumping into people slows you down.',
      "Wes is deathly afraid of clowns. There's one in the garage. Good luck.",
    ],
    requires: ['l2'],
    song: 'monkeywrench',
    item: 'bat',
    itemRule: 'Escape the maze on time.',
    scene: 'img/scenes/l3.webp',
    music: 'l3',
    outro: [
      { who: 'wes', text: "Here. Sweats and my hoodie. They're clean, I swear." },
      { who: 'liz', text: 'Thanks, Wes. This is the worst night of my life.', mood: 'sad' },
      { who: 'michael', text: 'Liz? Was that you who got puked on? Rough.' },
      { who: 'liz', text: "Okay. New plan. What if we pretend to date? You talk me up, Michael gets jealous, and I finally get my moment." },
      { who: 'wes', text: "Fake-dating Liz Buxbaum. What could possibly go wrong?" },
      { who: 'helena', text: "Liz, honey, is that Wes's hoodie? It looks cute on you.", mood: 'happy' },
    ],
    failLine: { who: 'wes', text: 'Too many people! Liz is still waiting. Try again.' },
  },
  l4: {
    id: 'l4',
    kind: 'level',
    label: 'Level 4',
    title: 'Dress to Impress',
    chapter: 'Chapter 5',
    basedOn: 'Dress To Impress',
    year: '2021',
    location: 'mall',
    playAs: 'wes',
    narration: [
      "After Michael made a comment about thinking Libby's 'cute dress' was a uniform, I wanted to make it up to her. I decided to take her to the mall to step up her wardrobe.",
      'We spent hours picking out outfits while I planned to surprise her with a new pair of Chuck Taylors.',
      "I decided to take this as a small step towards my ultimate goal: win over Libby's heart.",
    ],
    howTo: [
      'Pick an outfit for Liz that fits the theme. You have 2 minutes per round.',
      'Three rounds. Jocelyn, Liz\'s best friend, judges every look out of 5 stars.',
      'Get 5 stars in at least two of the three rounds to win her blessing.',
    ],
    requires: ['l2'],
    song: 'lovers',
    item: 'boombox',
    itemRule: 'Get five stars in at least two of the three rounds.',
    scene: 'img/scenes/l4.webp',
    music: 'l4',
    outro: [
      { who: 'jocelyn', text: "So are you two, like, a thing now?" },
      { who: 'liz', text: "What? No! I mean… it's complicated. Don't ask.", mood: 'sad' },
      { who: 'jocelyn', text: "Okay, Bennett. I see you. You actually get her.", mood: 'happy' },
      { who: 'jocelyn', text: "You have my blessing. Don't make me regret it." },
      { who: 'liz', text: "Wait, what blessing? Joss, what are you talking about?" },
    ],
    failLine: { who: 'jocelyn', text: "Hmm. That's not her. Try again, Bennett.", mood: 'mad' },
  },
  l5: {
    id: 'l5',
    kind: 'level',
    label: 'Level 5',
    title: 'Mrs. Potato Head',
    chapter: 'Chapter 6',
    basedOn: 'Dodgeball',
    year: '2021',
    location: 'gym',
    playAs: 'liz',
    narration: [
      'After I renewed Libby\'s wardrobe for Michael, I picked her up to take her to a basketball game where Michael would meet us.',
      'When the game ended, the boys and I decided to sneak into the gym and shoot some hoops. Everyone seemed to have a good time while I watched Liz flirt with Michael, until that turned into a huge mess.',
      'My friend Noah tried passing the ball and ended up hitting Liz right in the nose. I quickly helped her up and took her to the hospital because her nose looked broken.',
      'Since her nose had swollen up, my friends and I got another awesome opportunity to tease Mrs. Potato Head.',
    ],
    howTo: [
      'This time you play as Liz! Basketballs are flying across the gym.',
      'Drag your finger to move. Dodge every ball for 10 rounds.',
      'Each round the balls get faster. Make it through without a hit to earn a prize.',
    ],
    requires: ['l2'],
    song: 'electric',
    item: 'cap',
    itemRule: 'Make it through all ten rounds without getting hit.',
    scene: 'img/scenes/l5.webp',
    music: 'l5',
    outro: [
      { who: 'liz', text: 'Ten rounds and not a scratch. Did you see that, Michael?', mood: 'happy' },
      { who: 'michael', text: 'Nice moves, Liz.' },
      { who: 'wes', text: "Show-off. Here, you earned my lucky cap." },
    ],
    outroAlt: [
      { who: 'noah', text: 'OH NO. Liz, I am so sorry!' },
      { who: 'wes', text: "I've got you. Come on, we're going to the hospital." },
      { who: 'liz', text: 'Is it bad? Tell me the truth.', mood: 'sad' },
      { who: 'wes', text: "You look great, Mrs. Potato Head. Truly. A vision." },
      { who: 'helena', text: 'Thank you for taking care of her, Wes. Really.', mood: 'happy' },
      { who: 'helena', text: "Between you and me, Liz? That boy is your other half. Everyone can see it but you.", mood: 'happy' },
    ],
  },
  l6: {
    id: 'l6',
    kind: 'level',
    label: 'Level 6',
    title: 'Ketchup Illustrations',
    chapter: 'Chapter 10',
    basedOn: 'Drawing game',
    year: '2021',
    location: 'stellas',
    playAs: 'wes',
    narration: [
      "Liz and I wanted to go to Michael's house for a movie after her nose was fully healed, but we wanted to go to dinner first.",
      "I took Liz to her favorite restaurant, and in my opinion the best burger place in town, Stella's.",
      'When we arrived, I asked Liz why she was writing her initials on a napkin with a heart around it in ketchup. She told me it was something she used to do in her childhood and begged me to do it as well, to go down memory lane.',
      "I joined her and we both had a great time before going to Michael's house for a movie. I hope this will help show her that I am the one for her.",
    ],
    howTo: [
      'Draw with ketchup! Hold your finger down to squeeze the bottle.',
      'The bottle is high up, so the ketchup lands a moment later. Plan ahead!',
      'Copy five drawings. Libby rates each one on how close it is to the original.',
    ],
    requires: ['l2'],
    song: 'weareyoung',
    item: 'jersey',
    itemRule: 'Get a high rating on all five drawings.',
    scene: 'img/scenes/l6.webp',
    music: 'l6',
    outro: [
      { who: 'liz', text: "Okay, that heart is actually adorable. Who knew Wes Bennett was an artist?", mood: 'happy' },
      { who: 'wes', text: "Ketchup is my medium. I'm very misunderstood." },
      { who: 'michael', text: "You guys coming? Movie's starting." },
    ],
  },
  boss: {
    id: 'boss',
    kind: 'boss',
    label: 'Boss Level',
    title: 'Parking Ever After',
    chapter: 'Chapter 18',
    basedOn: 'Magic Tiles 3',
    year: '2021',
    location: 'parking',
    playAs: 'wes',
    narration: [
      "Liz and I didn't end up going to homecoming together, but I still had a plan to win her over. I was waiting for her drive home so that I could make my move.",
      'I was planning on telling her that I have been in love with her since the second grade, when I realized her eyes are the most beautiful things I\'ve ever seen.',
      "I would tell her how much I love the way her eyes transform whenever she talks about music, or how she's the type of funny that makes you want to spit out your drink.",
      "I feel like I'd do anything just to get her gaze up at me the way she does.",
    ],
    howTo: [
      'Tap the tiles in time with the beat as they reach the bottom.',
      'Every tile you hit builds one more piece of your confession rap.',
      'Collect enough points to finish the confession. Libby is listening…',
    ],
    requires: ['l3', 'l4', 'l5', 'l6'],
    song: 'paradise',
    scene: 'img/scenes/boss.webp',
    music: 'boss',
    outro: [
      { who: 'liz', text: 'Wes…', mood: 'happy' },
      { who: 'liz', text: 'Just shut up and kiss me.', mood: 'happy' },
    ],
    failLine: { who: 'wes', text: 'My palms are sweaty… I choked. One more shot.' },
  },
  sq1: {
    id: 'sq1',
    kind: 'side',
    label: 'Side Quest',
    title: 'Not the Hollywood Version',
    chapter: 'Self-acceptance',
    basedOn: 'Date choices',
    year: '2021',
    location: 'wesCar',
    playAs: 'wes',
    narration: [
      'Liz has spent a lot of time and energy changing herself for her childhood crush instead of accepting herself.',
      "I'm taking her to dinner, and I'm making sure it's not the Hollywood-perfect version she's expecting. No violins. No rose petals. Just us.",
      "If Michael can't see that she's perfect just the way she is, that's his loss.",
    ],
    howTo: [
      'At each moment of the date, choose what Wes does.',
      'Be the real Wes, not a movie cliché. Fake moves cost a heart.',
      'Your equipped item helps: use it with the item button.',
    ],
    requires: ['l6'],
    song: 'someonelikeyou_vm',
    scene: 'img/scenes/sq1.webp',
    music: 'sq1',
    outro: [
      { who: 'liz', text: 'You know what? You treated me exactly like you always do.', mood: 'happy' },
      { who: 'liz', text: "I didn't have to be anybody else tonight. Thanks, Wes." },
    ],
    failLine: { who: 'liz', text: "Wes, who ARE you right now? This feels like a movie set.", mood: 'mad' },
  },
  sq2: {
    id: 'sq2',
    kind: 'side',
    label: 'Side Quest',
    title: 'Letting Go',
    chapter: 'Moving forward',
    basedOn: 'Puzzle series',
    year: '2021',
    location: 'lizHouse',
    playAs: 'wes',
    narration: [
      "Liz and Helena don't get along easily, because Libby is afraid that if she becomes close with Helena, she will forget about her late mother.",
      "I want to show Liz that the only way for her to grow is to accept that she can't hold tightly onto past memories just to avoid the pain of the present.",
      "Helena isn't trying to replace her mom. She just wants to be her friend.",
    ],
    howTo: [
      'Solve a series of three puzzles with Liz and Helena.',
      'Mistakes cost hearts. Run out and you start over.',
      'Your equipped item helps: the cap gives a hint, the bat skips a puzzle.',
    ],
    requires: ['l4'],
    song: 'river',
    scene: 'img/scenes/sq2.webp',
    music: 'sq2',
    outro: [
      { who: 'helena', text: "I'm never going to replace her, Liz. I just want to know you.", mood: 'happy' },
      { who: 'liz', text: "I know. I think… I think she would've liked you." },
      { who: 'wes', text: "Told you. I'm always right here, Buxbaum. Always." },
    ],
    failLine: { who: 'liz', text: "I can't do this right now.", mood: 'sad' },
  },
  sq3: {
    id: 'sq3',
    kind: 'side',
    label: 'Side Quest',
    title: 'The Moldy Car',
    chapter: 'The thunderstorm',
    basedOn: 'Storm dash',
    year: '2021',
    location: 'secret',
    playAs: 'wes',
    narration: [
      "There's a thunderstorm, and I can see that Libby's car door window is wide open.",
      'She has to drive to work early tomorrow morning. If I leave it, her seats will be soaked.',
      "So I'm going out there. In the storm. For a car. That isn't even mine.",
    ],
    howTo: [
      "Dash across the yards to Liz's car before the seats get soaked.",
      'Lightning strikes where the ground glows. Fallen branches block the way.',
      'Reach the car and hold the button to roll up the window.',
    ],
    requires: ['l3'],
    song: 'badliar',
    scene: 'img/scenes/sq3.webp',
    music: 'sq3',
    outro: [
      { who: 'liz', text: "Wes? It's pouring! What are you doing out here?" },
      { who: 'wes', text: "I just didn't want your moldy car ruining the property value of the whole neighborhood, Buxbaum." },
      { who: 'narrator', text: 'Libby thought about what he said all night.' },
    ],
    failLine: { who: 'wes', text: "Ugh, soaked. Let's try that again." },
  },
};

/** Main story order (side quests are optional). */
export const STORY_ORDER: LevelId[] = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'boss'];
export const SIDE_QUESTS: LevelId[] = ['sq1', 'sq2', 'sq3'];

export const PROLOGUE: string[] = [
  'Omaha, Nebraska. 2021.',
  'Liz Buxbaum has always believed in rom-com love. She has been waiting her whole life for her own Mark Darcy, and she is pretty sure it is Michael.',
  'But this story is not hers. It is mine.',
  "I'm Wes Bennett, the boy next door. And I've been in love with Liz since the second grade.",
  "To find out how we got here, we have to go back about ten years…",
];

export const CHUCKS_REVEAL: DialogueLine[] = [
  { who: 'wes', text: "Wait, what's this in the back of my car?" },
  { who: 'wes', text: "Chuck Taylors. With a note: 'For the boy next door. You deserve a pair too. —Liz'" },
  { who: 'narrator', text: 'Wes found the hidden Chuck Taylors! Equip them to move at double speed.' },
];

export const ENDING: string[] = [
  'Libby always waited for the grand romantic gestures, the kind she grew up watching in rom-coms.',
  'What she never noticed were the small ones. The spare clothes. The rides to the hospital. A car window closed in the rain.',
  'That night in the parking spot, Liz finally realized that Wes, not Michael, was her real-life Mark Darcy.',
  "True love isn't like the movies. It's messy, and it's built on communication, trust, and being brave enough to be vulnerable.",
  "It's better than the movies.",
];

/** Samira's own words from the deck, shown on the "About this game" page. */
export const ABOUT_GAME: Array<{ heading: string; body: string[] }> = [
  {
    heading: 'About the game',
    body: [
      "My video game is a mini game RPG called The Soundtrack of Wes and Liz. It follows Lynn Painter's Better Than The Movies, which is told from the viewpoint of Elizabeth Buxbaum. The video game will allow Wesley Bennett to finally have his time to shine.",
      'Wes has been in love with Liz since the second grade. The objective of the game is for Wesley to win over the heart of Elizabeth. Wes will do this by completing mini games and claiming rewards throughout the levels. Libby will have the task of deciding whether Wes is her real life Mark Darcy from Pride and Prejudice.',
      "The setting of this game takes place in the year 2021 in the town of Omaha, Nebraska. The first couple puzzles take place about ten years in the past, around when the two characters first met. Once the first puzzles are completed, numerous other locations will be unlocked around town, including the school, the mall, Ryno's house, and a restaurant.",
    ],
  },
  {
    heading: 'Characters and plot',
    body: [
      "The Soundtrack of Wes and Liz contains the entire storyline of Better Than The Movies in Wesley's perspective, which adds an unexpected twist to the narrative. It shares hidden ideas that Libby was oblivious to for longer than she should have been.",
      'Libby likes a boy named Michael and asks Wes for his help to win him over. Wes and Liz pretend to date so that Wes can talk her up. You play as Wesley, the main character who has to brave his love rival, Michael, in order to win Libby\'s love as the ultimate prize.',
      "Jocelyn is Libby's best friend who doesn't approve of Michael and has a suspicion that Liz might be falling for Wes. Helena is Libby's stepmother, who Liz doesn't get along with at the beginning because she is afraid of Helena trying to replace her late mother. Lastly, Liz will decide if Wes really is better than her crush since kindergarten.",
    ],
  },
  {
    heading: 'Main character',
    body: [
      'The player controls Wesley Bennett, an eighteen-year-old senior in high school. Wes is tall and has an athletic build, dark messy hair, dark brown eyes and a defined jawline, and he usually wears a mischievous smirk on his face.',
      'He is a very talented baseball player and plans on pursuing it as a career in the near future. Wesley has many redeeming qualities and strengths, including being trustworthy, empathetic, remorseful, kind and loyal.',
      "Bennett's fatal flaw is that he is deathly afraid of clowns.",
      "Wesley has a baseball cap, baseball bat, boombox and his number 32 jersey in his inventory, each of which he can equip only once. The cap gives the player hints, the bat skips an obstacle, the boombox makes him invincible for thirty seconds, and the jersey gives him another life. Wesley's favorite pair of shoes, which he once bought for Libby, are Chuck Taylors. The player must find the hidden pair somewhere in the game to move at double speed.",
    ],
  },
  {
    heading: 'NPCs',
    body: [
      "Michael has been Libby's dreamboat since childhood, which means Wes has some serious competition. Wesley's love rival appears in the mini games as well as in the narrations between each level.",
      "Helena, Libby's stepmother, shows up in some of the narrations. Once Libby recognized that Helena was only trying to be her friend instead of replacing her late mother, they got along just fine. Helena personally thinks Wes should become Libby's other half.",
      "Jocelyn is Libby's best friend, who doesn't think Michael is the one for Liz and instead believes Libby's true love should be Wesley. Wesley has to get Jocelyn's blessing to continue his pursuit of Libby's heart, by passing one of the game's hardest levels, conducted by none other than Jocelyn.",
      'The final NPC is Elizabeth Buxbaum herself. Liz spent most of her childhood watching rom-coms, so this is her moment to decide whether Wesley Bennett is her Mark Darcy from Pride and Prejudice.',
    ],
  },
  {
    heading: 'Theme',
    body: [
      'The main theme in Better than the Movies by Lynn Painter is that true love is built on communication, mutual trust, and vulnerability. Liz has always waited for grand romantic gestures from her childhood crush, Michael. What Libby never noticed were the small but significant ones that Wes always conveyed toward her.',
      "Liz had to realize that it's not the grand gestures that matter, it's the small but expressive indications that really build a strong relationship. True love isn't like those rom-coms she grew up watching; true love is built on respect, trust, empathy, and long-term commitment.",
      'Other themes are that self acceptance is important, and that holding onto memories of the past will not help save you from any pain in the present. The side quests of the game explain these themes so that the player truly understands the message.',
    ],
  },
  {
    heading: 'Reflection',
    body: [
      "The hardest part about adapting my novel into a video game was that the quiet scenes couldn't be added, or else the player wouldn't have any mini games to play. In the original story, Liz was the one who started the confession instead of Wes. I changed this in the video game because Wes was supposed to be the one who goes through all this effort in order to show Liz that he is worthy of her love.",
      "Lynn Painter wanted readers to understand that real-life human connections are messier, more authentic, and better than how the movies try to convey love. The video game preserves this message by making it known that Liz was always waiting for the perfect Hollywood-type romance until she herself realized, with the help of Wesley, that true love isn't perfect and it is messy, but it's also much better than what the movies promote it to be.",
    ],
  },
];

/** The confession rap from the deck, set to the boss level's beat. */
export const CONFESSION_RAP: string[] = [
  'Look, if you had one shot or one opportunity',
  'To seize the love you always wanted in one moment',
  'Would you capture it or just let her slip? Yo!',
  'My palms are sweaty, knees weak, arms are heavy',
  "There's somethin' 'bout your hair all reddish, bright, confetti",
  "I'm nervous, but on the surface I look calm and ready",
  'To tell you, but I keep on forgetting',
  'What I wrote down, the whole world goes so loud',
  "I open my mouth, but the words won't come out",
  "She's in front now, what will I say now",
  "The clock's run out, time's up, over, blaow!",
  'Snap back to reality, ope, there goes gravity',
  "Ope, there goes habit, I choke, I'm so mad",
  "But I won't give up that easy, no, I won't have it",
  "I know she ain't ya, she's co-mical but",
  "Not spit out all ya' pop in astonishment",
  'I know when I come back to this, my home',
  "That's when it's back to this parking lot, yo",
  'This old rhapsody, better go capture this moment',
  "And hope she don't pass me",
];

export const CREDITS: Array<[string, string]> = [
  ['Game design', 'Samira Cubas'],
  ['Based on', 'Better Than the Movies by Lynn Painter'],
  ['Starring', 'Wesley Bennett & Elizabeth Buxbaum'],
  ['With', 'Michael, Jocelyn & Helena'],
  ['Soundtrack', 'The Liz and Wes Playlist'],
];

export const SPEAKER_NAMES: Record<Speaker, string> = {
  wes: 'Wes',
  liz: 'Liz',
  'wes-kid': 'Wes (age 7)',
  'liz-kid': 'Libby (age 7)',
  michael: 'Michael',
  jocelyn: 'Jocelyn',
  helena: 'Helena',
  noah: 'Noah',
  ryno: 'Ryno',
  narrator: '',
};
