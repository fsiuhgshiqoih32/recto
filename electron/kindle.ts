// Kindle Previewer bridge: opens an EPUB in Amazon's Kindle Previewer 3 when
// it is installed (it is free but proprietary, so Recto only looks for it and
// never ships it). There is no Linux version.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';

/** The Kindle Previewer executable (or, on macOS, app bundle), or null. */
export function findKindlePreviewer(): string | null {
  const override = process.env.RECTO_KINDLE_PREVIEWER;
  if (override) return existsSync(override) ? override : null;
  const places =
    process.platform === 'win32'
      ? [process.env.LOCALAPPDATA, process.env['ProgramFiles(x86)'], process.env.ProgramFiles]
          .filter((dir): dir is string => !!dir)
          .map((dir) => join(dir, 'Amazon', 'Kindle Previewer 3', 'Kindle Previewer 3.exe'))
      : process.platform === 'darwin'
        ? ['/Applications/Kindle Previewer 3.app', join(homedir(), 'Applications', 'Kindle Previewer 3.app')]
        : [];
  return places.find((place) => existsSync(place)) ?? null;
}

/** Writes the EPUB to a temporary folder and opens it in Kindle Previewer; resolves to the EPUB's path. */
export async function openInKindlePreviewer(previewer: string, bytes: Uint8Array, fileName: string): Promise<string> {
  const dir = join(tmpdir(), 'recto-kindle');
  await mkdir(dir, { recursive: true });
  const file = join(dir, basename(fileName).replace(/[^\w.-]+/g, '-') || 'book.epub');
  await writeFile(file, bytes);
  const child = previewer.endsWith('.app') ? spawn('open', ['-a', previewer, file], { detached: true, stdio: 'ignore' }) : spawn(previewer, [file], { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => {});
  child.unref();
  return file;
}
