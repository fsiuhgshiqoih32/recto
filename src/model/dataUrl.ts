// Images and covers are stored in the book as data: URLs.

export function decodeDataUrl(url: string): { mediaType: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
  if (!m) return null;
  const bytes = m[2]
    ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(m[3]));
  return { mediaType: m[1], bytes };
}
