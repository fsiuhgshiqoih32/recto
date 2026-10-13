# Recto

**A free, open-source book formatter.** Write or import a manuscript in any language, pick a style, and export a store-ready **EPUB** and a print-ready **PDF** for paperbacks.

It runs in your browser with no account and no server, or as a desktop app for Windows, macOS and Linux.

![Recto: the navigator, manuscript editor and live e-reader preview](docs/screenshots/editor.png)

Self-publishing authors usually format books with a dedicated app. The best-known one costs about $250 and only runs on a Mac. Recto does the same job, the dull, exacting part, for free on any computer:

- each chapter opens on a right-hand page, with a blank left-hand page added when needed
- the inside margin grows with the page count, the way KDP requires
- running heads, page numbers and drop caps are handled for you
- the EPUB packaging is valid

> *Recto* is the printer's word for a right-hand page, which is where chapters begin.

## Features

- **Import a manuscript.** Word (`.docx`), Markdown, plain text or HTML.
  - Chapters split at *Heading 1* or at chapter lines in 30 languages ("Chapter 7", "Capítulo 7", "7. luku", "第七章", "الفصل ٣"…).
  - Parts, prologues, epilogues and back matter are recognized.
  - `* * *`, `#` and `⁂` lines become scene breaks.
  - Italics, bold and small caps carry over.
- **Edit.** A distraction-free manuscript editor with the formatting books actually use: italic, bold, small caps, block quotes, centered and right-aligned text, subheadings, scene breaks and images.
- **Format and Edit views.** Format keeps a large live preview visible beside style, section and book settings. Edit provides a dedicated manuscript workspace with an optional preview. Switching views preserves your text selection and undo history. Compact windows use drawers for contents and settings.
- **Organize.** Front matter (title page, copyright, dedication, epigraph, contents), parts and chapters, and back matter (acknowledgments, about the author, also by). Drag to reorder.
  - Chapters are numbered automatically ("Chapter One", "1", "Chapter 1"…, depending on the style).
- **Five book styles.** Original designs with OFL fonts and drawn ornaments:

  | Style | Look |
  | --- | --- |
  | **Octavo** | Classic literary |
  | **Ledger** | Modern and plain |
  | **Marginalia** | Romantic and airy |
  | **Broadsheet** | Bold, for thrillers |
  | **Almanac** | Storybook, for fantasy |

  Each style has its own chapter headings, drop caps or small-caps lead-ins, and scene-break ornaments.
- **Live previews.**
  - The ebook on an e-reader, a phone and a tablet.
  - Real paginated print spreads at the actual trim size, for one chapter or the whole book.
- **EPUB 3 export.**
  - An EPUB 2 NCX fallback for older readers.
  - Nested table of contents and landmarks.
  - Cover image, embedded images and optional embedded fonts.
  - The `mimetype` entry is stored first and uncompressed, as the spec requires.
- **Print-ready PDF.**
  - Trim sizes 5×8, 5.25×8, 5.5×8.5 and 6×9 in, plus A5.
  - Mirrored margins with KDP's gutter minimums.
  - Running heads (author on the left, title or chapter on the right) and page numbers that start at chapter one.
  - No running head or page number on chapter openers or blank pages.
  - A contents page with real page numbers.
- **Any language.** Write in English, Spanish, Russian, Greek, Arabic, Hebrew, Hindi, Thai, Chinese, Japanese, Korean or any other language with a BCP 47 code.
  - Import detects the manuscript's language and text encoding (UTF-8, UTF-16 and legacy code pages such as Windows-1251 or Shift_JIS). Both can be overridden.
  - Chapter labels, "Contents", the copyright page and the EPUB navigation come out in the book's language, with the right digits ("Capítulo 2", "Глава 2", "第二章").
  - Right-to-left books (Arabic, Hebrew, Persian, Urdu…) get right-to-left EPUB page progression, mirrored print gutters and spreads.
  - Scripts get appropriate typography: bundled Noto fonts for Arabic, Hebrew, Devanagari and Thai; extra subsets of the book fonts for Latin Extended, Cyrillic, Greek and Vietnamese; no letterspacing or drop caps where they'd break a script; full-width indents for CJK.
  - Print text is hyphenated with the TeX hyphenation patterns for 36 languages, so justified pages don't gape.
