import type { PdfFinish } from './export/print/finish';

// The bridge the Electron shell (electron/preload.ts) exposes. Undefined in a
// plain browser, where Recto falls back to web APIs.

export type MenuCommand = 'import' | 'open' | 'save' | 'export-epub' | 'export-pdf' | 'new-book';

export interface OpenedFile {
  name: string;
  text: string;
}

export interface RectoDesktop {
  platform: string;
  /** Sets the spellchecker's languages; returns the dictionaries actually in use. */
  setSpellcheckLanguages(codes: string[]): Promise<{ applied: string[] }>;
  /** Lays out a print document (from printDocument) off-screen; returns its page count. */
  layoutPdf(html: string): Promise<{ pages: number }>;
  /** Asks where to save, then writes the last laid-out document as a PDF, finished with metadata and page boxes. Null if cancelled. */
  savePdf(fileName: string, finish?: PdfFinish, options?: { outline?: boolean; tagged?: boolean }): Promise<{ path: string } | null>;
  cancelPdf(): Promise<void>;
  /** A .recto file the app was launched with (double-clicked in the file manager), if any. */
  takePendingFile(): Promise<OpenedFile | null>;
  onOpenFile(callback: (file: OpenedFile) => void): () => void;
  onMenu(callback: (command: MenuCommand) => void): () => void;
}

export const desktop: RectoDesktop | undefined = (globalThis as { rectoDesktop?: RectoDesktop }).rectoDesktop;
