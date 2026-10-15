import type { PdfFinish } from './export/print/finish';

// The bridge the Electron shell (electron/preload.ts) exposes. Undefined in a
// plain browser, where Recto falls back to web APIs.

export type MenuCommand = 'import' | 'open' | 'save' | 'save-as' | 'export-epub' | 'export-pdf' | 'new-book';

export interface OpenedFile {
  name: string;
  text: string;
  /** Where the file is, and its modification time when read (for Save in place). */
  path?: string;
  modified?: number;
}

export interface SaveOptions {
  /** The file the book was opened from or last saved to. */
  path?: string;
  /** Its modification time then: a different one now means something else changed it. */
  modified?: number;
  /** Suggested file name for a Save dialog. */
  name: string;
  /** Write even though the file changed on disk. */
  force?: boolean;
  /** Always ask where to save. */
  saveAs?: boolean;
}

export type SaveResult = { path: string; modified: number } | { conflict: { modified: number } } | null;

export interface DesktopTools {
  kindlePreviewer: boolean;
  /** The installed Ghostscript, and the PDF/X it can make; null without one. */
  ghostscript: { version: string; standard: 'PDF/X-1a' | 'PDF/X-3' } | null;
}

export interface RectoDesktop {
  platform: string;
  /** Sets the spellchecker's languages; returns the dictionaries actually in use. */
  setSpellcheckLanguages(codes: string[]): Promise<{ applied: string[] }>;
  /** Lays out a print document (from printDocument) off-screen; returns its page count. */
  layoutPdf(html: string): Promise<{ pages: number }>;
  /** Asks where to save, then writes the last laid-out document as a PDF, finished with metadata and page boxes. Null if cancelled. */
  savePdf(fileName: string, finish?: PdfFinish, options?: { outline?: boolean; tagged?: boolean; pdfx?: { gray: boolean } }): Promise<{ path: string } | null>;
  cancelPdf(): Promise<void>;
  /** A .recto file the app was launched with (double-clicked in the file manager), if any. */
  takePendingFile(): Promise<OpenedFile | null>;
  /** Shows an Open dialog for .recto files. */
  openRecto(): Promise<OpenedFile | null>;
  /** Saves the book's .recto text in place (or asks where); reports a conflict instead if the file changed on disk. Null if cancelled. */
  saveRecto(text: string, options: SaveOptions): Promise<SaveResult>;
  /** Optional programs Recto can use when they're installed. */
  findTools(): Promise<DesktopTools>;
  openInKindlePreviewer(bytes: Uint8Array, fileName: string): Promise<{ path: string }>;
  onOpenFile(callback: (file: OpenedFile) => void): () => void;
  onMenu(callback: (command: MenuCommand) => void): () => void;
}

export const desktop: RectoDesktop | undefined = (globalThis as { rectoDesktop?: RectoDesktop }).rectoDesktop;
