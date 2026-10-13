import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { decodeText, detectLanguage, htmlCharset } from '../../src/i18n/detect';
import { chapterLabel, localDigits, partLabel, toCjkNumeral } from '../../src/i18n/labels';
import { bookStrings, canonicalCode, languageInfo } from '../../src/i18n/languages';
import { buildEpub } from '../../src/export/epub/package';
import { printCss } from '../../src/export/print/pageCss';
import { printDocument } from '../../src/export/print/paged';
import { copyrightDoc, defaultTitle, newBook } from '../../src/model/defaults';
import { paragraphs } from '../../src/model/book';
import { parseChapterNumber } from '../../src/model/numbers';
import { renderBook, themeOf } from '../../src/render/html';
import { facesFor, fontStack } from '../../src/themes/fonts';
import { languageCss } from '../../src/themes';
import { textStats, wordCount } from '../../src/model/book';
import { estimatePages } from '../../src/export/print/pageCss';
import { layoutUntilSettled } from '../../src/export/print/layout';
import { ORNAMENTS } from '../../src/themes/ornaments';

describe('languages', () => {
  it('knows script and direction for any BCP 47 tag', () => {
    expect(languageInfo('ar')).toMatchObject({ script: 'arabic', dir: 'rtl', name: 'Arabic' });
    expect(languageInfo('he-IL')).toMatchObject({ script: 'hebrew', dir: 'rtl' });
    expect(languageInfo('zh-TW')).toMatchObject({ script: 'han-traditional', name: 'Chinese (Traditional)' });
    expect(languageInfo('pt-BR').strings?.chapter).toBe('Capítulo {n}');
    // Not in Recto's table: Intl fills in the name, script and direction.
    expect(languageInfo('ur')).toMatchObject({ name: 'Urdu', dir: 'rtl', script: 'arabic' });
    expect(languageInfo('ur').strings).toBeUndefined();
    expect(languageInfo('sw')).toMatchObject({ name: 'Swahili', script: 'latin', dir: 'ltr' });
    expect(canonicalCode('EN-gb')).toBe('en-GB');
    expect(canonicalCode('not a language!')).toBeNull();
  });

  it('labels chapters in the book’s language and digits', () => {
    expect(chapterLabel('label-words', 'en', 12)).toBe('Chapter Twelve');
    expect(chapterLabel('label-words', 'fr', 12)).toBe('Chapitre 12');
    expect(chapterLabel('label-number', 'fi', 4)).toBe('4. luku');
    expect(chapterLabel('label-words', 'ja', 21)).toBe('第二十一章');
    expect(chapterLabel('label-number', 'ko', 2)).toBe('제2장');
    expect(chapterLabel('number', 'ar', 3)).toBe(localDigits(3, 'ar'));
    expect(partLabel('label-number', 'ru', 2)).toBe('Часть 2');
    expect(toCjkNumeral(105)).toBe('一百〇五');
    expect(toCjkNumeral(10)).toBe('十');
  });

  it('parses chapter numbers in other scripts', () => {
    expect(parseChapterNumber('٣')).toBe(3);
    expect(parseChapterNumber('۱۲')).toBe(12);
    expect(parseChapterNumber('二十一')).toBe(21);
    expect(parseChapterNumber('十')).toBe(10);
    expect(parseChapterNumber('１２')).toBe(12);
  });

  it('writes default titles and the copyright page in the book’s language', () => {
    expect(defaultTitle('toc', 'es')).toBe('Índice');
    expect(defaultTitle('acknowledgments', 'de')).toBe('Danksagung');
    expect(defaultTitle('toc', 'sw')).toBe('Contents');
    const doc = copyrightDoc({ ...newBook().meta, language: 'fr', author: 'Anne Martin', copyrightYear: '2026', isbnEbook: '9781234567897' });
    expect(JSON.stringify(doc)).toContain('Tous droits réservés.');
    expect(JSON.stringify(doc)).toContain('ISBN 9781234567897 (livre numérique)');
  });
});

