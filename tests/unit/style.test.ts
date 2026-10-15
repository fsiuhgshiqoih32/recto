import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sampleBook } from '../../src/model/sample';
import { guardCss, customTheme } from '../../src/themes/custom';
import { sanitizeCss } from '../../src/themes/customCss';
import { parseStylePack, stylePackOf } from '../../src/themes/stylePack';
import { THEMES } from '../../src/themes';
import { renderBook, themeOf } from '../../src/render/html';
import { printCss } from '../../src/export/print/pageCss';
import { ebookCss } from '../../src/render/ebookCss';

describe('style builder', () => {
  it('keeps typography and drops anything that reaches outside the book', () => {
    const { css, notes } = sanitizeCss(`
      @import url("https://example.com/x.css");
      @font-face { font-family: X; src: url(x.woff2); }
      .chapter-title { letter-spacing: 0.1em; font-family: Comic Sans; position: fixed; }
      .el p { background-image: url(https://tracker.example/pixel.png); margin-bottom: 0.5em; }
      html, .scene-break { text-align: center; }
      .pagedjs_page { display: none; }
      .el blockquote::before { content: "“"; color: #333; }
    `);
    expect(css).toBe(
      '.chapter-title { letter-spacing:0.1em; }\n' +
      '.el p { margin-bottom:0.5em; }\n' +
      '.scene-break { text-align:center; }\n' +
      '.el blockquote::before { content:"“"; color:#333; }',
    );
    expect(notes.join(' ')).toMatch(/@import rules aren’t allowed/);
    expect(notes.join(' ')).toMatch(/@font-face/);
    expect(notes.join(' ')).toMatch(/Choose fonts with Body font/);
    expect(notes.join(' ')).toMatch(/“position” isn’t allowed/);
    expect(notes.join(' ')).toMatch(/“background-image” isn’t allowed/);
    expect(notes.join(' ')).toMatch(/“html” isn’t allowed/);
    expect(notes.join(' ')).toMatch(/pagedjs_page/);
  });

  it('guards CSS that never went through the filter', () => {
    const guarded = guardCss('@import "x.css"; .a { color: red; background: url(x.png) } .b { b\\61 ckground: \\75 rl(y.png); margin: 0 } </style><script>');
    expect(guarded).not.toMatch(/url|@import|<\/style/i);
    expect(guarded).toContain('color: red');
    expect(guarded).toContain('margin: 0');
  });

  it('applies the changes in every output', () => {
    const book = sampleBook();
    book.style.custom = { bodyFont: 'lora', headingAlign: 'start', titleCase: 'capitals', paragraphs: 'spaced', ornament: 'asterism', headingOrnament: 'none', chapterLabel: 'number', css: '.chapter-title { letter-spacing: 0.2em; }' };
    const theme = themeOf(book);
    expect(theme.fonts.body).toBe('lora');
    expect(theme.fonts.heading).toBe(THEMES.octavo.fonts.heading);
    expect(theme.ornament).toBe('asterism');
    expect(theme.headingOrnament).toBeUndefined();
    expect(themeOf(book)).toBe(theme); // cached while the settings don't change
    const html = renderBook({ book, theme, target: 'print', ornament: () => '', hrefFor: () => '' }).map((r) => r.html).join('');
    expect(html).toContain('<span class="chapter-label">1</span>');
    expect(html).not.toContain('class="head-orn"');
    for (const css of [printCss(book, { pages: 200, fontUrl: (f) => f }), ebookCss(book)]) {
      expect(css).toContain('Lora');
      expect(css).toContain('.chapter-head, .part-head, .chapter-subtitle, .matter-heading, .chapter-head .head-orn, .part-head .head-orn { text-align: start; }');
      expect(css).toContain('.el .body p { text-indent: 0; margin: 0 0 0.8em; }');
      expect(css).toContain('.chapter-title { letter-spacing: 0.2em; }');
    }
    expect(customTheme(THEMES.ledger, book.style.custom).css.startsWith(THEMES.ledger.css)).toBe(true);
  });

  it('saves and loads a style pack, ignoring settings it doesn’t know', () => {
    const book = sampleBook();
    book.style.theme = 'almanac';
    book.style.custom = { headingFont: 'cormorant-garamond', titleSize: 'large' };
    const pack = parseStylePack(JSON.stringify({ ...stylePackOf(book, 'Mine'), custom: { ...book.style.custom, bodyFont: 'papyrus', script: 'alert(1)' } }));
    expect(pack).toMatchObject({ name: 'Mine', theme: 'almanac', license: 'CC0-1.0', author: 'Mara Quill' });
    expect(pack.custom).toEqual({ headingFont: 'cormorant-garamond', titleSize: 'large' });
    expect(() => parseStylePack('{"format":"recto-style","version":1,"theme":"vellum"}')).toThrow(/book style Recto doesn’t have/);
    expect(() => parseStylePack('not json')).toThrow(/isn’t a Recto style file/);
  });

  it('accepts every pack in style-packs/ unchanged', () => {
    const dir = 'style-packs';
    const packs = readdirSync(dir).filter((f) => f.endsWith('.recto-style'));
    expect(packs.length).toBeGreaterThan(0);
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    for (const file of packs) {
      const text = readFileSync(join(dir, file), 'utf8');
      const pack = parseStylePack(text);
      expect(pack.license, file).toBe('CC0-1.0');
      expect(pack.description, file).toBeTruthy();
      expect(Object.keys(pack.custom).sort(), `${file} has settings Recto doesn't know`).toEqual(Object.keys(JSON.parse(text).custom).sort());
      if (pack.custom.css) expect(sanitizeCss(pack.custom.css).notes, file).toEqual([]);
      expect(readme, `${file} is listed in the README`).toContain(`(${file})`);
    }
  });
});
