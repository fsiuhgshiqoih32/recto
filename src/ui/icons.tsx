// Small inline icons (24×24, stroke-based) so the app needs no icon library.
import type { SVGProps } from 'react';

const paths = {
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  contents: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  settings: 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4',
  preview: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  edit: 'M15 4l5 5M4 20l4.5-1L20 7.5 16.5 4 5 15.5 4 20z',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3zM8.5 12l2.5 2.5 4.5-5',
  alert: 'M12 3L2 21h20L12 3zM12 9v5M12 17h.01',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM4 21h15M8 7h7',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  italic: 'M14 5h-4M14 19h-4M14 5l-4 14',
  bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z',
  quote: 'M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6',
  alignCenter: 'M5 6h14M8 10h8M5 14h14M8 18h8',
  alignRight: 'M5 6h14M10 10h9M5 14h14M10 18h9',
  scene: 'M12 6v4M10.3 7l3.4 2M13.7 7l-3.4 2M7 14v4M5.3 15l3.4 2M8.7 15l-3.4 2M17 14v4M15.3 15l3.4 2M18.7 15l-3.4 2',
  heading: 'M6 5v14M18 5v14M6 12h12',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  chevron: 'M6 9l6 6 6-6',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  printer: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-1 3 15.5-3.5 1z',
  close: 'M6 6l12 12M18 6L6 18',
  sparkle: 'M12 3v6M12 15v6M3 12h6M15 12h6',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  check: 'M5 12.5l4.5 4.5L19 7',
  spell: 'M3 15l3.5-9L10 15M4.3 12h5.4M13 6v9h3a2.2 2.2 0 0 0 0-4.5h-3M13 10.5h2.6a2.2 2.2 0 0 0 0-4.5H13M14 19l2.5 2.5L21 17',
  ereader: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 10h8M8 13h5M11 18h2',
  phone: 'M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM11 18.5h2',
  tablet: 'M5.5 3h13A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3zM11 18h2',
  spread: 'M2.5 5.5c3.5-.8 6.5-.3 9.5 1.5v12.5c-3-1.8-6-2.3-9.5-1.5zM21.5 5.5c-3.5-.8-6.5-.3-9.5 1.5v12.5c3-1.8 6-2.3 9.5-1.5z',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}

/** Recto's mark: an open book with the right-hand page (the recto) inked in. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2.75 5.4c3.3-.75 6.2-.3 8.75 1.35v12.6c-2.55-1.6-5.45-2.05-8.75-1.3z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M21.25 5.4c-3.3-.75-6.2-.3-8.75 1.35v12.6c2.55-1.6 5.45-2.05 8.75-1.3z" className="brand-recto" />
    </svg>
  );
}

/** Small caps glyph for the toolbar: a large and a small "A". */
export function SmallCapsGlyph() {
  return (
    <span className="sc-glyph" aria-hidden="true">
      A<small>A</small>
    </span>
  );
}
