import { desktop } from '../desktop';
import type { Book } from '../model/book';
import { coverDocument } from '../export/cover/document';
import { type CoverWrap, templateSvg } from '../export/cover/wrap';
import { fontUrl } from '../preview/assets';
import { pdfFinish } from '../export/print/paged';
import { fileNameFor } from '../store/file';
import { downloadBlob } from './exporters';
import { t } from '../i18n/ui';

/** KDP's ideal ebook cover height; stores scale down from there. */
const STORE_HEIGHT = 2560;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The cover image could not be read.'));
    img.src = src;
  });
}

/**
 * The ebook cover as stores want it uploaded: a JPEG no taller than 2560 px
 * (shrunk, never enlarged), transparency flattened onto white.
 */
export async function storeCoverJpeg(cover: string): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImage(cover);
  const scale = Math.min(1, STORE_HEIGHT / img.naturalHeight);
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error(t('The cover could not be converted to JPEG.'));
  return { blob, width, height };
}

export async function downloadStoreCover(book: Book): Promise<{ width: number; height: number }> {
  if (!book.meta.cover) throw new Error(t('Add a cover in the Book tab first.'));
  const { blob, width, height } = await storeCoverJpeg(book.meta.cover);
  downloadBlob(blob, fileNameFor(book, 'jpg').replace(/\.jpg$/, '-cover.jpg'));
  return { width, height };
}

/** The average color along the cover's spine-side edge, to continue the art across the spine and back. */
export async function edgeColor(cover: string, side: 'left' | 'right' = 'left'): Promise<string> {
  const img = await loadImage(cover);
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const strip = Math.max(1, Math.round(img.naturalWidth * 0.04));
  ctx.drawImage(img, side === 'left' ? 0 : img.naturalWidth - strip, 0, strip, img.naturalHeight, 0, 0, 8, 64);
  const data = ctx.getImageData(0, 0, 8, 64).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const n = data.length / 4;
  return `#${[r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('')}`;
}

export function downloadTemplate(book: Book, wrap: CoverWrap): void {
  downloadBlob(new Blob([templateSvg(book, wrap)], { type: 'image/svg+xml' }), fileNameFor(book, 'svg').replace(/\.svg$/, '-cover-template.svg'));
}

/**
 * Prints the full wrap cover to PDF: straight to a file in the desktop app,
 * through the browser's print dialog ("Save as PDF") on the web.
 */
export async function printCover(book: Book, wrap: CoverWrap, background: string): Promise<{ path: string } | 'printed' | 'canceled'> {
  const name = fileNameFor(book, 'pdf').replace(/\.pdf$/, '-cover.pdf');
  if (desktop) {
    await desktop.layoutPdf(coverDocument(book, wrap, { fontUrl, background }));
    const saved = await desktop.savePdf(name, pdfFinish(book, 'cover'));
    return saved ?? 'canceled';
  }
  const frame = document.createElement('iframe');
  frame.title = 'Cover layout';
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '1600px', height: '1000px', border: '0' });
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(t('The cover took too long to lay out.'))), 60_000);
      const onMessage = (e: MessageEvent<{ type?: string }>) => {
        if (e.source !== frame.contentWindow || e.data?.type !== 'recto:cover') return;
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        resolve();
      };
      window.addEventListener('message', onMessage);
      frame.srcdoc = coverDocument(book, wrap, { fontUrl, background });
    });
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    return 'printed';
  } finally {
    frame.remove();
  }
}
