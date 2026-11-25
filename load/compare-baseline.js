#!/usr/bin/env node
'use strict';

/** Compare a k6 summary against load/baseline.json. Used by CI and local runs. */

const fs = require('node:fs');
const path = require('node:path');

const summaryPath = process.argv[2] || 'load-summary.json';
const baselinePath = process.argv[3] || path.join(__dirname, 'baseline.json');

const tolerance = {
  p95: Number(process.env.BASELINE_P95_TOLERANCE || 1.5),
  p99: Number(process.env.BASELINE_P99_TOLERANCE || 1.5),
  error: Number(process.env.BASELINE_ERROR_TOLERANCE || 0.02),
  rps: Number(process.env.BASELINE_RPS_TOLERANCE || 0.7),
  success: Number(process.env.BASELINE_SUCCESS_TOLERANCE || 0.02),
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`Could not read ${file}: ${error.message}`);
    process.exit(2);
  }
}

const summary = readJson(summaryPath);
const baseline = readJson(baselinePath);
const rows = [];
let regressions = 0;

for (const [name, expected] of Object.entries(baseline.scenarios || {})) {
  const actual = (summary.scenarios || {})[name];
  if (!actual) {
    rows.push({ name, result: 'MISSING', detail: `no metrics for ${name}` });
    regressions += 1;
    continue;
  }

  const checks = [
    {
      label: 'p95',
      ok: actual.p95_ms <= Math.max(1, expected.p95_ms * tolerance.p95),
      detail: `${actual.p95_ms}ms <= ${round(Math.max(1, expected.p95_ms * tolerance.p95))}ms`,
    },
    {
      label: 'p99',
      ok: actual.p99_ms <= Math.max(1, expected.p99_ms * tolerance.p99),
      detail: `${actual.p99_ms}ms <= ${round(Math.max(1, expected.p99_ms * tolerance.p99))}ms`,
    },
    {
      label: 'errors',
      ok: actual.error_rate <= expected.error_rate + tolerance.error,
      detail: `${actual.error_rate} <= ${round(expected.error_rate + tolerance.error, 5)}`,
    },
    {
      label: 'rps',
      ok: actual.rps >= expected.rps * tolerance.rps,
      detail: `${actual.rps} >= ${round(expected.rps * tolerance.rps)}`,
    },
    {
      label: 'success',
      ok: actual.success_rate >= expected.success_rate - tolerance.success,
      detail: `${actual.success_rate} >= ${round(expected.success_rate - tolerance.success, 5)}`,
    },
  ];

  const failed = checks.filter((check) => !check.ok);
  if (failed.length) regressions += 1;
  rows.push({
    name,
    result: failed.length ? 'REGRESSION' : 'PASS',
    detail: failed.map((check) => `${check.label}: ${check.detail}`).join('; ') || checks.map((check) => `${check.label}: ${check.detail}`).join('; '),
    actual,
    expected,
  });
}

const markdown = [
  '## k6 load-test baseline comparison',
  '',
  `Summary: \`${summaryPath}\` · Baseline: \`${baselinePath}\` (${baseline.source || 'unspecified source'})`,
  '',
  '| Scenario | Verdict | p95 (ms) | Errors | RPS | Success | Detail |',
  '| --- | --- | ---: | ---: | ---: | ---: | --- |',
  ...rows.map((row) => {
    const a = row.actual || {};
    return `| ${row.name} | ${row.result} | ${a.p95_ms ?? '-'} | ${a.error_rate ?? '-'} | ${a.rps ?? '-'} | ${a.success_rate ?? '-'} | ${row.detail} |`;
  }),
  '',
  regressions ? `**${regressions} scenario(s) regressed beyond baseline tolerance.**` : 'All scenarios are within baseline tolerance.',
  '',
].join('\n');

console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}
process.exit(regressions ? 1 : 0);

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value || 0) * factor) / factor;
}
