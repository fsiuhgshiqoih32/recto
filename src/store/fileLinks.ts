// Desktop app: which .recto file each book was opened from or last saved to,
// and that file's modification time then, so Save can write it back in place
// and notice when something else (a synced folder, another computer) changed
// it in between. A per-device convenience, so it lives in localStorage.

export interface FileLink {
  path: string;
  modified: number;
}

const KEY = 'recto:file-links';

function read(): Record<string, FileLink> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, FileLink>;
  } catch {
    return {};
  }
}

export function fileLink(bookId: string): FileLink | undefined {
  return read()[bookId];
}

export function linkFile(bookId: string, link: FileLink): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [bookId]: link }));
  } catch {
    // Storage unavailable: Save asks where to save each time.
  }
}
