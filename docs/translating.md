# Translating Recto's interface

Recto's interface is written in English and translated into German, Spanish
and French. The books it makes can be in any language, which is a separate
matter: book words such as "Chapter" and "Contents" come from
`src/i18n/languages.ts`.

Interface text lives in `locales/`. Each file is plain JSON whose keys are the
English text:

```json
{
  "Export EPUB": "EPUB exportieren",
  "Saved to {path}": "Gespeichert unter {path}"
}
```

- Keep every `{placeholder}` exactly as written. Recto fills them in, and the
  tests fail if one goes missing.
- Leave brand names as they are: KDP, IngramSpark, EPUB, Kindle Previewer,
  Ghostscript, Recto.
- `locales/en.json` is generated from the code. Don't edit it by hand.

## With Weblate

The simplest way to translate is the project's [Hosted Weblate](https://hosted.weblate.org/)
component, once a maintainer has set it up:

- **File format:** JSON file (monolingual)
- **File mask:** `locales/*.json`
- **Monolingual base language file:** `locales/en.json`
- **Template for new translations:** `locales/en.json`

Weblate's free Libre plan suits open-source projects like this one.

## By hand

1. Copy `locales/en.json` to `locales/<code>.json` (for example `pt.json`) and
   translate the values.
2. When every string is translated, add the language to `UI_LANGUAGES` in
   `src/i18n/ui.ts`, under its own name ("Português"). It then appears under
   **Appearance → Interface language**.
3. Run `npm test`. It checks that offered languages are complete and that
   placeholders survived.

## For developers

Wrap interface text in `t()` from `src/i18n/ui.ts`. Use `{name}` placeholders
instead of building sentences from pieces:

```ts
notify(t('Saved {pages}-page PDF to {path}', { pages, path }));
```

Text in tables built when a module loads (menu entries, option lists) is
marked with `N_()` and translated with `t()` where it's shown. Then run
`npm run i18n` to refresh `locales/en.json`; it also drops strings the code no
longer uses from the other catalogs. The tests fail if `en.json` is stale.
