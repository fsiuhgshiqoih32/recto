// Finishing touches on a printed PDF, after Chromium has written it: document
// metadata, and the TrimBox and BleedBox that tell a printer where each bleed
// page is cut. Chromium's printToPDF can do neither. Runs in Node (the desktop
// shell and the CLI); the browser's print dialog writes its own PDF.

import { PDFDocument, PDFName, ReadingDirection } from '@pdfme/pdf-lib';

export interface PdfFinish {
  title: string;
  author: string;
  language: string;
  /** A book interior, or a wrap-around cover. */
  kind: 'interior' | 'cover';
  /**
   * Bleed beyond the trim, in inches: at the top, bottom and outside edge of
   * an interior page; on all four sides of a cover.
   */
  bleed?: number;
  /** Right-to-left books bind on the right, so their outside edges swap. */
  rtl?: boolean;
}

const PT = 72;

export async function finishPdf(bytes: Uint8Array, finish: PdfFinish): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  doc.setTitle(finish.kind === 'cover' ? `${finish.title || 'Untitled'} (cover)` : finish.title || 'Untitled', { showInWindowTitleBar: true });
  if (finish.author) doc.setAuthor(finish.author);
  doc.setCreator('Recto');
  doc.setProducer('Recto (Chromium print engine)');
  doc.setLanguage(finish.language || 'en');
  const b = (finish.bleed ?? 0) * PT;
  if (b > 0) {
    doc.getPages().forEach((page, index) => {
      const { width, height } = page.getMediaBox();
      page.setBleedBox(0, 0, width, height);
      if (finish.kind === 'cover') {
        page.setTrimBox(b, b, width - 2 * b, height - 2 * b);
        return;
      }
      // Page 1 is a right-hand page in a left-to-right book: its outside edge,
      // and so its bleed, is on the right. Left-hand pages bleed on the left.
      const bleedsRight = (index % 2 === 0) !== !!finish.rtl;
      page.setTrimBox(bleedsRight ? 0 : b, b, width - b, height - 2 * b);
    });
  }
  // Viewers open an interior as facing pages, page 1 alone on the recto side;
  // right-to-left books also turn their pages the other way.
  if (finish.kind === 'interior') {
    doc.catalog.set(PDFName.of('PageLayout'), PDFName.of('TwoPageRight'));
    if (finish.rtl) doc.catalog.getOrCreateViewerPreferences().setReadingDirection(ReadingDirection.R2L);
  }
  // No object streams: they're a PDF 1.5 feature some print workflows (and PDF/X-1a) don't accept.
  return doc.save({ useObjectStreams: false });
}
