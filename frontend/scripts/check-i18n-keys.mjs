#!/usr/bin/env node
/**
 * CI check for issue #896 (LF-310): `messages/fr.json` must contain every key
 * that `messages/en.json` has. Run via `npm run check:i18n`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? flatten(value, prefix ? `${prefix}.${key}` : key)
      : [[prefix ? `${prefix}.${key}` : key, value]],
  );

const read = (locale) => {
  const raw = fs.readFileSync(path.join(root, 'messages', `${locale}.json`), 'utf8');
  return new Map(flatten(JSON.parse(raw)));
};

const en = read('en');
const fr = read('fr');

const missing = [...en.keys()].filter((key) => !fr.has(key));
if (missing.length) {
  console.error('❌ messages/fr.json is missing keys that messages/en.json has:');
  missing.forEach((key) => console.error(`  - ${key}`));
  process.exit(1);
}

const extra = [...fr.keys()].filter((key) => !en.has(key));
extra.forEach((key) => console.warn(`⚠️ messages/fr.json has key missing from messages/en.json: ${key}`));

console.log('✅ messages/fr.json contains every key from messages/en.json');
