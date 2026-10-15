// Gathers the interface strings (every t('…') and N_('…') in src/) into
// locales/en.json, the source file translators work from (Weblate reads it as
// monolingual JSON: English text as the key). Other locales keep their
// translations; strings the code no longer uses are dropped from them.
//
//   npm run i18n            update the catalogs
//   npm run i18n -- --check fail if locales/en.json is out of date (CI)

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

/** Every string literal passed to t() or N_() in the app's source. */
export function extractStrings(root = 'src'): string[] {
  const found = new Set<string>();
  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, 'utf8');
    if (!/\b(t|N_)\(/.test(text)) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    // Only t and N_ imported from i18n/ui count: other modules have their own t() (trims.ts builds trims with one).
    const imported = new Set<string>();
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && /i18n\/ui$/.test(statement.moduleSpecifier.text)) {
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) imported.add(element.name.text);
      }
    }
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (node.expression.text === 't' || node.expression.text === 'N_') && imported.has(node.expression.text)) {
        const [first] = node.arguments;
        if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) found.add(first.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...found].sort((a, b) => a.localeCompare(b, 'en'));
}

const sorted = (entries: [string, string][]) => Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b, 'en')));

function main() {
  const strings = extractStrings();
  const english = `${JSON.stringify(sorted(strings.map((s) => [s, s])), null, 2)}\n`;
  const enPath = join('locales', 'en.json');
  if (process.argv.includes('--check')) {
    const current = (() => {
      try {
        return readFileSync(enPath, 'utf8');
      } catch {
        return '';
      }
    })();
    if (current !== english) {
      console.error('locales/en.json is out of date: run npm run i18n.');
      process.exit(1);
    }
    console.log(`locales/en.json is up to date (${strings.length} strings).`);
    return;
  }
  writeFileSync(enPath, english);
  const known = new Set(strings);
  console.log(`en: ${strings.length} strings`);
  for (const file of readdirSync('locales').filter((f) => f.endsWith('.json') && f !== 'en.json')) {
    const path = join('locales', file);
    const catalog = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
    const kept = Object.entries(catalog).filter(([key, value]) => known.has(key) && value);
    writeFileSync(path, `${JSON.stringify(sorted(kept), null, 2)}\n`);
    const missing = strings.filter((s) => !catalog[s]);
    console.log(`${file.replace('.json', '')}: ${kept.length} translated, ${missing.length} missing${Object.keys(catalog).length > kept.length ? `, ${Object.keys(catalog).length - kept.length} dropped` : ''}`);
  }
}

if (process.argv[1]?.endsWith('i18n-extract.ts')) main();
