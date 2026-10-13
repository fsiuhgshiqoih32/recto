// Original scene-break ornaments, drawn for Recto. Colors are explicit (not
// currentColor) because ebook readers load them through <img>.

export type OrnamentId = 'diamonds' | 'rule' | 'flourish' | 'squares' | 'asterism';

const INK = '#2a2a2a';

const svg = (viewBox: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${viewBox.split(' ')[2]}" height="${viewBox.split(' ')[3]}">${body}</svg>`;

const diamond = (cx: number, cy: number, r: number) =>
  `<path d="M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z" fill="${INK}"/>`;

const asterisk = (cx: number, cy: number) => {
  const r = 4;
  const dx = +(r * Math.cos(Math.PI / 6)).toFixed(2);
  const dy = +(r * Math.sin(Math.PI / 6)).toFixed(2);
  return (
    `<path d="M${cx} ${cy - r}V${cy + r}M${cx - dx} ${cy - dy}L${cx + dx} ${cy + dy}M${cx - dx} ${cy + dy}L${cx + dx} ${cy - dy}" ` +
    `stroke="${INK}" stroke-width="1.4" stroke-linecap="round" fill="none"/>`
  );
};

export const ORNAMENTS: Record<OrnamentId, string> = {
  diamonds: svg('0 0 64 12', diamond(16, 6, 3) + diamond(32, 6, 5) + diamond(48, 6, 3)),
  rule: svg(
    '0 0 80 8',
    `<path d="M0 4H33M47 4H80" stroke="${INK}" stroke-width="0.8"/><circle cx="40" cy="4" r="2.2" fill="${INK}"/>`,
  ),
  flourish: svg(
    '0 0 100 20',
    `<path d="M8 10C16 3 26 3 33 9C38 13 44 13 46 10M92 10C84 3 74 3 67 9C62 13 56 13 54 10" stroke="${INK}" stroke-width="1.1" fill="none" stroke-linecap="round"/>` +
      `<circle cx="8" cy="10" r="1.4" fill="${INK}"/><circle cx="92" cy="10" r="1.4" fill="${INK}"/>` +
      diamond(50, 10, 2.6),
  ),
  squares: svg('0 0 60 6', [9, 28, 47].map((x) => `<rect x="${x}" y="1" width="4" height="4" fill="${INK}"/>`).join('')),
  asterism: svg('0 0 40 30', asterisk(20, 8) + asterisk(11, 22) + asterisk(29, 22)),
};
