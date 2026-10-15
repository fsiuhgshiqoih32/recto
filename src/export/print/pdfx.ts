// PDF/X-1a through a Ghostscript the author installed themselves. Chromium
// writes every colour as RGB; printers such as IngramSpark ask for PDF/X-1a,
// whose colours are grey or CMYK. Ghostscript (AGPL) does that conversion.
// Recto never bundles it, only finds and runs a copy that is already there.
// Node only: the desktop shell and the CLI use this, never the web app.

import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

export interface Ghostscript {
  path: string;
  version: string;
}

export type PdfxStandard = 'PDF/X-1a' | 'PDF/X-3';

/**
 * What this Ghostscript can write. PDF/X-1a arrived in 10.05 (March 2025);
 * older versions write PDF/X-3, which IngramSpark accepts too. With every
 * colour converted to grey or CMYK, the two differ only in what they declare.
 */
export function pdfxStandard(version: string): PdfxStandard {
  const [major, minor] = version.split('.').map((n) => Number.parseInt(n, 10) || 0);
  return major > 10 || (major === 10 && minor >= 5) ? 'PDF/X-1a' : 'PDF/X-3';
}

function run(file: string, args: string[], timeout: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout: String(stdout), stderr: String(stderr) }));
      else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** Where Ghostscript might be: RECTO_GHOSTSCRIPT, the PATH, then the usual install folders. */
function candidates(): string[] {
  const names = process.platform === 'win32' ? ['gswin64c.exe', 'gswin32c.exe'] : ['gs'];
  const onPath = (process.env.PATH ?? '').split(delimiter).filter(Boolean).flatMap((dir) => names.map((name) => join(dir, name)));
  const installed: string[] = [];
  if (process.platform === 'win32') {
    for (const root of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean) as string[]) {
      const gs = join(root, 'gs');
      if (!existsSync(gs)) continue;
      // gs10.05.1, gs10.04.0…: newest first.
      const versions = readdirSync(gs).filter((d) => /^gs\d/.test(d)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const version of versions) installed.push(...names.map((name) => join(gs, version, 'bin', name)));
    }
  } else {
    installed.push('/opt/homebrew/bin/gs', '/usr/local/bin/gs', '/usr/bin/gs');
  }
  return [process.env.RECTO_GHOSTSCRIPT, ...onPath, ...installed].filter((p): p is string => !!p);
}

/** Finds a working Ghostscript, or null. */
export async function findGhostscript(): Promise<Ghostscript | null> {
  for (const path of [...new Set(candidates())]) {
    if (!existsSync(path)) continue;
    try {
      const { stdout } = await run(path, ['--version'], 10_000);
      return { path, version: stdout.trim() };
    } catch {
      // Not runnable: try the next one.
    }
  }
  return null;
}

/** A PostScript string literal. */
function psString(text: string): string {
  return `(${text.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?')})`;
}

/**
 * Recto's PDF/X definition: the document info PDF/X-1a needs and an output
 * intent naming a registered printing condition (CGATS TR 001, US web offset),
 * so no ICC profile has to travel with the file.
 */
export function pdfxDefinition(title: string, standard: PdfxStandard = 'PDF/X-1a'): string {
  const version = standard === 'PDF/X-1a' ? '/GTS_PDFXVersion (PDF/X-1:2001) /GTS_PDFXConformance (PDF/X-1a:2001)' : '/GTS_PDFXVersion (PDF/X-3:2002)';
  return `%!PS
% Written by Recto for Ghostscript's pdfwrite (${standard}).
[ ${version} /Title ${psString(title || 'Untitled')} /Trapped /False /DOCINFO pdfmark
[ /_objdef {RectoOutputIntent} /type /dict /OBJ pdfmark
[ {RectoOutputIntent} <<
  /Type /OutputIntent
  /S /GTS_PDFX
  /OutputCondition (Commercial and specialty offset printing)
  /OutputConditionIdentifier (CGATS TR 001)
  /RegistryName (http://www.color.org)
  /Info (U.S. Web Coated \\(SWOP\\))
>> /PUT pdfmark
[ {Catalog} << /OutputIntents [ {RectoOutputIntent} ] >> /PUT pdfmark
`;
}

export interface PdfxOptions {
  title: string;
  /** Black-and-white interiors convert to grey; colour ones to CMYK. */
  gray: boolean;
}

/**
 * Converts a finished print PDF to PDF/X-1a (PDF/X-3 with Ghostscript before
 * 10.05). The result still needs its page boxes and metadata put back
 * (finishPdf), because pdfwrite rewrites them.
 */
export async function convertToPdfx(gs: Ghostscript, pdf: Uint8Array, options: PdfxOptions): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'recto-pdfx-'));
  try {
    const input = join(dir, 'in.pdf');
    const output = join(dir, 'out.pdf');
    const definition = join(dir, 'pdfx.ps');
    await writeFile(input, pdf);
    const standard = pdfxStandard(gs.version);
    await writeFile(definition, pdfxDefinition(options.title, standard), 'latin1');
    const model = options.gray ? 'Gray' : 'CMYK';
    try {
      await run(
        gs.path,
        [
          // Before 10.05, -dPDFX is a plain switch (PDF/X-3); from 10.05 it takes the level.
          standard === 'PDF/X-1a' ? '-dPDFX=1' : '-dPDFX', '-dBATCH', '-dNOPAUSE', '-dNOOUTERSAVE',
          '-sDEVICE=pdfwrite', `-sColorConversionStrategy=${model}`, `-dProcessColorModel=/Device${model}`,
          // Keep images sharp: printers want 300 ppi, and Recto checks that before export.
          '-dDownsampleColorImages=false', '-dDownsampleGrayImages=false', '-dDownsampleMonoImages=false',
          '-dEmbedAllFonts=true', '-dSubsetFonts=true',
          `-sOutputFile=${output}`, definition, input,
        ],
        10 * 60_000,
      );
    } catch (error) {
      const output = `${(error as { stdout?: string }).stdout ?? ''}\n${(error as { stderr?: string }).stderr ?? ''}`.trim();
      const detail = output.split('\n').filter((line) => line.trim()).slice(-12).join(' ').slice(-1200) || (error as Error).message;
      throw new Error(`Ghostscript couldn’t make the PDF/X file: ${detail}`);
    }
    return new Uint8Array(await readFile(output));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
