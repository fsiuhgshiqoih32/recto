// ISBN checks: a mistyped digit is the most common metadata rejection.

/** Digits (and a final X for ISBN-10) only. */
export function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9Xx]/g, '').toUpperCase();
}

export type IsbnProblem = 'length' | 'checksum';

/** Null when the ISBN is valid; otherwise what is wrong with it. */
export function isbnProblem(value: string): IsbnProblem | null {
  const isbn = normalizeIsbn(value);
  if (isbn.length === 13 && /^\d{13}$/.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, i) => total + Number(digit) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0 ? null : 'checksum';
  }
  if (isbn.length === 10 && /^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, i) => total + (digit === 'X' ? 10 : Number(digit)) * (10 - i), 0);
    return sum % 11 === 0 ? null : 'checksum';
  }
  return 'length';
}

/** ISBN-13 for any valid ISBN (ISBN-10s gain the 978 prefix), for comparing two of them. */
export function isbn13(value: string): string | null {
  const isbn = normalizeIsbn(value);
  if (isbnProblem(isbn)) return null;
  if (isbn.length === 13) return isbn;
  const core = `978${isbn.slice(0, 9)}`;
  const sum = [...core].reduce((total, digit, i) => total + Number(digit) * (i % 2 ? 3 : 1), 0);
  return `${core}${(10 - (sum % 10)) % 10}`;
}
