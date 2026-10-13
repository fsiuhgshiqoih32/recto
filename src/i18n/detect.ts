// Import-time detection: which text encoding a file uses, and which language a
// manuscript is written in. Both are heuristics; the import dialog lets the
// author override them.

// ---------- Encodings ----------

/** Legacy encodings tried when a file isn't valid UTF-8, most common first. */
const LEGACY_ENCODINGS = [
  'windows-1252', 'windows-1250', 'windows-1251', 'windows-1253', 'windows-1254', 'windows-1255',
  'windows-1256', 'windows-1257', 'windows-1258', 'windows-874', 'koi8-r', 'shift_jis', 'euc-jp', 'gbk',
  'big5', 'euc-kr', 'iso-8859-2',
] as const;

export const ENCODING_CHOICES = ['utf-8', 'utf-16le', 'utf-16be', ...LEGACY_ENCODINGS] as const;

function decode(bytes: Uint8Array, encoding: string, fatal = false): string | null {
  try {
    return new TextDecoder(encoding, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Scores how much a decoding looks like real prose: letters from one script,
 * spaces and punctuation are good; replacement characters, C1 controls and a
 * jumble of scripts are bad.
 */
function plausibility(text: string): number {
  const chars = [...text.slice(0, 20000)];
  let score = 0;
  let latin = 0;
  let accented = 0;
  const scripts = new Map<string, number>();
  chars.forEach((ch, i) => {
    const cp = ch.codePointAt(0)!;
    if (ch === '�' || (cp < 0x20 && !/\s/.test(ch)) || (cp >= 0x7f && cp < 0xa0)) {
      score -= 20;
    } else if (/\p{L}/u.test(ch)) {
      score += 1;
      const script = scriptOf(ch);
      scripts.set(script, (scripts.get(script) ?? 0) + 1);
      if (script === 'latin') {
        latin++;
        if (cp > 0x7f) accented++;
      }
    } else {
      // Symbols wedged between letters ("w³asnie", "mo¿e") are the mark of the wrong code page.
      const wedged = /\p{L}/u.test(chars[i - 1] ?? '') && /\p{L}/u.test(chars[i + 1] ?? '') && !/[’'\-‐·.]/.test(ch);
      if (wedged) score -= 6;
      else score += /[\s\p{P}\p{N}]/u.test(ch) ? 0.5 : -2;
    }
  });
  // Real text sticks to one script (plus Latin loanwords); mojibake scatters.
  const sorted = [...scripts.entries()].sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0]?.[0];
  for (const [script, n] of sorted) if (script !== dominant && script !== 'latin') score -= n * 3;
  // No Latin-script language puts accents on over a third of its letters; misdecoded Cyrillic or Greek does.
  if (latin > 50 && accented / latin > 0.35) score -= accented * 2;
  return score;
}

export interface DecodedText {
  text: string;
  encoding: string;
}

/**
 * Decodes a text file. A byte-order mark always wins, as in browsers: it can't
 * be wrong, while a declared or chosen encoding (an HTML <meta charset>) often
 * is. Then the requested encoding, if this runtime knows it; then strict UTF-8;
 * then the most plausible legacy encoding.
 */
export function decodeText(bytes: Uint8Array, encoding: string = 'auto'): DecodedText {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: decode(bytes.subarray(3), 'utf-8')!, encoding: 'utf-8' };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: decode(bytes.subarray(2), 'utf-16le')!, encoding: 'utf-16le' };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: decode(bytes.subarray(2), 'utf-16be')!, encoding: 'utf-16be' };
  if (encoding !== 'auto') {
    const text = decode(bytes, encoding);
    // An unknown label ("x-mac-roman-old") falls through to detection instead of yielding nothing.
    if (text !== null) return { text, encoding };
  }
  const utf8 = decode(bytes, 'utf-8', true);
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8' };
  // UTF-16 without a BOM: lots of zero bytes in alternating positions.
  const zeros = (offset: number) => bytes.filter((b, i) => i % 2 === offset && b === 0).length;
  if (bytes.length > 8 && zeros(1) > bytes.length / 4) return { text: decode(bytes, 'utf-16le')!, encoding: 'utf-16le' };
  if (bytes.length > 8 && zeros(0) > bytes.length / 4) return { text: decode(bytes, 'utf-16be')!, encoding: 'utf-16be' };

  // Western European is the default; another code page has to win clearly, since
  // near-ties are usually one punctuation mark read as a letter (¿ as ż).
  const MARGIN = 3;
  let best: DecodedText = { text: decode(bytes, 'windows-1252') ?? '', encoding: 'windows-1252' };
  let bestScore = plausibility(best.text) + MARGIN;
  for (const candidate of LEGACY_ENCODINGS.slice(1)) {
    const text = decode(bytes, candidate);
    if (text === null) continue;
    const score = plausibility(text);
    if (score > bestScore) {
      best = { text, encoding: candidate };
      bestScore = score;
    }
  }
  return best;
}

