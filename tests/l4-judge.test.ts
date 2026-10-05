import { describe, expect, it } from 'vitest';
import { dollSvg, thumbSvg } from '../src/games/l4-dress/doll';
import { THEMES, WINK, fit, judge, type ThemeId } from '../src/games/l4-dress/judge';
import { ITEMS, emptyOutfit, item, itemsIn, outfitFrom, takeOff, wear, type Outfit, type OutfitSpec } from '../src/games/l4-dress/wardrobe';

const theme = (id: ThemeId) => THEMES.find((t) => t.id === id)!;
const score = (spec: OutfitSpec, id: ThemeId) => judge(outfitFrom(spec), theme(id));

/** Thoughtful looks a player can build in a handful of taps. */
const FIVE_STAR: Record<ThemeId, OutfitSpec[]> = {
  game: [
    { hair: 'ponytail', top: 'teamtee:0', bottom: 'jeans', shoes: 'chucks', extras: ['foamfinger'] },
    { hair: 'pigtails', top: 'hoodie:1', bottom: 'joggers:0', shoes: 'sneakers:0', extras: ['facepaint'] },
    { hair: 'bun', dress: 'jerseydress:0', shoes: 'chucks', extras: ['crossbody:0', 'foamfinger'] },
    { hair: 'ponytail:1', top: 'hoodie:0', bottom: 'jeans', shoes: 'sneakers:2', extras: ['foamfinger:1'] },
  ],
  movie: [
    { hair: 'braid', top: 'sweater:0', bottom: 'joggers:0', shoes: 'boots:0', extras: ['cardigan:0'] },
    { hair: 'bun', top: 'hoodie:2', bottom: 'cords:0', shoes: 'chucks', extras: ['popcorn'] },
    { hair: 'halfbow', dress: 'gingham:0', shoes: 'flats:0', extras: ['cardigan:0', 'headphones:1'] },
    { hair: 'waves', top: 'stripetee:0', bottom: 'cords:0', shoes: 'maryjanes:1', extras: ['popcorn'] },
  ],
  liz: [
    { hair: 'waves', dress: 'sundress:0', shoes: 'flats:0', extras: ['cardigan:0'] },
    { hair: 'halfbow', top: 'blouse:0', bottom: 'floralskirt:0', shoes: 'maryjanes:2', extras: ['pearls'] },
    { hair: 'waves', dress: 'collardress:0', shoes: 'chucks', extras: ['headphones'] },
    { hair: 'braid', dress: 'gingham:1', shoes: 'flats:1', extras: ['pearls'] },
  ],
};

describe('L4 judging: five-star looks', () => {
  for (const th of THEMES) {
    FIVE_STAR[th.id].forEach((spec, i) => {
      it(`${th.id} look #${i + 1} gets 5 stars`, () => {
        const v = score(spec, th.id);
        expect(v.checks.filter((c) => !c.ok)).toEqual([]);
        expect(v.stars).toBe(5);
        expect(v.mood).toBe('happy');
      });
    });
  }

  it('the "Just be Liz" five-star line is "Now THAT is my Liz."', () => {
    expect(score(FIVE_STAR.liz[0], 'liz').comment).toBe('Now THAT is my Liz.');
  });

  it('the dress Michael called a uniform gets its own line in round 3', () => {
    expect(score(FIVE_STAR.liz[2], 'liz').comment).toMatch(/called a uniform.*Now THAT is my Liz/);
  });
});