- **Spellcheck.** The editor checks spelling in the book's language.
  - In the desktop app, Recto picks the dictionary, and right-click offers suggestions and "Add to Dictionary".
  - In a browser, spellcheck uses the browser's own languages.
  - A toolbar button turns it off.
- **Desktop app.** A Windows installer (macOS and Linux builds too) that opens `.recto` files when you double-click them, adds a File menu with shortcuts, and exports PDFs directly to a file.
- **Your files stay yours.**
  - Autosaves to your browser's storage.
  - Save and open `.recto` files, which are plain JSON.
- **Dark mode and app themes.** The interface is styled like a typesetter's desk: warm paper, ink-black type, and a single accent color per theme.
  - Three light themes: Paper (rubric red), Sepia (bookcloth green), Slate (blue-black).
  - Three dark themes: Ink (vermilion), Midnight (pale blue), Evergreen (brass).
  - Or **System**, which follows your OS's light/dark setting.
  - App themes change the editor around the book, never the book itself.
  - Every theme meets WCAG AA contrast for text.

| Print spreads | Book styles | Phone preview |
| --- | --- | --- |
| ![Print preview](docs/screenshots/print-whole-book.png) | ![Style panel](docs/screenshots/styles.png) | ![Phone preview](docs/screenshots/phone-preview.png) |

![Recto in the Ink dark theme, with the appearance menu open](docs/screenshots/dark-mode.png)

![An Arabic manuscript: right-to-left editing, Arabic chapter labels and front matter, and a print preview whose first page sits on the left](docs/screenshots/right-to-left.png)

## Quick start

### Desktop app

Download **Recto-Setup-x.y.z.exe** from the Releases page and run it.

The installer isn't code-signed yet, so Windows SmartScreen may say it "protected your PC". Choose **More info → Run anyway**.

To build the installer yourself (it lands in `release/`):

```bash
npm install
npm run dist:win
```

### In the browser

```bash
git clone https://github.com/fsiuhgshiqoih32/recto.git
cd recto
npm install
npm run dev
```

Open http://localhost:5173. The sample novella *The Lamp at Harrow Point* loads on first run. Use **Books → New blank book** or **File → Import manuscript** to start your own. The app opens in **Format**; switch to **Edit** to work on the text. **File → Save a copy** downloads a `.recto` backup.

### Making the print PDF

In the desktop app, **Export → Export PDF** (Ctrl+P) lays out the book and saves the PDF straight to a file. In a browser:

1. Choose **Export → Print PDF**. Recto lays out every page.
   - If the real page count lands in a different KDP gutter tier than its estimate, it lays the book out a second time.
2. In the print dialog that opens, choose **Save as PDF**.
   - Page size and margins come from the book, so leave the dialog's own margins at their default.
   - Chrome and Edge give the most faithful results.

Or skip the browser and render from the command line. This uses your installed Chrome or Edge:

```bash
npm run pdf -- my-book.recto -o my-book.pdf
npm run pdf -- --sample                # the sample novella
```

### Making the EPUB

Choose **Export → Export EPUB**. Upload the file to KDP, Apple Books, Kobo, Google Play Books or a distributor.

The cover image (Book tab) is used for the ebook only. Print covers are a separate wraparound design that your printer specifies.

### Manuscript tips for a clean import

- Put each chapter title in **Heading 1**, or on its own line as `Chapter 7` or `Chapter 7: The Storm` (or the same in your language: `Capítulo 7`, `Глава 7`, `第七章`…).
- `Part One: …`, `Prologue`, `Epilogue`, `Acknowledgments` and `About the Author` are recognized too.
- Mark scene breaks with a line containing only `* * *`, `***`, `#` or `⁂`.

## How it works

```
manuscript (.docx / .md / .txt) ──► HTML ──► split into elements ──► TipTap JSON (the Book model)
                                                                          │
                                         src/render/html.ts  ◄────────────┘
                                         one renderer, semantic XHTML
                                          │                    │
                       EPUB: XHTML files + OPF/NCX/nav     Print: CSS Paged Media
                       (src/export/epub, JSZip)            laid out by paged.js
                                                           (src/export/print)
```

The key design decision is a single renderer. The ebook, the print PDF and every preview are made from the same XHTML, and each style is just CSS. That keeps the EPUB and the paperback from drifting apart.

