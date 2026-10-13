# Notices

Recto's own code is MIT-licensed (see `LICENSE`). It ships or depends on the following.

## Fonts (SIL Open Font License 1.1)

These are served from `public/fonts/`, copied out of the `@fontsource` packages at build time. They are embedded in exported PDFs, and in EPUBs when "Embed fonts" is on. The OFL allows embedding and redistribution with documents.

| Font | Copyright |
| --- | --- |
| EB Garamond | Copyright 2017 The EB Garamond Project Authors |
| Crimson Pro | Copyright 2018 The Crimson Pro Project Authors |
| Libre Baskerville | Copyright 2012 The Libre Baskerville Project Authors |
| Cormorant Garamond | Copyright 2015 The Cormorant Project Authors |
| Source Serif 4 | Google Inc. (as stated in the packaged license) |
| Lora | Copyright 2011 The Lora Project Authors, with Reserved Font Name "Lora" |
| Noto Naskh Arabic, Noto Serif Hebrew, Noto Serif Devanagari, Noto Serif Thai | Copyright The Noto Project Authors |

The app's own interface is set in two more OFL fonts, bundled from the `@fontsource-variable` packages so the desktop app works offline. They are never embedded in books.

| Font | Copyright |
| --- | --- |
| Instrument Sans | Copyright 2022 The Instrument Sans Project Authors |
| Newsreader | Copyright 2020 The Newsreader Project Authors |

The font files are used unmodified. Each package's `LICENSE` file under `node_modules/@fontsource/` or `node_modules/@fontsource-variable/` has the full notice.

Full license text: https://openfontlicense.org

## Libraries

| Library | License | Used for |
| --- | --- | --- |
| [paged.js](https://pagedjs.org) | MIT | CSS Paged Media layout for print |
| [TipTap](https://tiptap.dev) / ProseMirror | MIT | Manuscript editor |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | BSD-2-Clause | `.docx` import |
| [markdown-it](https://github.com/markdown-it/markdown-it) | MIT | Markdown import |
| [JSZip](https://stuk.github.io/jszip/) | MIT | EPUB packaging |
| [Dexie](https://dexie.org) | Apache-2.0 | Local library in IndexedDB |
| [React](https://react.dev) | MIT | User interface |
| [hyphen](https://github.com/ytiurin/hyphen) | ISC | Print hyphenation. Its patterns come from the TeX [hyph-utf8](https://github.com/hyphenation/tex-hyphen) project, and each language's patterns keep their original license there |
| [Electron](https://www.electronjs.org) | MIT | Desktop app. The installer also ships Chromium's license file (`LICENSES.chromium.html`) |

## Sample text

*The Lamp at Harrow Point* (in `src/model/sample.ts` and `samples/`) was written for this project and is dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

## Ornaments

The scene-break ornaments in `src/themes/ornaments.ts` were drawn for this project and are covered by the MIT license.
