#!/usr/bin/env node
// Fails when the client JavaScript emitted by `next build` exceeds the budget
// (LF-295). Run after `npm run build`. Override the budget in KiB with
// BUNDLE_BUDGET_KB.

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CHUNKS_DIR = join(process.cwd(), '.next', 'static', 'chunks');
const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB ?? 5120);

if (!existsSync(CHUNKS_DIR)) {
  console.error(`${CHUNKS_DIR} not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const totalBytes = walk(CHUNKS_DIR)
  .filter((file) => file.endsWith('.js'))
  .reduce((sum, file) => sum + statSync(file).size, 0);
const totalKb = Math.round(totalBytes / 1024);

console.log(`Client JS: ${totalKb} KiB (budget ${BUDGET_KB} KiB)`);
if (totalKb > BUDGET_KB) {
  console.error('Bundle size budget exceeded.');
  process.exit(1);
}
