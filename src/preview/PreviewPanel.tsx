import { useEffect, useMemo, useRef, useState } from 'react';
import type { Book, BookElement } from '../model/book';
import { editionOf, newId } from '../model/book';
import { ebookCss } from '../render/ebookCss';
import { renderElement, themeOf } from '../render/html';
import { ORNAMENTS } from '../themes/ornaments';
import { languageInfo } from '../i18n/languages';
import { type Hyphenate, loadHyphenator } from '../i18n/hyphenate';
import { type PagedMessage, printDocument } from '../export/print/paged';
import { TRIMS, estimatePages, kdpMinInside, trimLabel } from '../export/print/pageCss';
import { fontUrl, pagedUrl } from './assets';
import { TabBar } from '../ui/TabBar';
import { Icon } from '../ui/icons';

export type Device = 'ereader' | 'phone' | 'tablet' | 'print';

const DEVICES = [
  { id: 'ereader', label: 'E-reader', icon: <Icon name="ereader" size={15} /> },
  { id: 'phone', label: 'Phone', icon: <Icon name="phone" size={15} /> },
  { id: 'tablet', label: 'Tablet', icon: <Icon name="tablet" size={15} /> },
  { id: 'print', label: 'Print', icon: <Icon name="spread" size={15} /> },
] as const;

// Register during parsing: waiting for iframe load leaves a keyboard gap while
// resources load or a debounced preview refresh replaces the document.
function withPreviewKeyboard(html: string): string {
  return html.replace('</head>', `<script>
(function () {
  var frame = window.frameElement;
  if (!frame) return;
  document.addEventListener('pointerdown', function () {
    frame.dispatchEvent(new parent.PointerEvent('pointerdown', { bubbles: true }));
  });
  document.addEventListener('keydown', function (key) {
    if (key.key !== 'Escape' && key.key !== 'Tab') return;
    var targets = Array.from(document.querySelectorAll('a[href], button, input, select, textarea, [tabindex="0"]'))
      .filter(function (node) { return node.getClientRects().length > 0; });
    var atEdge = !targets.length || (key.shiftKey ? document.activeElement === targets[0] : document.activeElement === targets[targets.length - 1]);
    if (key.key === 'Tab' && !atEdge) return;
    var forwarded = new parent.KeyboardEvent('keydown', { key: key.key, shiftKey: key.shiftKey, bubbles: true, cancelable: true });
    if (!frame.dispatchEvent(forwarded)) key.preventDefault();
  });
})();
</script></head>`);
}

function useDebounced<T>(value: T, ms: number, active = true): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms, active]);
  return debounced;
}

export function PreviewPanel({ book, element, device, onDevice, active = true }: { book: Book; element: BookElement | undefined; device: Device; onDevice: (d: Device) => void; active?: boolean }) {
  return (
    <div className="preview-panel">
      <div className="preview-heading"><span className="preview-caption">Live preview</span><span className="preview-hint">{device === 'print' ? 'Print edition' : 'Ebook edition'}</span></div>
      <TabBar id="device" label="Preview device" options={DEVICES} value={device} onChange={onDevice} className="segmented device-switch" />
      <div className="preview-content" id={`device-panel-${device}`} role="tabpanel" aria-labelledby={`device-tab-${device}`}>
        {device === 'print' ? <PrintPreview book={book} element={element} active={active} /> : <EbookPreview book={book} element={element} device={device} active={active} />}
      </div>
    </div>
  );
}