| Path | What's there |
| --- | --- |
| `src/model/` | The `Book` type, defaults, chapter numbering, the CC0 sample novella |
| `src/import/` | `.docx` / Markdown / text import, chapter and scene-break detection |
| `src/render/` | Book → XHTML, the ebook stylesheet |
| `src/themes/` | The five styles, font registry, ornaments |
| `src/export/epub/` | OPF, nav, NCX and zip packaging |
| `src/export/print/` | Trim sizes, KDP gutter table, `@page` rules, the paged.js document |
| `src/i18n/` | Language table and book words in 30 languages, chapter labels, language and encoding detection, hyphenation |
| `electron/` | The desktop shell: app:// origin, PDF export, spellcheck menu, file associations |
| `src/ui/`, `src/editor/`, `src/preview/` | The React app. App themes are token blocks at the top of `src/ui/app.css`, listed in `src/ui/appearance.ts` |
| `cli/pdf.ts` | Headless PDF export (Playwright) |

## Development

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm test` | Unit tests (Vitest): renderer, importers, EPUB structure, print rules |
| `npm run test:e2e` | Browser tests (Playwright) against the production build |
| `npm run test:pdf` | Renders the sample to PDF and checks it (see below) |
| `npm run pdf -- <file.recto>` | Command-line PDF export |
| `npm run sample:docx` | Regenerates `samples/` from the sample novella |
| `npm run screenshots` | Regenerates the README screenshots from a running dev server |
| `npm run desktop` | Builds and runs the desktop app |
| `npm run dist:win` | Builds the Windows installer into `release/` (`npm run dist` for the current OS) |
| `npm run test:desktop` | Drives the Electron app with Playwright. Set `RECTO_APP=release/win-unpacked/Recto.exe` to test the packaged build |

`npm run test:pdf` checks that:

- every page is exactly the trim size
- every chapter opens on a right-hand page
- openers carry no running head or page number
- running heads and folios are correct on every other page
- the contents page numbers match where chapters really start
- body text is hyphenated
- small books in Spanish, Russian, Arabic, Japanese and Hindi typeset in their own scripts, with localized labels, right-hand openers and the right fonts embedded

The end-to-end tests and the PDF tools use an installed Chrome by default. Set `RECTO_BROWSER=msedge` or `RECTO_BROWSER=chromium` to change that. The latter needs `npx playwright install chromium` first.

CI runs everything on each push. Two more workflows handle publishing:

- One publishes the web app to GitHub Pages when enabled. Set **Pages → Source** to **GitHub Actions**, then add the Actions repository variable **ENABLE_GITHUB_PAGES** with the value **true**.
- One builds the Windows, macOS and Linux installers for every `v*` tag and attaches them to a GitHub release.

## Limitations and roadmap

Recto covers the core novel workflow. Not yet supported:

- footnotes and endnotes
- full-bleed images
- per-store ebook variants (store-specific "Also by" links)
- box sets
- custom style editing
- vertical CJK text
- translating the app's own interface (it's in English; the books it makes can be in any language)

Known gaps:

- Widow and orphan control in print is limited to what paged.js does.
- Word paragraph alignment isn't imported (headings and scene breaks are).
- Chinese, Japanese and Korean use your computer's serif font (CJK fonts are too large to bundle). For the best print results, install Noto Serif CJK.
- The desktop spellchecker has dictionaries for most European languages plus Hebrew, Persian, Hindi, Korean and Vietnamese, but not Arabic, Chinese, Japanese or Thai. The Book panel says when a language has none.
- Recto has localized book words for 30 languages. Other languages typeset correctly, but you rename default headings like "Contents" yourself.
- The installers aren't code-signed.

EPUB output is checked structurally by the test suite. Run [EPUBCheck](https://www.w3.org/publishing/epubcheck/) before uploading to a store.

Contributions are welcome. Please open an issue first for anything large.

## Clean-room statement

Recto is an independent project. It was written from scratch from publicly described features and general book-design practice. It contains no code, artwork, style designs or names from any commercial book formatter. All trademarks belong to their respective owners, and Recto is not affiliated with or endorsed by any of them.

## License

- Code: [MIT](LICENSE).
- Fonts: SIL Open Font License.
- Sample novella: CC0.

See [NOTICE.md](NOTICE.md) for details.
