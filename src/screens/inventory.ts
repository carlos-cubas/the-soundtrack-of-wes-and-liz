/**
 * Inventory: equip one single-use item for side quests, use it there with
 * the on-screen item button, and toggle the
 * Chuck Taylors once found.
 */
import { audio } from '../core/audio';
import { save } from '../core/save';
import { ITEMS, type ItemId } from '../data/story';
import { art, closeX } from '../ui/decor';
import { button, el, modal, toast } from '../ui/dom';
import { icon } from '../ui/icons';

const ORDER: ItemId[] = ['cap', 'bat', 'boombox', 'jersey'];
/** Item icon, with a line-art star if the art is missing. */
export function itemIcon(id: ItemId | 'chucks', cls = ''): HTMLElement {
  return art(ITEMS[id].icon, `item-icon ${cls}`, () => el('span', { class: 'item-emoji' }, icon('star', { fill: '#ffe80f' })), { fit: 'contain' });
}

/** "Ask for a hint during a side quest." → "Ask for a hint." */
const shortEffect = (s: string) => s.replace(/ during a side quest\.?$/i, '.');

export function openInventory(parent: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const grid = el('div', { class: 'inv-grid' });
    const render = () => {
      const cards = ORDER.map((id) => {
        const it = ITEMS[id];
        const st = save.data.items[id];
        const eq = save.data.equipped === id;
        // "Level 5" stays on one line when the card is narrow
        const where = it.earnedFrom.split(':')[0].replace(' ', '\u00a0');
        let action: HTMLElement;
        if (st === 'owned') {
          action = button(eq ? 'Equipped' : 'Equip', () => {
            save.equip(eq ? null : id);
            audio.sfx(eq ? 'back' : 'collect');
            render();
          }, { color: 'green', small: true, icon: eq ? '✓' : 'bag', id: `equip-${id}`, title: eq ? `Unequip ${it.name}` : `Equip ${it.name}` });
          if (eq) action.classList.add('on');
        } else {
          action = el('div', { class: 'inv-state' }, st === 'used' ? 'Used up' : `Earn it in ${where}`);
        }
        const card = el(
          'div',
          { class: `paper inv-card ${st}${eq ? ' equipped' : ''}`, 'data-testid': `inv-${id}` },
          eq ? el('span', { class: 'inv-ribbon' }, 'Equipped') : null,
          itemIcon(id, 'inv-art'),
          el('div', { class: 'inv-name' }, st === 'none' ? '???' : it.name),
          el('div', { class: 'inv-effect' }, st === 'none' ? 'Not found yet.' : shortEffect(it.effect)),
          action,
        );
        if (st === 'none') card.addEventListener('click', () => toast(parent, `${it.name}: ${it.earnedFrom}.`, 3000));
        return card;
      });
      const c = ITEMS.chucks;
      const found = save.data.chucks === 'found';
      const on = found && save.data.chucksOn;
      cards.push(
        el(
          'div',
          { class: `paper inv-card chucks ${found ? 'owned' : 'none'}${on ? ' equipped' : ''}`, 'data-testid': 'inv-chucks' },
          on ? el('span', { class: 'inv-ribbon' }, '2× speed') : null,
          itemIcon('chucks', 'inv-art'),
          el('div', { class: 'inv-name' }, found ? c.name : '???'),
          el('div', { class: 'inv-effect' }, found ? 'Double speed. Never runs out.' : 'Hidden somewhere in the game…'),
          found
            ? button(on ? 'On' : 'Off', () => {
                save.setChucks(!save.data.chucksOn);
                render();
              }, { color: on ? 'green' : 'gray', small: true, icon: on ? '✓' : undefined, id: 'toggle-chucks', title: on ? 'Turn double speed off' : 'Turn double speed on' })
            : el('div', { class: 'inv-state' }, 'Secret'),
        ),
      );
      grid.replaceChildren(...cards);
    };
    render();
    const done = () => {
      close();
      resolve();
    };
    const close = modal(
      parent,
      el(
        'div',
        { class: 'inventory', 'data-testid': 'inventory' },
        closeX(done, 'inventory-close'),
        el(
          'div',
          { class: 'inv-head' },
          el('h2', { class: 'brush-title' }, "Wes's Inventory"),
          el(
            'p',
            { class: 'inv-help' },
            'Equip one item, then tap the item button during a side quest to use it. Each item works once.',
          ),
        ),
        grid,
      ),
      { onBackdrop: done, class: 'panel inv-panel' },
    );
  });
}
