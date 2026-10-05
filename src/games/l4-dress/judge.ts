/**
 * Jocelyn's judging. Deterministic and explainable: five checks, one star
 * each, and she always says which check failed and why.
 *
 *   1. Complete look  top + bottoms (or a dress) and shoes
 *   2. Fits the theme every main piece fits, and one is a favourite (an
 *                     outer layer counts: a cardigan can make a dress cozy)
 *   3. Right shoes    the shoes fit the theme (Chuck Taylors fit anything)
 *   4. Colors work    no clashing pair, at most two bright colours, and the
 *                     theme's colours if it has any (school colours; hair
 *                     ties and props count for those)
 *   5. Hair & accessory  the hairstyle fits, and one accessory is a theme
 *                     favourite (and none clash)
 *
 * A look that is unfinished (no outfit or no shoes), or whose main piece
 * clashes with the theme, is capped at 2 stars. Every look gets at least 1.
 */
import { NEUTRALS, item, variantOf, type ColorFamily, type Item, type Outfit, type Pick, type Tag } from './wardrobe';

export type ThemeId = 'game' | 'movie' | 'liz';

export interface Theme {
  id: ThemeId;
  title: string;
  /** Theme card line under the title. */
  sub: string;
  /** Style hint on the theme card. */
  hint: string;
  /** "isn't giving ___" */
  vibe: string;
  love: Tag[];
  ok: Tag[];
  avoid: Tag[];
  /** At least one worn piece must be one of these colours. */
  colors?: ColorFamily[];
  colorsMissing?: string;
  /** "{a sequin dress} to a basketball game?" */
  clash: (what: string) => string;
  perfect: string;
}

export const THEMES: Theme[] = [
  {
    id: 'game',
    title: 'Basketball game',
    sub: 'Michael will be there',
    hint: 'Sporty and casual. Wear the school colors: blue or gold.',
    vibe: 'game day',
    love: ['sporty'],
    ok: ['casual'],
    avoid: ['glam', 'edgy'],
    colors: ['blue', 'yellow'],
    colorsMissing: 'where are the school colors? Blue or gold, Bennett!',
    clash: (w) => `${w} to a basketball game?`,
    perfect: "Game-day cute! Michael isn't going to watch a single play.",
  },
  {
    id: 'movie',
    title: "Movie night at Michael's",
    sub: 'Popcorn and a couch',
    hint: 'Cozy and cute. Comfy enough for the couch.',
    vibe: 'movie night',
    love: ['cozy'],
    ok: ['cute', 'casual', 'romantic'],
    avoid: ['glam', 'edgy'],
    clash: (w) => `${w} for a movie on Michael's couch?`,
    perfect: 'Cozy, cute and couch-ready. Michael is going to notice.',
  },
  {
    id: 'liz',
    title: 'Just be Liz',
    sub: 'Forget Michael for a second',
    hint: 'Her own style: vintage, romantic, florals.',
    vibe: 'Liz',
    love: ['romantic', 'vintage', 'floral'],
    ok: ['cute', 'cozy'],
    avoid: ['sporty', 'edgy', 'glam'],
    clash: (w) => `${w}? That's not her at all.`,
    perfect: 'Now THAT is my Liz.',
  },
];

export type Fit = 'love' | 'ok' | 'meh' | 'avoid';

/** How one item fits a theme. A favourite tag wins over a clashing one. */
export function fit(it: Item, th: Theme): Fit {
  if (it.tags.includes('chucks')) return 'love';
  if (it.tags.some((t) => th.love.includes(t))) return 'love';
  if (it.tags.some((t) => th.avoid.includes(t))) return 'avoid';
  if (it.tags.some((t) => th.ok.includes(t))) return 'ok';
  return 'meh';
}
const fits = (f: Fit) => f === 'love' || f === 'ok';

export type CheckId = 'complete' | 'theme' | 'shoes' | 'colors' | 'touch';

export interface Check {
  id: CheckId;
  label: string;
  ok: boolean;
  /** Short reason for the scorecard. */
  why: string;
}

export interface Verdict {
  stars: number;
  checks: Check[];
  comment: string;
  mood: 'happy' | 'neutral' | 'mad';
  chucks: boolean;
}

