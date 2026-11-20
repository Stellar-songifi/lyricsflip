#!/usr/bin/env ts-node
/**
 * Sync ISSUES.md backlog into GitHub issues.
 *
 * Usage:
 *   npm --prefix backend run issues:sync -- [--dry-run] [FILE] [--file FILE] [--repo owner/name]
 *
 * - FILE defaults to the repository's ISSUES.md. Pass a path such as `../BACKLOG.md`
 *   to sync a different backlog, either as the first argument or with `--file`.
 * - Parses every `### LF-xxx · Title` block (labels, description, tasks, acceptance criteria).
 * - Creates labels once (area:*, priority:*, type:*, effort:*).
 * - Skips issues whose `LF-xxx` already exists on GitHub (idempotent, re-runnable).
 * - Writes the issue-number mapping back as `<!-- gh:NNN -->` comments in the synced file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

interface ParsedIssue {
  id: string;
  title: string;
  labels: string[];
  body: string;
  startLine: number;
  endLine: number;
}

const HEADER_RE = /^###\s+(LF-\d+)\s*·\s*(.+?)\s*$/;
const MAPPING_RE = /<!--\s*gh:(\d+)\s*-->/;
const REPO_ROOT = resolve(__dirname, '../..');
const DEFAULT_FILE = resolve(REPO_ROOT, 'ISSUES.md');

export function parseArgs(argv: string[]) {
  const opts = { dryRun: false, file: DEFAULT_FILE, repo: '' };
  let fileSet = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--file' || arg === '--repo') {
      const value = argv[++i];
      if (!value || value.startsWith('--'))
        throw new Error(`${arg} requires a value`);
      if (arg === '--file') {
        opts.file = value;
        fileSet = true;
      } else opts.repo = value;
    } else if (!arg.startsWith('-') && !fileSet) {
      opts.file = arg;
      fileSet = true;
    }
  }
  return opts;
}

function resolveFilePath(file: string) {
  if (isAbsolute(file)) return file;
  const fromCwd = resolve(process.cwd(), file);
  return existsSync(fromCwd) ? fromCwd : resolve(REPO_ROOT, file);
}

function gh(args: string[], repo: string): string {
  const full = repo ? [...args, '--repo', repo] : args;
  return execFileSync('gh', full, { encoding: 'utf8' }).trim();
}

function parseIssues(markdown: string): ParsedIssue[] {
  const lines = markdown.split('\n');
  const issues: ParsedIssue[] = [];
  let current: ParsedIssue | null = null;

  const flush = (endLine: number) => {
    if (!current) return;
    current.endLine = endLine;
    current.body = current.body.trim();
    issues.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const header = HEADER_RE.exec(line);
    if (header) {
      flush(i - 1);
      current = {
        id: header[1],
        title: header[2],
        labels: [],
        body: '',
        startLine: i,
        endLine: i,
      };
      continue;
    }
    if (!current) continue;
    if (/^##\s+/.test(line) || /^---\s*$/.test(line)) {
      flush(i - 1);
      continue;
    }
    const labelsMatch = /^\*\*Labels?:\*\*\s*(.+)$/i.exec(line);
    if (labelsMatch) {
      current.labels = labelsMatch[1]
        .split(/[,;]/)
        .map((l) => l.trim())
        .filter(Boolean);
      continue;
    }
    current.body += line + '\n';
  }
  flush(lines.length - 1);
  return issues;
}

export function normalizeLabels(raw: string[]): string[] {
  const out = new Set<string>();
  for (const label of raw) {
    const lower = label.toLowerCase();
    if (/^p[0-3]$/.test(lower)) out.add(`priority:${lower.toUpperCase()}`);
    else if (['bug', 'feature', 'devex', 'docs', 'chore'].includes(lower))
      out.add(`type:${lower}`);
    else if (/^(s|m|l|xl)$/.test(lower))
      out.add(`effort:${lower.toUpperCase()}`);
    else out.add(label);
  }
  return [...out];
}

function ensureLabels(labels: string[], repo: string, dryRun: boolean) {
  const colors: Record<string, string> = {
    'priority:P0': 'b60205',
    'priority:P1': 'd93f0b',
    'priority:P2': 'fbca04',
    'priority:P3': '0e8a16',
  };
  for (const label of labels) {
    if (dryRun) continue;
    try {
      gh(
        [
          'label',
          'create',
          label,
          '--color',
          colors[label] ?? 'ededed',
          '--force',
        ],
        repo,
      );
    } catch {
      // label already exists or cannot be created; continue
    }
  }
}

function existingIssueNumbers(repo: string): Set<string> {
  const raw = gh(
    [
      'issue',
      'list',
      '--state',
      'all',
      '--limit',
      '1000',
      '--json',
      'number,title,body',
    ],
    repo,
  );
  const found = new Set<string>();
  const list = JSON.parse(raw) as Array<{
    number: number;
    title: string;
    body: string;
  }>;
  for (const issue of list) {
    const match = /LF-\d+/.exec(issue.title) ?? /LF-\d+/.exec(issue.body ?? '');
    if (match) found.add(match[0]);
  }
  return found;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const filePath = resolveFilePath(opts.file);
  const markdown = readFileSync(filePath, 'utf8');
  const issues = parseIssues(markdown);

  if (issues.length === 0) {
    console.log('No `### LF-xxx · Title` blocks found.');
    return;
  }

  const existing = opts.dryRun
    ? new Set<string>()
    : existingIssueNumbers(opts.repo);
  const allLabels = new Set<string>();
  for (const issue of issues)
    for (const l of normalizeLabels(issue.labels)) allLabels.add(l);
  ensureLabels([...allLabels], opts.repo, opts.dryRun);

  const lines = markdown.split('\n');
  const mappings: Array<{ line: number; number: number }> = [];

  for (const issue of issues) {
    if (existing.has(issue.id)) {
      console.log(`skip ${issue.id} (already exists)`);
      continue;
    }
    const labels = normalizeLabels(issue.labels);
    const body = `**${issue.id}**\n\n${issue.body}`;
    if (opts.dryRun) {
      console.log(
        `[dry-run] would create ${issue.id} · ${issue.title} [${labels.join(', ')}]`,
      );
      continue;
    }
    const url = gh(
      [
        'issue',
        'create',
        '--title',
        `${issue.id} · ${issue.title}`,
        '--body',
        body,
        ...labels.flatMap((l) => ['--label', l]),
      ],
      opts.repo,
    );
    const number = Number(url.split('/').pop());
    console.log(`created ${issue.id} -> #${number}`);
    mappings.push({ line: issue.startLine, number });
  }

  if (mappings.length > 0) {
    for (const { line, number } of mappings.sort((a, b) => b.line - a.line)) {
      if (!MAPPING_RE.test(lines[line])) {
        lines[line] = `${lines[line]} <!-- gh:${number} -->`;
      }
    }
    writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log(`Wrote ${mappings.length} mapping(s) to ${opts.file}`);
  }
}

if (require.main === module) main();
