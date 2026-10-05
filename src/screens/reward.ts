/**
 * Reward screen. Each reward must be claimed with the blue button (deck:
 * "the blue button is what the player should press when they are rewarded
 * with an item at the end of the level"). Songs can be played with red.
 */
import { app } from '../core/app';
import { audio } from '../core/audio';
import { save } from '../core/save';
import { ITEMS, SONGS, type ItemId, type SongId } from '../data/story';
import { confetti, flower, headphones, newspaper, recordSleeve, tape } from '../ui/decor';
import { button, el } from '../ui/dom';
import { icon } from '../ui/icons';
import { itemIcon } from './inventory';
import { songPlayButton } from './soundtrack';

export type Reward = { kind: 'song'; id: SongId } | { kind: 'item'; id: ItemId } | { kind: 'chucks' };

export function showRewards(rewards: Reward[]): Promise<void> {
  return new Promise((resolve) => {
    audio.playMusic('reward');
    const root = el('div', { class: 'reward-screen paper-screen fade-in', 'data-testid': 'rewards' });
    const list = el('div', { class: 'reward-list' });
    const hint = el('div', { class: 'reward-hint' }, 'Tap the blue Claim button to collect.');
    let remaining = rewards.length;
    const done = button('Continue', () => {
      audio.stopPreview();
      resolve();
    }, { color: 'green', icon: '▶', id: 'rewards-continue' });
    done.disabled = remaining > 0;

    rewards.forEach((r, n) => {
      const card = el('div', { class: `paper reward-card pop-in ${r.kind}`, style: `--n:${n}` }, tape('reward-tape'));
      const stamp = el('div', { class: 'reward-stamp', 'aria-hidden': 'true' }, r.kind === 'song' ? 'Added to the playlist!' : 'In your inventory!');
      let claimed = false;
      const claim = button('Claim', () => {
        if (claimed) return;
        claimed = true;
        if (r.kind === 'song') save.addSong(r.id);
        if (r.kind === 'item') save.grantItem(r.id);
        claim.disabled = true;
        claim.replaceChildren(el('span', { class: 'ico' }, icon('check')), 'Claimed!');
        card.classList.add('claimed');
        if (--remaining === 0) {
          done.disabled = false;
          hint.textContent = 'All yours! Tap Continue.';
          root.classList.add('all-claimed');
        }
      }, { color: 'blue', icon: '✋', sfx: 'claim', id: `claim-${r.kind === 'chucks' ? 'chucks' : r.id}` });

      if (r.kind === 'song') {
        const s = SONGS[r.id];
        const disc = el('div', { class: 'reward-disc' }, recordSleeve(s.id, 'rd-sleeve'));
        card.append(
          el('div', { class: 'reward-kind' }, icon('music'), 'New song'),
          disc,
          el('div', { class: 'reward-name' }, s.title),
          el('div', { class: 'reward-sub' }, s.artist),
          el('div', { class: 'row reward-btns' }, claim, songPlayButton(root, s.id, { label: true, onState: (on) => disc.classList.toggle('playing', on) })),
          stamp,
        );
      } else {
        const id = r.kind === 'item' ? r.id : 'chucks';
        const it = ITEMS[id];
        card.append(
          el('div', { class: 'reward-kind' }, icon(r.kind === 'chucks' ? 'sparkle' : 'star'), r.kind === 'chucks' ? 'Secret found!' : 'New item'),
          el('div', { class: 'reward-item' }, el('i', { class: 'rays' }), itemIcon(id, 'ri-icon')),
          el('div', { class: 'reward-name' }, it.name),
          el('div', { class: 'reward-sub' }, r.kind === 'chucks' ? 'Move at double speed.' : it.effect),
          el('div', { class: 'reward-note' }, r.kind === 'chucks' ? 'Turn them on or off in your Inventory.' : 'Equip it from your Inventory.'),
          el('div', { class: 'row reward-btns' }, claim),
          stamp,
        );
      }
      list.appendChild(card);
    });

    root.append(
      confetti(22, true),
      flower(3, 'reward-flower'),
      newspaper('reward-news'),
      headphones('reward-phones'),
      el('div', { class: 'reward-head' }, el('h1', { class: 'brush-title reward-title' }, rewards.length > 1 ? 'Rewards' : 'Reward')),
      list,
      el('div', { class: 'reward-foot' }, hint, done),
    );
    if (!rewards.length) {
      hint.textContent = '';
      done.disabled = false;
    }
    app.show({ el: root, destroy: () => audio.stopPreview() });
  });
}