/** Clashing colour pairs (her copper hair is the statement already). */
const CLASHES: Array<[ColorFamily, ColorFamily]> = [
  ['red', 'pink'],
  ['red', 'green'],
];
const COLOR_WORD: Partial<Record<ColorFamily, string>> = { yellow: 'gold', purple: 'lavender' };
const colorWord = (c: ColorFamily) => COLOR_WORD[c] ?? c;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "a hoodie", "an ...", "heels". */
function a(it: Item): string {
  if (it.plural) return it.short;
  return (/^[aeiou]/i.test(it.short) ? 'an ' : 'a ') + it.short;
}
const isAre = (it: Item) => (it.plural ? 'are' : 'is');
const orList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);

export const WINK = 'And Chuck Taylors? Classic. I see what you did there, Bennett.';

/** Judge an outfit against a theme. Pure. */
export function judge(o: Outfit, th: Theme): Verdict {
  const I = (p: Pick | null) => (p ? item(p.id) : null);
  const core: Item[] = o.dress ? [I(o.dress)!] : ([I(o.top), I(o.bottom)].filter(Boolean) as Item[]);
  const shoes = I(o.shoes);
  const hair = item(o.hair.id);
  const extras = o.extras.map((p) => item(p.id));
  const coreComplete = !!o.dress || (!!o.top && !!o.bottom);
  const chucks = o.shoes?.id === 'chucks';

  // 1. complete
  let completeWhy = o.dress ? 'Dress and shoes' : 'Top, bottoms and shoes';
  let completeSay = '';
  if (!o.dress && !o.top && !o.bottom) {
    completeWhy = 'Still in her basics';
    completeSay = "she's still in her basics! A top and bottoms, or a dress.";
  } else if (!coreComplete) {
    completeWhy = o.top ? 'No bottoms' : 'No top';
    completeSay = o.top ? 'she needs bottoms. Or try a dress.' : 'she needs a top. Or try a dress.';
  } else if (!shoes) {
    completeWhy = 'No shoes';
    completeSay = "she's barefoot! Shoes, Bennett.";
  }
  const complete = coreComplete && !!shoes;

  // 2. theme
  const coreFits = core.map((it) => ({ it, f: fit(it, th) }));
  const clash = coreFits.find((c) => c.f === 'avoid')?.it ?? null;
  const meh = coreFits.find((c) => c.f === 'meh')?.it ?? null;
  const outer = extras.filter((e) => e.slot === 'outer');
  const loved = coreFits.find((c) => c.f === 'love')?.it ?? outer.find((e) => fit(e, th) === 'love') ?? null;
  const themeOk = core.length > 0 && !clash && !meh && !!loved;
  let themeWhy = `Totally ${th.vibe}`;
  let themeSay = '';
  if (core.length === 0) {
    themeWhy = 'Nothing to judge yet';
    themeSay = completeSay;
  } else if (clash) {
    themeWhy = `${cap(clash.short)} ${clash.plural ? 'clash' : 'clashes'}`;
    themeSay = clash.quip?.[th.id] ?? th.clash(a(clash));
  } else if (meh) {
    themeWhy = `${cap(meh.short)} ${meh.plural ? "don't" : "doesn't"} fit`;
    themeSay = meh.quip?.[th.id] ?? `the ${meh.short} ${isAre(meh)}n't giving ${th.vibe}.`;
  } else if (!loved) {
    themeWhy = `Needs something ${orList(th.love)}`;
    themeSay = `her outfit needs something ${orList(th.love)}.`;
  }

  // 3. shoes
  const shoeFit = shoes ? fit(shoes, th) : 'meh';
  const shoesOk = !!shoes && fits(shoeFit);
  let shoesWhy = shoes ? `${cap(shoes.short)} work` : 'No shoes';
  let shoesSay = "she's barefoot! Shoes, Bennett.";
  if (shoes && !shoesOk) {
    shoesWhy = `${cap(shoes.short)} ${shoes.plural ? "don't" : "doesn't"} fit`;
    shoesSay = shoeFit === 'avoid' ? th.clash(a(shoes)) : `${a(shoes)} ${shoes.plural ? "don't" : "doesn't"} really go with ${th.vibe}.`;
  }

  // 4. colours: clothes, shoes and wearable extras. Hair ties and props
  // (popcorn, foam finger, face paint) only count towards school colours.
  const wearColors = new Set<ColorFamily>();
  const allColors = new Set<ColorFamily>();
  for (const p of [o.hair, o.top, o.bottom, o.dress, o.shoes, ...o.extras]) {
    if (!p) continue;
    const cs = variantOf(p).colors;
    const prop = item(p.id).cat === 'hair' || ['held', 'face'].includes(item(p.id).slot ?? '');
    for (const c of cs) {
      allColors.add(c);
      if (!prop) wearColors.add(c);
    }
  }
  const brights = [...wearColors].filter((c) => !NEUTRALS.includes(c));
  const pair = CLASHES.find(([x, y]) => wearColors.has(x) && wearColors.has(y));
  const themeColor = !th.colors || th.colors.some((c) => allColors.has(c));
  let colorsWhy = 'Colors go together';
  let colorsSay = '';
  if (pair) {
    colorsWhy = `${cap(colorWord(pair[0]))} + ${colorWord(pair[1])} clash`;
    colorsSay = `${colorWord(pair[0])} and ${colorWord(pair[1])}? They're fighting each other.`;
  } else if (brights.length > 2) {
    colorsWhy = 'Too many colors';
    colorsSay = "that's a lot of colors at once. Pick two.";
  } else if (!themeColor) {
    colorsWhy = 'No school colors';
    colorsSay = th.colorsMissing ?? '';
  }
  const colorsOk = !pair && brights.length <= 2 && themeColor && wearColors.size > 0;
  if (wearColors.size === 0) {
    colorsWhy = 'Nothing to judge yet';
    colorsSay = completeSay;
  }

  // 5. hair & accessory
  const hairFit = fit(hair, th);
  const goodExtra = extras.find((e) => fit(e, th) === 'love') ?? null;
  const badExtra = extras.find((e) => fit(e, th) === 'avoid') ?? null;
  const touchOk = fits(hairFit) && !!goodExtra && !badExtra;
  let touchWhy = goodExtra ? `${cap(hair.short)} + ${goodExtra.short}` : '';
  let touchSay = '';
  if (!fits(hairFit)) {
    touchWhy = `${cap(hair.short)} ${hair.plural ? "don't" : "doesn't"} fit`;
    touchSay =
      hairFit === 'avoid'
        ? `${a(hair)}? Not for ${th.vibe}. Change her hair.`
        : `the ${hair.short} ${isAre(hair)}n't ${th.vibe}. Try another hairstyle.`;
  } else if (badExtra) {
    touchWhy = `Lose the ${badExtra.short}`;
    touchSay = `lose the ${badExtra.short}.`;
  } else if (!goodExtra) {
    touchWhy = extras.length ? `No ${th.vibe} accessory` : 'No accessory';
    touchSay = extras.length
      ? `the ${extras[0].short} ${extras[0].plural ? "don't" : "doesn't"} say ${th.vibe}. Try another extra.`
      : `she needs an accessory that says ${th.vibe}. Check the Extras.`;
  }

  const checks: Check[] = [
    { id: 'complete', label: 'Complete look', ok: complete, why: completeWhy },
    { id: 'theme', label: 'Fits the theme', ok: themeOk, why: themeWhy },
    { id: 'shoes', label: 'Right shoes', ok: shoesOk, why: shoesWhy },
    { id: 'colors', label: 'Colors work', ok: colorsOk, why: colorsWhy },
    { id: 'touch', label: 'Hair & accessory', ok: touchOk, why: touchWhy },
  ];

  let stars = checks.filter((c) => c.ok).length;
  if (!complete || clash) stars = Math.min(stars, 2);
  stars = Math.max(1, stars);

  // What she says: praise a favourite piece, then the first thing that's wrong.
  const says: Record<CheckId, string> = { complete: completeSay, theme: themeSay, shoes: shoesSay, colors: colorsSay, touch: touchSay };
  let comment: string;
  if (stars === 5) {
    comment = th.perfect;
    if (th.id === 'liz' && o.dress?.id === 'collardress') comment = `The dress Michael called a uniform? It's vintage, and it's HER. ${th.perfect}`;
  } else {
    // An unfinished look is the first thing she sees, then a clash.
    const first = !coreComplete ? checks[0] : clash ? checks[1] : checks.find((c) => !c.ok)!;
    const critique = says[first.id] || completeSay;
    // (never praise an accessory for the vibe the outfit is missing)
    const favExtra = first.id === 'theme' ? null : extras.find((e) => fit(e, th) === 'love');
    const favShoes = shoes && !chucks && fit(shoes, th) === 'love' ? shoes : null;
    const fav = loved ?? favShoes ?? favExtra ?? null;
    comment = fav ? `Love the ${fav.short}, but ${critique}` : cap(critique);
  }
  if (chucks) comment += ` ${WINK}`;

  return { stars, checks, comment, mood: stars === 5 ? 'happy' : stars <= 2 ? 'mad' : 'neutral', chucks };
}