describe('detection', () => {
  it('detects the language of a manuscript', () => {
    expect(detectLanguage('El faro estaba en la punta y los barcos que se perdían en la niebla volvían por la luz.').code).toBe('es');
    expect(detectLanguage('Der Leuchtturm stand auf der Spitze und die Schiffe, die sich im Nebel verirrten, kamen zurück.').code).toBe('de');
    expect(detectLanguage('Маяк стоял на мысе, и корабли, потерявшиеся в тумане, возвращались на его свет.').code).toBe('ru');
    expect(detectLanguage('Маяк стояв на мисі, і кораблі, що загубилися в тумані, поверталися на його світло.').code).toBe('uk');
    expect(detectLanguage('灯塔立在海角上，在雾中迷路的船只循着它的光回来了。我们说这是她的工作。').code).toBe('zh-Hans');
    expect(detectLanguage('灯台は岬に立っていた。霧の中で迷った船は、その光をたどって帰ってきた。').code).toBe('ja');
    expect(detectLanguage('كانت المنارة على رأس الجزيرة، وعادت السفن التائهة في الضباب على ضوئها.').code).toBe('ar');
    expect(detectLanguage('המגדלור עמד על הכף, והספינות שאבדו בערפל חזרו לאורו.').code).toBe('he');
    expect(detectLanguage('등대는 곶 위에 서 있었고, 안개 속에서 길을 잃은 배들은 그 빛을 따라 돌아왔다.').code).toBe('ko');
  });

  it('decodes legacy text encodings', () => {
    const cyrillic = 'Маяк стоял на мысе, и корабли возвращались на его свет. Глава первая.';
    const win1251 = Uint8Array.from(cyrillic, (ch) => {
      const cp = ch.codePointAt(0)!;
      return cp < 0x80 ? cp : cp >= 0x410 && cp <= 0x44f ? cp - 0x410 + 0xc0 : 0x3f;
    });
    expect(decodeText(win1251)).toEqual({ text: cyrillic, encoding: 'windows-1251' });

    const latin = 'Él dijo: «¿Qué pasó en el faro?» — Nadie respondió.';
    const win1252 = Uint8Array.from(latin, (ch) => (ch === '—' ? 0x97 : ch === '«' ? 0xab : ch === '»' ? 0xbb : ch.codePointAt(0)!));
    expect(decodeText(win1252).text).toBe(latin);

    // Polish in its own code page, which windows-1252 would turn into "mo¿e" and "w³asnie".
    const polish = 'Może właśnie dlatego zapalała lampę każdego wieczoru, chociaż nikt jej o to nie prosił.';
    const cp1250: Record<string, number> = { ż: 0xbf, ł: 0xb3, ś: 0x9c, ą: 0xb9, ę: 0xea };
    const win1250 = Uint8Array.from(polish, (ch) => cp1250[ch] ?? ch.codePointAt(0)!);
    expect(decodeText(win1250)).toEqual({ text: polish, encoding: 'windows-1250' });

    const bom = new Uint8Array([0xff, 0xfe, ...Array.from('Hé', (c) => [c.charCodeAt(0), 0]).flat()]);
    expect(decodeText(bom)).toEqual({ text: 'Hé', encoding: 'utf-16le' });
    expect(decodeText(new TextEncoder().encode('naïve café')).encoding).toBe('utf-8');
    expect(htmlCharset(new TextEncoder().encode('<html><head><meta charset="Shift_JIS">'))).toBe('shift_jis');
  });
});