describe('L4 judging: mismatched looks', () => {
  const BAD: Array<[ThemeId, OutfitSpec, number]> = [
    // [theme, look, max stars]
    ['game', { hair: 'waves', dress: 'sequindress:0', shoes: 'heels:0', extras: [] }, 2],
    ['game', { hair: 'waves', dress: 'sundress:0', shoes: 'flats:0', extras: ['cardigan:0'] }, 3],
    ['game', { hair: 'ponytail', top: 'hoodie:1', bottom: 'joggers:0', shoes: 'heels:0', extras: ['foamfinger'] }, 4],
    ['movie', { hair: 'ponytail', top: 'sequintop:1', bottom: 'leather', shoes: 'heels:1' }, 2],
    ['movie', { hair: 'pigtails', dress: 'jerseydress:0', shoes: 'sneakers:0', extras: ['foamfinger'] }, 3],
    ['liz', { hair: 'ponytail', top: 'hoodie:0', bottom: 'joggers:0', shoes: 'sneakers:0', extras: ['foamfinger'] }, 2],
    ['liz', { hair: 'pigtails', top: 'teamtee:0', bottom: 'jeans', shoes: 'chucks', extras: ['facepaint'] }, 2],
    ['liz', { hair: 'waves', top: 'blouse:0', bottom: 'jeans', shoes: 'sneakers:0', extras: ['denimjacket'] }, 3],
  ];
  BAD.forEach(([th, spec, max], i) => {
    it(`${th} mismatch #${i + 1} scores at most ${max}`, () => {
      const v = score(spec, th);
      expect(v.stars).toBeLessThanOrEqual(max);
      expect(v.stars).toBeLessThanOrEqual(3 + (max > 3 ? 1 : 0));
      expect(v.checks.some((c) => !c.ok)).toBe(true);
    });
  });

  it('Jocelyn explains: hoodie with heels at the game', () => {
    const v = score({ hair: 'ponytail', top: 'hoodie:1', bottom: 'joggers:0', shoes: 'heels:0', extras: ['foamfinger'] }, 'game');
    expect(v.comment).toBe('Love the hoodie, but heels to a basketball game?');
    expect(v.stars).toBe(4);
  });

  it('basics only is the lowest score, and she says so', () => {
    for (const th of THEMES) {
      const v = judge(emptyOutfit(), th);
      expect(v.stars).toBe(1);
      expect(v.mood).toBe('mad');
      expect(v.comment).toMatch(/basics/);
    }
  });

  it('missing school colors costs a star at the game', () => {
    // red tee, pink scrunchie, no props: the colour check is the first failure
    const v = score({ hair: 'ponytail:2', top: 'teamtee:2', bottom: 'jeans', shoes: 'chucks' }, 'game');
    expect(v.stars).toBe(3);
    expect(v.checks.find((c) => c.id === 'colors')!.ok).toBe(false);
    expect(v.comment).toMatch(/school colors/);
  });

  it('a blue scrunchie counts as school colors, but hair never clashes', () => {
    expect(score({ hair: 'ponytail:0', top: 'teamtee:2', bottom: 'jeans', shoes: 'chucks', extras: ['crossbody:0'] }, 'game').checks.find((c) => c.id === 'colors')!.ok).toBe(true);
    expect(score({ hair: 'halfbow:2', dress: 'sundress:0', shoes: 'flats:0', extras: ['cardigan:0'] }, 'liz').stars).toBe(5);
  });

  it('barefoot looks are capped at 2', () => {
    const v = score({ hair: 'ponytail', top: 'teamtee:0', bottom: 'jeans', extras: ['foamfinger'] }, 'game');
    expect(v.stars).toBe(2);
    expect(v.comment).toMatch(/barefoot/);
  });

  it('the wrong hair gets one clear note', () => {
    const v = score({ hair: 'waves', top: 'teamtee:0', bottom: 'jeans', shoes: 'chucks', extras: ['foamfinger'] }, 'game');
    expect(v.stars).toBe(4);
    expect(v.comment).toMatch(/^Love the team tee, but the long waves aren't game day\. Try another hairstyle\./);
  });

  it('the foam finger can bring the school colors', () => {
    expect(score({ hair: 'ponytail', top: 'teamtee:2', bottom: 'jeans', shoes: 'chucks', extras: ['foamfinger'] }, 'game').stars).toBe(5);
  });

  it('red shoes with pink roses clash', () => {
    const v = score({ hair: 'waves', dress: 'sundress:0', shoes: 'maryjanes:0', extras: ['cardigan:0'] }, 'liz');
    expect(v.stars).toBe(4);
    expect(v.comment).toMatch(/red and pink/);
  });

  it('an unfinished look is capped at 2 even if the pieces are perfect', () => {
    const v = score({ hair: 'ponytail', top: 'teamtee:0', shoes: 'chucks', extras: ['foamfinger'] }, 'game');
    expect(v.stars).toBe(2);
    expect(v.comment).toMatch(/bottoms/);
  });
});

describe('L4 judging: Chuck Taylors', () => {
  it('fit every theme and earn a wink', () => {
    const chucks = item('chucks');
    expect(chucks.name).toBe('Chuck Taylors');
    for (const th of THEMES) {
      expect(fit(chucks, th)).toBe('love');
      const v = score({ ...FIVE_STAR[th.id][0], shoes: 'chucks' }, th.id);
      expect(v.stars).toBe(5);
      expect(v.chucks).toBe(true);
      expect(v.comment).toContain(WINK);
    }
  });
});

describe('L4 judging: whole wardrobe sweep', () => {
  /** Every hair × core × shoes × (no extra | one extra) combination for a theme. */
  function sweep(th: (typeof THEMES)[number]) {
    const picks = (cat: Parameters<typeof itemsIn>[0]) => itemsIn(cat).flatMap((it) => it.variants.map((_, v) => ({ id: it.id, v })));
    const cores: Outfit[] = [];
    for (const d of picks('dress')) cores.push(wear(emptyOutfit(), d));
    for (const t of picks('top')) for (const b of picks('bottom')) cores.push(wear(wear(emptyOutfit(), t), b));
    const counts = [0, 0, 0, 0, 0, 0];
    let coreClashMax = 0;
    let doubleBut = '';
    for (const h of picks('hair'))
      for (const c of cores)
        for (const s of picks('shoes'))
          for (const e of [null, ...picks('extra')]) {
            let o = wear(wear(c, h), s);
            if (e) o = wear(o, e);
            const v = judge(o, th);
            counts[v.stars]++;
            const core = o.dress ? [o.dress] : [o.top!, o.bottom!];
            if (core.some((p) => fit(item(p.id), th) === 'avoid')) coreClashMax = Math.max(coreClashMax, v.stars);
            if ((v.comment.match(/\bbut\b/gi) ?? []).length > 1) doubleBut = v.comment;
          }
    return { counts, coreClashMax, doubleBut };
  }

  for (const th of THEMES) {
    it(`${th.id}: many 5-star looks exist, clashing main pieces never pass 2`, () => {
      const { counts, coreClashMax, doubleBut } = sweep(th);
      expect(doubleBut).toBe('');
      expect(counts[5]).toBeGreaterThan(200);
      // five stars should be earned, not the default
      const total = counts.reduce((a, b) => a + b, 0);
      expect(counts[5] / total).toBeLessThan(0.15);
      expect(coreClashMax).toBeLessThanOrEqual(2);
    });
  }

  it('is deterministic', () => {
    const spec = FIVE_STAR.movie[1];
    expect(score(spec, 'movie')).toEqual(score(spec, 'movie'));
  });
});

describe('L4 wardrobe data', () => {
  it('has unique ids, ~6 items per category and colours on every wearable variant', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const cat of ['hair', 'top', 'bottom', 'dress', 'shoes', 'extra'] as const) expect(itemsIn(cat).length).toBeGreaterThanOrEqual(6);
    for (const it of ITEMS) {
      expect(it.tags.length).toBeGreaterThan(0);
      if (it.cat !== 'hair') for (const v of it.variants) expect(v.colors.length).toBeGreaterThan(0);
      if (it.cat === 'extra') expect(it.slot).toBeTruthy();
    }
  });

  it('dresses replace top and bottoms, extras replace the same slot', () => {
    let o = outfitFrom({ top: 'teamtee', bottom: 'jeans' });
    o = wear(o, { id: 'sundress', v: 0 });
    expect([o.top, o.bottom, o.dress?.id]).toEqual([null, null, 'sundress']);
    o = wear(o, { id: 'blouse', v: 0 });
    expect(o.dress).toBeNull();
    o = outfitFrom({ extras: ['cardigan', 'denimjacket', 'pearls'] });
    expect(o.extras.map((e) => e.id)).toEqual(['denimjacket', 'pearls']);
    expect(takeOff(o, 'pearls').extras.map((e) => e.id)).toEqual(['denimjacket']);
  });

  it('every item and variant draws without throwing', () => {
    for (const it of ITEMS)
      it.variants.forEach((_, v) => {
        expect(thumbSvg(it, v)).toMatch(/^<svg/);
      });
    expect(dollSvg(outfitFrom(FIVE_STAR.liz[1]))).toContain('<svg');
  });

  it('rejects unknown items', () => {
    expect(() => outfitFrom({ top: 'tuxedo' })).toThrow();
  });
});
