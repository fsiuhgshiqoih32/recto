// Copies the OFL font files and the paged.js polyfill out of node_modules into
// public/ so the app can serve them, and writes src/themes/font-manifest.json:
// every face with its subset and unicode-range, read from Fontsource's CSS.
// Browsers then download only the subsets a book actually uses.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Book fonts: the faces themes use, in every script subset Fontsource ships.
const BOOK_FONTS = ['eb-garamond', 'crimson-pro', 'libre-baskerville', 'cormorant-garamond', 'source-serif-4', 'lora'];
const BOOK_CSS = ['400.css', '400-italic.css', '600.css', '700.css'];
// Script fonts for languages the book fonts can't set; only their own script subset.
const SCRIPT_FONTS = {
  'noto-naskh-arabic': 'arabic',
  'noto-serif-hebrew': 'hebrew',
  'noto-serif-devanagari': 'devanagari',
  'noto-serif-thai': 'thai',
};
const SCRIPT_CSS = ['400.css', '700.css'];
const SKIP_SUBSETS = new Set(['math', 'symbols']);

function parseFaces(pkg, cssFile) {
  const css = readFileSync(join(root, 'node_modules/@fontsource', pkg, cssFile), 'utf8');
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
    const get = (prop) => new RegExp(`${prop}:\\s*([^;]+);`).exec(body)?.[1].trim();
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(body)[1];
    return {
      family: get('font-family').replace(/['"]/g, ''),
      file,
      subset: file.slice(pkg.length + 1).replace(/-\d+-(normal|italic)\.woff2$/, ''),
      weight: Number(get('font-weight')),
      style: get('font-style'),
      unicodeRange: get('unicode-range'),
    };
  });
}

const manifest = {};
const copy = (pkg, faces) => {
  mkdirSync(join(root, 'public/fonts'), { recursive: true });
  for (const face of faces) {
    copyFileSync(join(root, 'node_modules/@fontsource', pkg, 'files', face.file), join(root, 'public/fonts', face.file));
  }
  manifest[pkg] = { family: faces[0].family, faces: faces.map(({ family, ...face }) => face) };
};

for (const pkg of BOOK_FONTS) {
  copy(pkg, BOOK_CSS.flatMap((css) => parseFaces(pkg, css)).filter((f) => !SKIP_SUBSETS.has(f.subset)));
}
for (const [pkg, subset] of Object.entries(SCRIPT_FONTS)) {
  copy(pkg, SCRIPT_CSS.flatMap((css) => parseFaces(pkg, css)).filter((f) => f.subset === subset));
}
writeFileSync(join(root, 'src/themes/font-manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);

mkdirSync(join(root, 'public/vendor'), { recursive: true });
copyFileSync(join(root, 'node_modules/pagedjs/dist/paged.polyfill.js'), join(root, 'public/vendor/paged.polyfill.js'));

const count = Object.values(manifest).reduce((n, f) => n + f.faces.length, 0);
console.log(`copied ${count} font files (${Object.keys(manifest).length} families) and paged.polyfill.js into public/`);