describe('typesetting other scripts', () => {
  const book = (lang: string, text: string) => {
    const b = newBook({ language: lang, title: 'T', author: 'A' });
    b.elements[3].content = paragraphs(text, 'Second paragraph.');
    return b;
  };
  const render = (b: ReturnType<typeof book>) =>
    renderBook({ book: b, theme: themeOf(b), target: 'preview', hrefFor: () => '#', ornament: (id) => ORNAMENTS[id] });

  it('skips drop caps and lead-ins where they don’t belong', () => {
    const latin = render(book('es', 'Era una noche oscura.'))[3].html;
    expect(latin).toContain('<span class="dropcap">E</span>');
    const arabic = render(book('ar', 'كانت المنارة على رأس الجزيرة.'))[3].html;
    expect(arabic).not.toContain('dropcap');
    expect(arabic).not.toContain('class="lead"');
    expect(arabic).toContain('<span class="chapter-label running">الفصل');
  });

  it('marks right-to-left EPUBs and their page progression', async () => {
    const zip = await JSZip.loadAsync(await buildEpub(book('he', 'המגדלור עמד על הכף.')));
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<spine toc="ncx" page-progression-direction="rtl">');
    expect(opf).toContain('<dc:language>he</dc:language>');
    const chapter = Object.keys(zip.files).find((p) => p.endsWith('-chapter.xhtml'))!;
    expect(await zip.file(chapter)!.async('string')).toContain('lang="he" dir="rtl">');
    expect(await zip.file('OEBPS/nav.xhtml')!.async('string')).toContain('<h1>תוכן העניינים</h1>');
  });

  it('mirrors the gutter and the spreads for right-to-left print', () => {
    const rtl = printCss(book('ar', 'نص'), { pages: 100, fontUrl: (f) => f });
    expect(rtl).toMatch(/@page :left \{\s*margin-left: 0.675in;\s*margin-right: 0.6in;/);
    expect(rtl).toMatch(/@page :right \{\s*margin-left: 0.6in;\s*margin-right: 0.675in;/);
    const html = printDocument(book('ar', 'نص'), { fontUrl: (f) => f, pagedUrl: 'p.js', spreads: true });
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('row-reverse');
  });

  it('picks fonts and subsets for the script', () => {
    expect(fontStack('libre-baskerville', 'ru')).toBe('"Libre Baskerville", "EB Garamond", "Georgia", serif');
    expect(fontStack('lora', 'ar').startsWith('"Noto Naskh Arabic"')).toBe(true);
    expect(fontStack('lora', 'ja')).toContain('"Yu Mincho"');
    const subsets = (text: string) => facesFor(['eb-garamond'], text).filter((f) => f.face.weight === 400 && f.face.style === 'normal').map((f) => f.face.subset).sort();
    expect(subsets('Hello')).toEqual(['latin']);
    expect(subsets('Привет')).toEqual(['cyrillic', 'latin']);
    expect(subsets('Ελληνικά')).toContain('greek');
    const css = printCss(book('hi', 'प्रकाशस्तंभ'), { pages: 50, fontUrl: (f) => f, text: 'प्रकाशस्तंभ' });
    expect(css).toContain('noto-serif-devanagari-devanagari-400-normal.woff2');
    expect(css).not.toContain('cyrillic');
  });

  it('uses the book language for the strings it generates', () => {
    expect(bookStrings('ko').contents).toBe('목차');
    const html = render(book('ko', '등대는 곶 위에 서 있었다.')).find((r) => r.element.kind === 'toc')!.html;
    expect(html).toContain('목차');
  });
});

describe('bug fixes', () => {
  it('lets a byte-order mark beat a declared charset, and ignores unknown charsets', () => {
    const text = 'Él dijo «¿qué?»';
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);
    expect(decodeText(withBom, 'iso-8859-1')).toEqual({ text, encoding: 'utf-8' });
    expect(decodeText(new TextEncoder().encode(text), 'x-mac-roman-old')).toEqual({ text, encoding: 'utf-8' });
  });

  it('counts words in scripts written without spaces', () => {
    const book = newBook({ language: 'ja' });
    book.elements = [book.elements[3]];
    book.elements[0].content = paragraphs('灯台は毎夕灯った。', 'Ada');
    expect(textStats(book)).toEqual({ words: 1, cjk: 8 });
    expect(wordCount(book)).toBe(9);

    const thai = newBook({ language: 'th' });
    thai.elements = [thai.elements[3]];
    thai.elements[0].content = paragraphs('ประภาคารเปิดไฟทุกเย็น');
    expect(textStats(thai).words).toBeGreaterThan(2);
  });

  it('estimates pages for CJK books from their characters', () => {
    const book = newBook({ language: 'zh-Hans' });
    book.elements[3].content = paragraphs(...Array.from({ length: 1000 }, () => '灯塔立在海角上，在雾中迷路的船只循着它的光回来了。'.repeat(4)));
    // ~100,000 characters is a 150+ page book, not the handful a space-based count gives.
    expect(estimatePages(book)).toBeGreaterThan(120);
  });

  it('keeps letterspacing and synthesized italics off scripts outside the table', () => {
    for (const lang of ['ta', 'syr', 'bn']) expect(languageCss(lang)).toContain('letter-spacing: 0 !important');
    expect(languageCss('en')).toBe('');
    expect(languageCss('ru')).toBe('');
  });

  it('re-lays out until the gutter tier settles, at most three times', async () => {
    const book = newBook();
    const once = await layoutUntilSettled(book, async () => 40);
    expect(once).toEqual({ pages: 40, passes: 1 });
    const hints: number[] = [];
    const twice = await layoutUntilSettled(book, async (hint) => (hints.push(hint), hint < 100 ? 200 : 210));
    expect(twice).toEqual({ pages: 210, passes: 2 });
    expect(hints[1]).toBe(200);
    const capped = await layoutUntilSettled(book, async (hint) => (hint < 100 ? 200 : hint < 250 ? 400 : 100));
    expect(capped.passes).toBe(3);
  });
});
