// Absolute URLs for the static assets that scripts/copy-fonts.mjs puts in public/.
// Absolute because previews render in srcdoc iframes.

import { FONT_FAMILIES, type FontId, fontFaceCss } from '../themes/fonts';

const base = () => new URL(import.meta.env.BASE_URL, window.location.href);

export function fontUrl(file: string): string {
  return new URL(`fonts/${file}`, base()).href;
}

export function pagedUrl(): string {
  return new URL('vendor/paged.polyfill.js', base()).href;
}

export async function loadFont(file: string): Promise<Uint8Array> {
  const response = await fetch(fontUrl(file));
  if (!response.ok) throw new Error(`Could not load font ${file}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Makes every book font available to the app itself (editor, theme cards). */
export function installAppFonts(): void {
  const style = document.createElement('style');
  style.dataset.recto = 'fonts';
  style.textContent = fontFaceCss(Object.keys(FONT_FAMILIES) as FontId[], fontUrl);
  document.head.appendChild(style);
}