/** Reads `<meta charset>` from the start of an HTML file. */
export function htmlCharset(bytes: Uint8Array): string | null {
  const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, 2048));
  return /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1].toLowerCase() ?? null;
}

// ---------- Scripts and languages ----------

const SCRIPT_TESTS: [string, RegExp][] = [
  ['latin', /\p{Script=Latin}/u],
  ['cyrillic', /\p{Script=Cyrillic}/u],
  ['greek', /\p{Script=Greek}/u],
  ['arabic', /\p{Script=Arabic}/u],
  ['hebrew', /\p{Script=Hebrew}/u],
  ['han', /\p{Script=Han}/u],
  ['kana', /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ['hangul', /\p{Script=Hangul}/u],
  ['devanagari', /\p{Script=Devanagari}/u],
  ['thai', /\p{Script=Thai}/u],
];

function scriptOf(ch: string): string {
  for (const [name, re] of SCRIPT_TESTS) if (re.test(ch)) return name;
  return 'other';
}

// Very common short words. Each list is distinctive enough to separate the
// Latin-script languages Recto has translations for.
const STOPWORDS: Record<string, string[]> = {
  en: ['the', 'and', 'of', 'to', 'was', 'that', 'with', 'her', 'his', 'she', 'had', 'not'],
  es: ['el', 'la', 'los', 'que', 'de', 'y', 'en', 'un', 'una', 'por', 'con', 'se', 'del', 'las'],
  fr: ['le', 'la', 'les', 'et', 'de', 'des', 'un', 'une', 'est', 'il', 'elle', 'que', 'dans', 'pas', 'qui'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'sie', 'er', 'zu', 'mit', 'den', 'sich'],
  it: ['il', 'la', 'di', 'che', 'e', 'non', 'un', 'una', 'per', 'con', 'gli', 'del', 'della', 'era'],
  pt: ['o', 'a', 'os', 'as', 'de', 'que', 'e', 'não', 'um', 'uma', 'com', 'para', 'do', 'da', 'em'],
  nl: ['de', 'het', 'een', 'en', 'van', 'is', 'niet', 'dat', 'ze', 'hij', 'zij', 'op', 'met', 'voor'],
  sv: ['och', 'att', 'det', 'som', 'en', 'på', 'är', 'av', 'för', 'med', 'hon', 'han', 'inte', 'var'],
  da: ['og', 'at', 'det', 'som', 'en', 'på', 'er', 'af', 'for', 'med', 'hun', 'han', 'ikke', 'var', 'til'],
  nb: ['og', 'at', 'det', 'som', 'en', 'på', 'er', 'av', 'for', 'med', 'hun', 'han', 'ikke', 'var', 'til'],
  fi: ['ja', 'on', 'ei', 'se', 'että', 'hän', 'oli', 'mutta', 'kun', 'niin', 'joka', 'ole'],
  pl: ['i', 'w', 'nie', 'się', 'na', 'że', 'z', 'do', 'to', 'jest', 'jak', 'ale', 'był', 'była'],
  cs: ['a', 'v', 'se', 'na', 'je', 'že', 'to', 's', 'z', 'do', 'jako', 'ale', 'byl', 'byla', 'jsem'],
  ro: ['și', 'de', 'la', 'în', 'nu', 'că', 'cu', 'pe', 'un', 'o', 'era', 'care', 'mai', 'din'],
  hu: ['a', 'az', 'és', 'hogy', 'nem', 'is', 'egy', 'volt', 'meg', 'de', 'már', 'csak'],
  tr: ['ve', 'bir', 'bu', 'da', 'de', 'için', 'ile', 'ne', 'çok', 'ama', 'gibi', 'olan', 'değil'],
  vi: ['và', 'của', 'là', 'không', 'có', 'một', 'những', 'người', 'trong', 'được', 'cô', 'anh'],
  id: ['dan', 'yang', 'di', 'itu', 'dengan', 'tidak', 'ini', 'dari', 'ke', 'dia', 'ada', 'akan'],
};

export interface Detection {
  code: string;
  /** 0–1: the share of evidence behind the guess. */
  confidence: number;
}

/** Guesses the language of a manuscript from its text. */
export function detectLanguage(text: string): Detection {
  const sample = text.slice(0, 60000);
  const counts = new Map<string, number>();
  for (const ch of sample) {
    if (!/\p{L}/u.test(ch)) continue;
    const script = scriptOf(ch);
    counts.set(script, (counts.get(script) ?? 0) + 1);
  }
  const letters = [...counts.values()].reduce((a, b) => a + b, 0);
  if (!letters) return { code: 'en', confidence: 0 };
  const share = (s: string) => (counts.get(s) ?? 0) / letters;

  // CJK first: Japanese text mixes kana with kanji.
  if (share('kana') > 0.05) return { code: 'ja', confidence: share('kana') + share('han') };
  if (share('hangul') > 0.3) return { code: 'ko', confidence: share('hangul') };
  if (share('han') > 0.3) {
    const simplified = (sample.match(/[们这说为来时个们会对过还没么经让给们进]/g) ?? []).length;
    const traditional = (sample.match(/[們這說為來時個會對過還沒麼經讓給進]/g) ?? []).length;
    return { code: traditional > simplified ? 'zh-Hant' : 'zh-Hans', confidence: share('han') };
  }
  if (share('arabic') > 0.3) {
    const persian = (sample.match(/[پچژگی]/g) ?? []).length / Math.max(1, counts.get('arabic')!);
    return { code: persian > 0.02 ? 'fa' : 'ar', confidence: share('arabic') };
  }
  if (share('hebrew') > 0.3) return { code: 'he', confidence: share('hebrew') };
  if (share('devanagari') > 0.3) return { code: 'hi', confidence: share('devanagari') };
  if (share('thai') > 0.3) return { code: 'th', confidence: share('thai') };
  if (share('greek') > 0.3) return { code: 'el', confidence: share('greek') };
  if (share('cyrillic') > 0.3) {
    const ukrainian = (sample.match(/[іїєґІЇЄҐ]/g) ?? []).length / Math.max(1, counts.get('cyrillic')!);
    return { code: ukrainian > 0.005 ? 'uk' : 'ru', confidence: share('cyrillic') };
  }

  // Latin script: count stopwords per language.
  const words = sample.toLowerCase().match(/\p{L}+/gu) ?? [];
  const frequency = new Map<string, number>();
  for (const w of words) frequency.set(w, (frequency.get(w) ?? 0) + 1);
  let best = 'en';
  let bestScore = 0;
  let total = 0;
  for (const [code, list] of Object.entries(STOPWORDS)) {
    const score = list.reduce((sum, w) => sum + (frequency.get(w) ?? 0), 0) / list.length;
    total += score;
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }
  // Vietnamese is unmistakable from its stacked diacritics.
  if ((sample.match(/[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđ]/gi) ?? []).length > words.length * 0.05) {
    return { code: 'vi', confidence: 0.9 };
  }
  return { code: best, confidence: total ? bestScore / total : 0 };
}
