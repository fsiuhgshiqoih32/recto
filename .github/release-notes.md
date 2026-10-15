## What's new in 0.3

- **macOS and Linux apps**, alongside Windows.
- **Footnotes and endnotes**, lists, verse, callout boxes, tables, text-message bubbles and store-link buttons.
- **Images** on their own page, full bleed or across a spread; heading images; print bleed.
- **Box sets**: gather books as volumes, with nested contents and chapter numbers that start again in each volume.
- **Style builder**: change fonts, headings, ornaments and spacing, add filtered CSS, and share the result as a style pack.
- **Publish panel**: a preflight check (page count, blank pages, image resolution, ISBNs, EPUBCheck, names spelled two ways), store and paperback covers with spine width, and accessibility answers for store forms.
- **More exports**: one EPUB per store, print page numbers in the ebook, vertical Japanese and Chinese ebooks, a PDF for reading, Word documents, and PDF/X-1a (or PDF/X-3 with Ghostscript before 10.05) through an installed Ghostscript.
- **20 trim sizes** for paperback and hardcover, in inches or millimetres, and a large-print edition.
- **Desktop**: save in place (with a warning if the file changed elsewhere), Help → Check for Updates, and Preview in Kindle Previewer.
- EPUBs now carry EPUB Accessibility 1.1 metadata and pass the official EPUBCheck and DAISY Ace, and print PDFs have no stranded single lines, pure black text and proper TrimBox/BleedBox.

## Download

| System | File |
| --- | --- |
| Windows 10 and 11 (64-bit) | `Recto-Setup-<version>.exe` |
| macOS on Apple Silicon (M1 and later) | `Recto-<version>-mac-arm64.dmg` |
| macOS on Intel | `Recto-<version>-mac-x64.dmg` |
| Linux (any distribution) | `Recto-<version>-linux-x86_64.AppImage` |
| Debian, Ubuntu, Mint | `Recto-<version>-linux-amd64.deb` |
| Linux, unpacked | `Recto-<version>-linux-x64.tar.gz` |

`SHA256SUMS.txt` lists a checksum for every file.

Recto isn't signed by Apple or Microsoft yet (that needs paid certificates), so each system warns once on first launch:

- **Windows:** SmartScreen says "Windows protected your PC". Choose **More info**, then **Run anyway**.
- **macOS:** open the `.dmg` and drag Recto to Applications. The first time you open it, macOS says it can't verify the developer. Open **System Settings → Privacy & Security**, scroll down and choose **Open Anyway**.
- **Linux AppImage:** make it executable (`chmod +x Recto-*.AppImage`), then run it. On Ubuntu 24.04 and later, which restrict unprivileged sandboxes, either install the `.deb` instead or start the AppImage with `--no-sandbox`.

Prefer not to install anything? Recto also runs in a browser and keeps your book on your device: see the README.
