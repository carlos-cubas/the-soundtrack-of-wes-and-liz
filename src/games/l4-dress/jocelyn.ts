/**
 * Fallback portrait of Jocelyn (used until img/portraits/jocelyn*.webp
 * exists): waist-up, flat vector, curly black puff, gold hoops, denim jacket.
 */
export type Mood = 'happy' | 'neutral' | 'mad';

const SKIN = '#7a4a31';
const SKIN_SH = '#663c27';
const CURL = '#1c1416';

export function jocelynSvg(mood: Mood): string {
  let puff = '';
  const curls: Array<[number, number, number]> = [
    [100, 30, 30],
    [76, 38, 18],
    [124, 38, 18],
    [86, 18, 16],
    [114, 18, 16],
    [100, 10, 15],
    [66, 54, 12],
    [134, 54, 12],
  ];
  for (const [x, y, r] of curls) puff += `<circle cx="${x}" cy="${y}" r="${r}" fill="${CURL}"/>`;
  for (const [x, y, r] of curls) puff += `<circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.35}" fill="#3a2c2e" opacity=".55"/>`;

  const brows =
    mood === 'mad'
      ? '<path d="M78 84 L92 89 M122 84 L108 89" stroke="#1c1416" stroke-width="3" stroke-linecap="round"/>'
      : mood === 'happy'
        ? '<path d="M78 84 Q85 79 92 82 M108 82 Q115 79 122 84" stroke="#1c1416" stroke-width="3" fill="none" stroke-linecap="round"/>'
        : '<path d="M78 85 Q85 82 92 84 M108 83 Q115 79 122 82" stroke="#1c1416" stroke-width="3" fill="none" stroke-linecap="round"/>';
  const eyes =
    mood === 'happy'
      ? '<path d="M80 97 Q86 91 92 97 M108 97 Q114 91 120 97" stroke="#1c1416" stroke-width="3" fill="none" stroke-linecap="round"/>'
      : `<ellipse cx="86" cy="96" rx="4" ry="${mood === 'mad' ? 3.2 : 5}" fill="#1c1416"/><ellipse cx="114" cy="96" rx="4" ry="${mood === 'mad' ? 3.2 : 5}" fill="#1c1416"/>` +
        `<circle cx="${mood === 'mad' ? 88 : 87.5}" cy="94.5" r="1.3" fill="#fff"/><circle cx="${mood === 'mad' ? 116 : 115.5}" cy="94.5" r="1.3" fill="#fff"/>`;
  const mouth =
    mood === 'happy'
      ? '<path d="M88 116 Q100 130 112 116 Z" fill="#5a1f24"/><path d="M91 117 Q100 121 109 117 L108 119 Q100 122 92 119 Z" fill="#fff"/>'
      : mood === 'mad'
        ? '<path d="M90 122 Q100 115 110 122" stroke="#4a1c20" stroke-width="3.4" fill="none" stroke-linecap="round"/>'
        : '<path d="M90 118 Q101 124 111 116" stroke="#4a1c20" stroke-width="3.2" fill="none" stroke-linecap="round"/>';

  return (
    `<svg viewBox="0 -6 200 236" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    // jacket and tee
    `<path d="M30 236 C30 186 44 164 78 156 L122 156 C156 164 170 186 170 236 Z" fill="#6f97cf"/>` +
    `<path d="M80 156 L120 156 L114 236 L86 236 Z" fill="#fbfaf6"/>` +
    `<path d="M78 156 L92 196 L84 236 L72 236 L66 186 Z" fill="#5e86be"/><path d="M122 156 L108 196 L116 236 L128 236 L134 186 Z" fill="#5e86be"/>` +
    `<path d="M48 200 L64 200 L64 214 L48 214 Z M136 200 L152 200 L152 214 L136 214 Z" fill="#5e86be"/>` +
    `<path d="M48 214 L64 214 M136 214 L152 214" stroke="#efc067" stroke-width="1.4" stroke-dasharray="2 2"/>` +
    // neck, head, ears
    `<path d="M88 120 L88 160 Q100 168 112 160 L112 120 Z" fill="${SKIN_SH}"/>` +
    `<ellipse cx="66" cy="100" rx="6" ry="9" fill="${SKIN}"/><ellipse cx="134" cy="100" rx="6" ry="9" fill="${SKIN}"/>` +
    `<circle cx="64" cy="117" r="8" fill="none" stroke="#e8b83a" stroke-width="2.6"/><circle cx="136" cy="117" r="8" fill="none" stroke="#e8b83a" stroke-width="2.6"/>` +
    puff +
    `<path d="M68 92 C68 64 82 52 100 52 C118 52 132 64 132 92 C132 116 118 136 100 137 C82 136 68 116 68 92 Z" fill="${SKIN}"/>` +
    `<path d="M70 76 C74 58 90 50 100 54 C110 50 126 58 130 76 C124 66 112 62 100 64 C88 62 76 66 70 76 Z" fill="${CURL}"/>` +
    `<ellipse cx="80" cy="110" rx="7" ry="4" fill="#c4536a" opacity=".35"/><ellipse cx="120" cy="110" rx="7" ry="4" fill="#c4536a" opacity=".35"/>` +
    brows +
    eyes +
    `<path d="M98 102 Q102 108 97 110" stroke="${SKIN_SH}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
    mouth +
    `</svg>`
  );
}
