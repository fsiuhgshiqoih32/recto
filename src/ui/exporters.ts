import { desktop } from '../desktop';
import type { Book } from '../model/book';
import { newId } from '../model/book';
import { type PagedMessage, printDocument } from '../export/print/paged';
import { layoutUntilSettled } from '../export/print/layout';
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

export async function exportEpub(book: Book): Promise<void> {
  const { buildEpub } = await import('../export/epub/package');
  const bytes = await buildEpub(book, { loadFont });
  downloadBlob(new Blob([bytes as BlobPart], { type: 'application/epub+zip' }), fileNameFor(book, 'epub'));
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

/**
 * Lays the whole book out in a hidden frame and opens the browser's print
 * dialog on it ("Save as PDF").
 */
export async function printBook(book: Book, onLaidOut?: (pages: number) => void): Promise<number> {
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
    onLaidOut?.(pages);
    // Let the "laid out" state paint before the (blocking) print dialog opens.
    await new Promise((resolve) => setTimeout(resolve, 50));
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    return pages;
  } finally {
    frame.remove();
  }
}
