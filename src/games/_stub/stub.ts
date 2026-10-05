/** Placeholder game used until a level is implemented: tap WIN or LOSE. */
import type { GameHost, MiniGame, MiniGameFactory } from '../types';

export const stubGame: MiniGameFactory = (level) => {
  let host: GameHost;
  const game: MiniGame = {
    init(h) {
      host = h;
      const { W, H } = h.stage;
      h.input.addButton({ id: 'win', x: W / 2 - 80, y: H / 2 + 60, r: 40, label: 'WIN', color: '#22c55e' });
      h.input.addButton({ id: 'lose', x: W / 2 + 80, y: H / 2 + 60, r: 40, label: 'LOSE', color: '#ef4444' });
    },
    update() {
      if (host.input.pressed('win')) host.finish({ outcome: 'win', stars: 5, flags: { noHit: true, allHigh: true } });
      if (host.input.pressed('lose')) host.finish({ outcome: 'lose' });
    },
    render(ctx) {
      const { W, H } = host.stage;
      ctx.fillStyle = '#7ed2fe';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2b2b3a';
      ctx.font = "28px 'Leckerli One'";
      ctx.textAlign = 'center';
      ctx.fillText(`${level.title} (coming soon)`, W / 2, H / 2 - 30);
      host.input.renderControls(ctx);
    },
    destroy() {},
  };
  return game;
};
