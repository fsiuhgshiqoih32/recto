// A complete paperback cover as an HTML page at the wrap's exact size, for
// printing to PDF (KDP and IngramSpark take covers as PDF): the ebook cover on
// the front, title and author up the spine, and the description on the back.

import type { Book } from '../../model/book';
import { themeOf } from '../../render/html';
import { languageInfo } from '../../i18n/languages';
import { bookFonts, fontFaceCss, fontStack } from '../../themes/fonts';
import { BLEED, type CoverWrap, SAFE, SPINE_SAFE, inset } from './wrap';

export interface CoverOptions {
  fontUrl: (file: string) => string;
  /** Background of the spine and back cover, as a CSS color. */
  background: string;
  /** Draw trim, fold and safe-area guides over the art (for checking, not printing). */
  guides?: boolean;
}

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Black or white, whichever reads better on the background. */
export function inkFor(background: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(background);
  if (!m) return '#000000';
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.36 ? '#000000' : '#ffffff';
}

export function coverDocument(book: Book, wrap: CoverWrap, opts: CoverOptions): string {
  const theme = themeOf(book);
  const lang = book.meta.language || 'en';
  const { dir } = languageInfo(lang);
  const ink = inkFor(opts.background);
  const inch = (n: number) => `${+n.toFixed(4)}in`;
  const box = (r: { x: number; y: number; width: number; height: number }) =>
    `left:${inch(r.x)};top:${inch(r.y)};width:${inch(r.width)};height:${inch(r.height)};`;
  // Right-to-left books bind on the right, so their front cover is on the left.
  const rtl = dir === 'rtl';
  const frontArt = rtl
    ? { x: 0, y: 0, width: wrap.back.x + wrap.back.width, height: wrap.height }
    : { x: wrap.front.x, y: 0, width: wrap.width - wrap.front.x, height: wrap.height };
  const backPanel = rtl ? wrap.front : wrap.back;
  const text = inset(backPanel, SAFE + 0.25);
  // Leave the barcode area (bottom corner by the spine on the back) clear.
  const barcode = rtl ? { ...wrap.barcode, x: wrap.width - wrap.barcode.x - wrap.barcode.width } : wrap.barcode;
  const spine = inset(wrap.spineArea, SAFE, Math.min(SPINE_SAFE, wrap.spineArea.width / 2));
  const title = book.meta.title || 'Untitled';
  const spineSize = Math.min(14, wrap.spine * 72 * 0.55);
  const guides = opts.guides
    ? `<svg class="guides" viewBox="0 0 ${wrap.width * 72} ${wrap.height * 72}" preserveAspectRatio="none">
<rect x="${BLEED * 72}" y="${BLEED * 72}" width="${(wrap.width - 2 * BLEED) * 72}" height="${(wrap.height - 2 * BLEED) * 72}" fill="none" stroke="#e74c3c" stroke-width="1"/>
<path d="M${wrap.spineArea.x * 72} 0V${wrap.height * 72}M${(wrap.spineArea.x + wrap.spineArea.width) * 72} 0V${wrap.height * 72}" stroke="#7f8c8d" stroke-dasharray="3 3"/>
<rect x="${barcode.x * 72}" y="${barcode.y * 72}" width="${barcode.width * 72}" height="${barcode.height * 72}" fill="rgba(255,240,150,0.6)" stroke="#b7950b"/>
</svg>`
    : '';

  return `<!DOCTYPE html>
<html lang="${esc(lang)}"${rtl ? ' dir="rtl"' : ''}>
<head>
<meta charset="utf-8"/>
<title>${esc(title)} cover</title>
<style>
${fontFaceCss(bookFonts([theme.fonts.body, theme.fonts.heading], lang), opts.fontUrl, `${title} ${book.meta.author} ${book.meta.description}`)}
@page { size: ${inch(wrap.width)} ${inch(wrap.height)}; margin: 0; }
html, body { margin: 0; padding: 0; }
.wrap { position: relative; width: ${inch(wrap.width)}; height: ${inch(wrap.height)}; overflow: hidden; background: ${opts.background}; color: ${ink}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.wrap > * { position: absolute; margin: 0; }
.art { ${box(frontArt)} object-fit: cover; }
.spine { ${box(spine)} display: flex; align-items: center; justify-content: center; gap: 0.6em; writing-mode: vertical-rl; ${rtl ? 'transform: rotate(180deg);' : ''} font-family: ${fontStack(theme.fonts.heading, lang)}; font-size: ${spineSize.toFixed(1)}pt; white-space: nowrap; overflow: hidden; }
.spine .author { font-size: 0.8em; letter-spacing: 0.08em; }
.back { ${box({ ...text, height: barcode.y - text.y - 0.2 })} font-family: ${fontStack(theme.fonts.body, lang)}; font-size: 11pt; line-height: 1.45; overflow: hidden; }
.back h2 { font-family: ${fontStack(theme.fonts.heading, lang)}; font-weight: 400; font-size: 17pt; line-height: 1.15; margin: 0 0 0.7em; }
.back p { margin: 0 0 0.7em; }
.back .byline { margin-top: 1.2em; font-style: italic; }
.guides { left: 0; top: 0; width: 100%; height: 100%; }
</style>
<script>
window.addEventListener('load', function () {
  document.fonts.ready.then(function () {
    window.__rectoPages = 1;
    if (window.parent !== window) window.parent.postMessage({ type: 'recto:cover' }, '*');
  });
});
</script>
</head>
<body>
<div class="wrap">
${book.meta.cover ? `<img class="art" src="${book.meta.cover}" alt=""/>` : ''}
${wrap.spineText ? `<div class="spine"><span>${esc(title)}</span>${book.meta.author ? `<span class="author">${esc(book.meta.author)}</span>` : ''}</div>` : ''}
<div class="back">
<h2>${esc(title)}</h2>
${(book.meta.description || '').split(/\n\s*\n/).filter((p) => p.trim()).map((p) => `<p>${esc(p.trim())}</p>`).join('\n')}
${book.meta.author ? `<p class="byline">${esc(book.meta.author)}</p>` : ''}
</div>
${guides}
</div>
</body>
</html>
`;
}
