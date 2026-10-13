const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 1 → "One", 42 → "Forty-Two", 108 → "One Hundred Eight". */
export function numberToWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) {
    const rest = n % 100;
    return `${ONES[Math.floor(n / 100)]} Hundred${rest ? ` ${numberToWords(rest)}` : ''}`;
  }
  return String(n);
}

const ROMAN: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function toRoman(n: number): string {
  let out = '';
  for (const [value, numeral] of ROMAN) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}

const WORD_VALUES: Record<string, number> = Object.fromEntries([
  ...ONES.map((w, i) => [w.toLowerCase(), i] as const),
  ...TENS.slice(2).map((w, i) => [w.toLowerCase(), (i + 2) * 10] as const),
]);

const DIGIT_SETS = ['٠١٢٣٤٥٦٧٨٩', '۰۱۲۳۴۵۶۷۸۹', '०१२३४५६७८९', '๐๑๒๓๔๕๖๗๘๙', '０１２３４５６７８９'];

/** Arabic-Indic, Persian, Devanagari, Thai and fullwidth digits → ASCII digits. */
export function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹०-९๐-๙０-９]/g, (d) => {
    for (const set of DIGIT_SETS) {
      const i = set.indexOf(d);
      if (i >= 0) return String(i);
    }
    return d;
  });
}

const CJK_VALUES: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 七 → 7, 十二 → 12, 二十一 → 21, 一百零五 → 105. */
export function parseCjkNumeral(text: string): number | null {
  if (!/^[〇零一二两兩三四五六七八九十百千]+$/.test(text)) return null;
  let total = 0;
  let digit = 0;
  for (const ch of text) {
    if (ch in CJK_VALUES) digit = CJK_VALUES[ch];
    else {
      const unit = ch === '十' ? 10 : ch === '百' ? 100 : 1000;
      total += (digit || 1) * unit;
      digit = 0;
    }
  }
  return total + digit;
}

/** Parses "12", "XII", "twelve", "twenty-one", "٣" or "十二" into a number, or null. */
export function parseChapterNumber(token: string): number | null {
  const t = normalizeDigits(token.trim()).toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  const cjk = parseCjkNumeral(t);
  if (cjk !== null) return cjk;
  if (/^[ivxlc]+$/.test(t)) {
    let total = 0;
    let rest = t.toUpperCase();
    for (const [value, numeral] of ROMAN) {
      while (rest.startsWith(numeral)) {
        total += value;
        rest = rest.slice(numeral.length);
      }
    }
    return rest ? null : total;
  }
  const parts = t.split(/[-\s]+/);
  let total = 0;
  for (const part of parts) {
    if (!(part in WORD_VALUES)) return null;
    total += WORD_VALUES[part];
  }
  return parts.length ? total : null;
}
