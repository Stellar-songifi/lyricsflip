#!/usr/bin/env node
// LF-310: fails when messages/fr.json is missing keys that messages/en.json
// has (so the French messages can never lag the English ones).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readMessages = (locale) =>
  JSON.parse(readFileSync(path.join(rootDir, 'messages', `${locale}.json`), 'utf8'));

const walk = (obj, prefix = [], out = []) => {
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value === 'object') {
      walk(value, [...prefix, key], out);
    } else {
      out.push([...prefix, key].join('.'));
    }
  }
  return out;
};

const enKeys = walk(readMessages('en'));
const frKeys = new Set(walk(readMessages('fr')));
const missing = enKeys.filter((key) => !frKeys.has(key));

if (missing.length > 0) {
  console.error('[i18n-locales] fr.json is missing keys that en.json has:');
  for (const key of missing) console.error(`  - ${key}`);
  process.exit(1);
}

console.log(`[i18n-locales] fr.json has all ${enKeys.length} keys from en.json ✔`);
