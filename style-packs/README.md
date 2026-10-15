# Style packs

A style pack is a small `.recto-style` file: one of Recto's book styles plus
the changes made to it in **Style → Customize** (fonts, headings, paragraphs,
ornaments and a little advanced CSS). Load one with **Load style…** in that
panel. Save your own with **Save style…**.

Packs carry no fonts, images or scripts. They only choose among the fonts and
ornaments Recto bundles, all under open licences, so a pack is safe to share.
Recto filters a pack's advanced CSS again when it loads, keeping type,
spacing, borders and page breaks, and dropping anything that could load from
outside the book.

## Packs here

| Pack | Built on | For |
|---|---|---|
| [Harbor](harbor.recto-style) | Ledger | Memoir and short nonfiction |
| [Lantern](lantern.recto-style) | Octavo | Cozy mysteries and historical fiction |

## Sharing a pack

Open a pull request that adds your `.recto-style` file to this folder and a
row to the table above. To be accepted, a pack must:

- be released under **CC0-1.0** (set `"license": "CC0-1.0"`), so anyone can
  use it in a book they sell;
- pass Recto's filter unchanged: CI loads every pack here, and fails if any of
  its advanced CSS would be dropped;
- have a name that isn't another product's or publisher's trademark;
- come with a one-line `description` of the books it suits.

Reviewers check the result in a sample book, in the ebook and the print
preview, before merging.