function EbookPreview({ book, element, device, active }: { book: Book; element: BookElement | undefined; device: Exclude<Device, 'print'>; active: boolean }) {
  const debouncedBook = useDebounced(book, 150, active);
  const debouncedElement = useDebounced(element, 150, active);
  const html = useMemo(() => {
    if (!debouncedElement) return '';
    const current = debouncedBook.elements.find((el) => el.id === debouncedElement.id) ?? debouncedElement;
    if (current.include === 'print') return '';
    const body = renderElement(current, {
      // Chapter numbers count only the sections the ebook has.
      book: editionOf(debouncedBook, 'ebook'),
      theme: themeOf(debouncedBook),
      target: 'preview',
      hrefFor: () => '#',
      ornament: (id) => ORNAMENTS[id],
    });
    const screen = device === 'ereader' ? '#f4f2ec' : '#ffffff';
    const size = device === 'tablet' ? 17 : device === 'phone' ? 15 : 16;
    const { dir } = languageInfo(debouncedBook.meta.language);
    return withPreviewKeyboard(`<!DOCTYPE html><html lang="${debouncedBook.meta.language}" dir="${dir}"><head><meta charset="utf-8"/>
<style>${ebookCss(debouncedBook, fontUrl, body)}
html { background: ${screen}; scrollbar-width: thin; scrollbar-color: rgba(60, 45, 25, 0.28) transparent; }
body { margin: 0; padding: 28px 24px 48px; font-size: ${size}px; color: #1d1d1d; }
a { color: inherit; }
</style></head><body>${body}</body></html>`);
  }, [debouncedBook, debouncedElement, device]);

  return (
    <div className={`device device-${device}`}>
      <div className="device-screen">
        {!element ? <p className="empty-note">Select an element to preview it.</p>
          : element.include === 'print' ? <p className="empty-note">Print only: this section isn’t in the ebook.</p>
          : <iframe title="Ebook preview" srcDoc={html} />}
      </div>
    </div>
  );
}

function PrintPreview({ book, element, active }: { book: Book; element: BookElement | undefined; active: boolean }) {
  const [scope, setScope] = useState<'element' | 'book'>('element');
  const [pages, setPages] = useState<number | null>(null);
  const [busy, setBusy] = useState(true);
  const [pageHint, setPageHint] = useState(() => estimatePages(book));
  const renderId = useRef('');
  const debouncedBook = useDebounced(book, 450, active);
  // Hyphenation patterns load per language; the preview re-renders once they arrive.
  const [hyphenation, setHyphenation] = useState<{ lang: string; hyphenate?: Hyphenate }>({ lang: '' });
  const lang = debouncedBook.meta.language;
  useEffect(() => {
    let current = true;
    loadHyphenator(lang)
      .catch(() => null)
      .then((hyphenate) => current && setHyphenation({ lang, hyphenate: hyphenate ?? undefined }));
    return () => {
      current = false;
    };
  }, [lang]);
  const hyphenate = hyphenation.lang === lang ? hyphenation.hyphenate : undefined;

  const elementId = useDebounced(element?.id, 0, active);
  const doc = useMemo(() => {
    const id = newId();
    const html = printDocument(debouncedBook, {
      fontUrl,
      pagedUrl: pagedUrl(),
      pages: pageHint,
      elementIds: scope === 'element' && elementId ? [elementId] : undefined,
      spreads: true,
      renderId: id,
      hyphenate,
    });
    return { id, html: withPreviewKeyboard(html) };
  }, [debouncedBook, scope, elementId, pageHint, hyphenate]);

  useEffect(() => {
    renderId.current = doc.id;
    setBusy(true);
  }, [doc]);

  useEffect(() => {
    const onMessage = (e: MessageEvent<PagedMessage>) => {
      if (e.data?.type !== 'recto:paged' || e.data.renderId !== renderId.current) return;
      setBusy(false);
      setPages(e.data.pages);
      // With the whole book laid out, the real page count may call for a different gutter.
      if (scope === 'book' && kdpMinInside(e.data.pages) !== kdpMinInside(pageHint)) setPageHint(e.data.pages);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [scope, pageHint]);

  const trim = TRIMS[book.style.trim];
  return (
    <div className="print-preview">
      <div className="print-bar">
        <TabBar id="print-scope" label="Print preview scope" options={[{ id: 'element', label: 'This element' }, { id: 'book', label: 'Whole book' }]} value={scope} onChange={setScope} className="segmented segmented-small" />
        <span className="print-info" aria-live="polite">
          {trimLabel(trim)}
          {pages !== null && !busy && ` · ${pages} ${pages === 1 ? 'page' : 'pages'}`}
          {busy && ' · laying out…'}
        </span>
      </div>
      <div className={`print-stage${busy ? ' is-busy' : ''}`} id={`print-scope-panel-${scope}`} role="tabpanel" aria-labelledby={`print-scope-tab-${scope}`}>
        {scope === 'element' && element?.include === 'ebook' && <p className="empty-note">Ebook only: this section isn’t in the print edition.</p>}
        <iframe title="Print preview" srcDoc={doc.html} hidden={scope === 'element' && element?.include === 'ebook'} />
      </div>
    </div>
  );
}
