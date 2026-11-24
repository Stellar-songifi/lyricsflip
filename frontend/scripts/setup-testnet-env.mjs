#!/usr/bin/env node
// LF-363: fill frontend/.env.local from the shared testnet deployment record.
// Run with `npm run env:testnet` from the frontend directory.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(FRONTEND_DIR, '..');
const DEPLOYMENT_FILE = join(REPO_ROOT, 'deployments', 'testnet.json');
const TEMPLATE_FILE = join(FRONTEND_DIR, '.env.example');
const LOCAL_ENV_FILE = join(FRONTEND_DIR, '.env.local');
const CONTRACT_ID = /^C[A-Z2-7]{55}$/;

const fail = (message) => {
  console.error(`setup-testnet-env: ${message}`);
  process.exit(1);
};

const assignment = (line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

const unquote = (value) => {
  const trimmed = value.trim();
  return /^"(.*)"$/.test(trimmed) || /^'(.*)'$/.test(trimmed)
    ? trimmed.slice(1, -1)
    : trimmed;
};

const quote = (value) => `"${value.replace(/(["\\])/g, '\\$1')}"`;

const parseEnv = (text) => {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = assignment(line);
    if (match) values.set(match[1], unquote(match[2]));
  }
  return values;
};

if (!existsSync(DEPLOYMENT_FILE)) fail(`${DEPLOYMENT_FILE} not found`);
if (!existsSync(TEMPLATE_FILE)) fail(`${TEMPLATE_FILE} not found`);

let deployment;
try {
  deployment = JSON.parse(readFileSync(DEPLOYMENT_FILE, 'utf8'));
} catch (error) {
  fail(`cannot parse ${DEPLOYMENT_FILE}: ${error.message}`);
}

if (deployment.network !== 'testnet') {
  fail(`expected network "testnet" in ${DEPLOYMENT_FILE}`);
}

for (const field of ['lyricsflip', 'lyricsflipNft']) {
  if (!CONTRACT_ID.test(deployment[field] ?? '')) {
    fail(`${field} is not a valid contract ID in ${DEPLOYMENT_FILE}`);
  }
}

const overrides = new Map([
  ['NEXT_PUBLIC_STELLAR_RPC_URL', deployment.rpcUrl],
  ['NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE', deployment.networkPassphrase],
  ['NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID', deployment.lyricsflip],
  ['NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID', deployment.lyricsflipNft],
]);

const existing = existsSync(LOCAL_ENV_FILE)
  ? parseEnv(readFileSync(LOCAL_ENV_FILE, 'utf8'))
  : new Map();
const templateLines = readFileSync(TEMPLATE_FILE, 'utf8').split(/\r?\n/);
const templateKeys = new Set();

const lines = templateLines.map((line) => {
  const match = assignment(line);
  if (!match) return line;
  const [, key, templateValue] = match;
  templateKeys.add(key);
  const value =
    overrides.get(key) ?? existing.get(key) ?? unquote(templateValue);
  return `${key}=${quote(value)}`;
});

const extraLines = [...existing]
  .filter(([key]) => !templateKeys.has(key))
  .map(([key, value]) => `${key}=${quote(value)}`);
if (extraLines.length > 0) {
  lines.push('', '# Preserved from the previous .env.local', ...extraLines);
}

writeFileSync(LOCAL_ENV_FILE, lines.join('\n'), { mode: 0o600 });

console.log(`Wrote ${LOCAL_ENV_FILE} from ${DEPLOYMENT_FILE}`);
console.log(`  lyricsflip:     ${deployment.lyricsflip}`);
console.log(`  lyricsflip-nft: ${deployment.lyricsflipNft}`);
console.log(`  deployed at:    ${deployment.deployedAt ?? 'unknown'}`);
