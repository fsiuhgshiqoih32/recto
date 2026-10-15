// Builds locales/<code>.json from a numbered translation list ("12<TAB>text",
// one line per string, numbered as in locales/en.json). Checks every string
// is translated once and keeps each {placeholder}. A helper for translators
// working outside Weblate.
//
//   npx tsx scripts/i18n-apply.ts de path/to/de.txt

import { readFileSync, writeFileSync } from 'node:fs';

const [code, listPath] = process.argv.slice(2);
if (!code || !listPath) {
  console.error('usage: npx tsx scripts/i18n-apply.ts <code> <numbered-list.txt>');
  process.exit(1);
}
const keys = Object.keys(JSON.parse(readFileSync('locales/en.json', 'utf8')) as Record<string, string>);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const catalog: Record<string, string> = {};
const problems: string[] = [];
for (const line of readFileSync(listPath, 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  const match = /^(\d+)\t(.*)$/.exec(line);
  if (!match) {
    problems.push(`not numbered: ${line.slice(0, 60)}`);
    continue;
  }
  const key = keys[Number(match[1]) - 1];
  const raw = match[2].replace(/\\n/g, '\n');
  // Editors drop trailing spaces; strings like ' and ' keep the key's own spacing.
  const text = key ? `${/^\s*/.exec(key)![0]}${raw.trim()}${/\s*$/.exec(key)![0]}` : raw;
  if (!key) problems.push(`no string ${match[1]}`);
  else if (catalog[key]) problems.push(`string ${match[1]} translated twice`);
  else if (placeholders(key) !== placeholders(text)) problems.push(`string ${match[1]}: placeholders {${placeholders(key)}} became {${placeholders(text)}}`);
  else catalog[key] = text;
}
const missing = keys.map((k, i) => (catalog[k] ? null : i + 1)).filter(Boolean);
if (missing.length) problems.push(`missing: ${missing.join(', ')}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
writeFileSync(`locales/${code}.json`, `${JSON.stringify(Object.fromEntries(keys.map((k) => [k, catalog[k]])), null, 2)}\n`);
console.log(`locales/${code}.json: ${keys.length} strings`);
