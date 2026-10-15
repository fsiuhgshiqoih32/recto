import { desktop } from '../desktop';
import type { Book } from '../model/book';
import { newId } from '../model/book';
import { type PagedMessage, printDocument } from '../export/print/paged';
import { layoutUntilSettled } from '../export/print/layout';
import { TRIMS, pageMargins } from '../export/print/pageCss';
import type { EpubMessage, LayoutStats } from '../preflight/checks';
import { fontUrl, loadFont, pagedUrl } from '../preview/assets';
import { loadHyphenator } from '../i18n/hyphenate';
import { fileNameFor, serializeBook } from '../store/file';

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Builds the EPUB and downloads it; resolves to its size in bytes. */
export async function exportEpub(book: Book): Promise<number> {
  const { buildEpub } = await import('../export/epub/package');
  const bytes = await buildEpub(book, { loadFont });
  downloadBlob(new Blob([bytes as BlobPart], { type: 'application/epub+zip' }), fileNameFor(book, 'epub'));
  return bytes.length;
}

/** Builds one EPUB per store into a zip and downloads it; resolves to the number of editions. */
export async function exportStoreEditions(book: Book): Promise<number> {
  const { STORE_EDITIONS, buildStoreEditions } = await import('../export/epub/package');
  const base = fileNameFor(book, 'epub').replace(/\.epub$/, '');
  const bytes = await buildStoreEditions(book, base, { loadFont });
  downloadBlob(new Blob([bytes as BlobPart], { type: 'application/zip' }), `${base}-store-editions.zip`);
  return STORE_EDITIONS.length;
}

/**
 * Builds the EPUB and validates it with epubcheck-ts, a port of the EPUBCheck
 * that stores run on upload. Its verdict is advisory; CI runs the official one.
 */
export async function validateEpub(book: Book): Promise<{ bytes: number; messages: EpubMessage[] }> {
  const { buildEpub } = await import('../export/epub/package');
  const data = await buildEpub(book, { loadFont });
  const { EpubCheck } = await import('@likecoin/epubcheck-ts');
  const result = await EpubCheck.validate(data);
  return {
    bytes: data.length,
    messages: result.messages.map((m) => ({ severity: m.severity, id: m.id, message: m.message, path: m.location?.path })),
  };
}

export function saveRectoFile(book: Book): void {
  downloadBlob(new Blob([serializeBook(book)], { type: 'application/json' }), fileNameFor(book, 'recto'));
}

/**
 * Desktop app: lays the book out off-screen, then writes the PDF straight to a
 * file the author picks. Resolves to the saved path, or null if they cancelled.
 */
export async function savePdfDesktop(book: Book, onLaidOut?: (pages: number) => void): Promise<{ path: string; pages: number } | null> {
  if (!desktop) throw new Error('Not running in the desktop app.');
  const shell = desktop;
  const hyphenate = (await loadHyphenator(book.meta.language)) ?? undefined;
  const { pages } = await layoutUntilSettled(book, async (hint) => {
    const { pages: laidOut } = await shell.layoutPdf(printDocument(book, { fontUrl, pagedUrl: pagedUrl(), pages: hint, hyphenate }));
    return laidOut;
  });
  onLaidOut?.(pages);
  const saved = await shell.savePdf(fileNameFor(book, 'pdf'));
  return saved ? { path: saved.path, pages } : null;
}

/** Lays a print document out in a frame; resolves to its page count once paged.js reports back. */
function layoutInFrame(frame: HTMLIFrameElement, html: (renderId: string) => string): Promise<number> {
  return new Promise((resolve, reject) => {
    const renderId = newId();
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timeout);
    };
    const onMessage = (e: MessageEvent<PagedMessage>) => {
      if (e.data?.type !== 'recto:paged' || e.data.renderId !== renderId) return;
      cleanup();
      resolve(e.data.pages);
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('The print layout took too long.'));
    }, 180_000);
    window.addEventListener('message', onMessage);
    frame.srcdoc = html(renderId);
  });
}

/** Lays the whole book out in a hidden frame, then hands the frame to `use` before removing it. */
async function withPrintLayout<T>(book: Book, use: (frame: HTMLIFrameElement, pages: number) => Promise<T> | T): Promise<T> {
  const hyphenate = (await loadHyphenator(book.meta.language)) ?? undefined;
  const frame = document.createElement('iframe');
  frame.title = 'Print layout';
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '1000px', height: '800px', border: '0' });
  document.body.appendChild(frame);
  try {
    const { pages } = await layoutUntilSettled(book, (hint) =>
      layoutInFrame(frame, (renderId) => printDocument(book, { fontUrl, pagedUrl: pagedUrl(), pages: hint, renderId, hyphenate })),
    );
    return await use(frame, pages);
  } finally {
    frame.remove();
  }
}

/**
 * Lays the whole book out in a hidden frame and opens the browser's print
 * dialog on it ("Save as PDF").
 */
export function printBook(book: Book, onLaidOut?: (pages: number) => void): Promise<number> {
  return withPrintLayout(book, async (frame, pages) => {
    onLaidOut?.(pages);
    // Let the "laid out" state paint before the (blocking) print dialog opens.
    await new Promise((resolve) => setTimeout(resolve, 50));
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    return pages;
  });
}

/** Lays the book out as it will print and measures what printers check: page count, blank runs, image resolution. */
export function measurePrintLayout(book: Book): Promise<LayoutStats> {
  return withPrintLayout(book, (frame, pages) => {
    const doc = frame.contentDocument!;
    const sheets = Array.from(doc.querySelectorAll<HTMLElement>('.pagedjs_page'));
    const blank = sheets.map((page) => {
      const content = page.querySelector('.pagedjs_page_content');
      return !content?.textContent?.trim() && !content?.querySelector('img, svg');
    });
    // Runs of blank pages before the last page with content (trailing blanks are padding).
    const lastContent = blank.lastIndexOf(false);
    const blankRuns: LayoutStats['blankRuns'] = [];
    blank.forEach((isBlank, i) => {
      if (!isBlank || i > lastContent) return;
      const run = blankRuns[blankRuns.length - 1];
      if (run && run.start + run.length === i + 1) run.length++;
      else blankRuns.push({ start: i + 1, length: 1 });
    });
    const images = Array.from(doc.querySelectorAll<HTMLImageElement>('.pagedjs_page img.figure')).map((img) => {
      // Pages are laid out at their real size in CSS pixels, 96 to the inch.
      const inches = img.getBoundingClientRect().width / 96;
      const elementId = img.closest('section[id^="el-"]')?.id.slice(3);
      return { elementId, width: img.naturalWidth, ppi: Math.round(img.naturalWidth / Math.max(inches, 0.01)) };
    });
    return { pages, blankRuns, images, inside: pageMargins(TRIMS[book.style.trim], pages).inside };
  });
}
