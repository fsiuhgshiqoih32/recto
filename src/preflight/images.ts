// Pixel dimensions of an embedded image, read from its file header so checks
// can run without decoding it (and outside a browser, in tests and the CLI).

import { decodeDataUrl } from '../model/dataUrl';

export interface ImageInfo {
  mediaType: string;
  width: number;
  height: number;
  bytes: number;
}

function be16(b: Uint8Array, i: number) {
  return (b[i] << 8) | b[i + 1];
}
function be32(b: Uint8Array, i: number) {
  return ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
}
function le16(b: Uint8Array, i: number) {
  return b[i] | (b[i + 1] << 8);
}
function le24(b: Uint8Array, i: number) {
  return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
}

function size(b: Uint8Array): { width: number; height: number } | null {
  // PNG: the IHDR chunk follows the 8-byte signature.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { width: be32(b, 16), height: be32(b, 20) };
  // GIF: logical screen size.
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: le16(b, 6), height: le16(b, 8) };
  // JPEG: the first start-of-frame marker.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const length = be16(b, i + 2);
      const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (sof) return { width: be16(b, i + 7), height: be16(b, i + 5) };
      i += 2 + length;
    }
    return null;
  }
  // WebP: lossy (VP8), lossless (VP8L) or extended (VP8X).
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === 'VP8 ') return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') return { width: le24(b, 24) + 1, height: le24(b, 27) + 1 };
  }
  return null;
}

export function imageInfo(dataUrl: string): ImageInfo | null {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;
  const dims = size(decoded.bytes);
  return dims ? { mediaType: decoded.mediaType, ...dims, bytes: decoded.bytes.length } : null;
}
