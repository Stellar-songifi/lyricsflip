#!/usr/bin/env node
'use strict';

/**
 * Promote a k6 summary into load/baseline.json. Run this against a real
 * staging-like environment and commit the result; never promote a smoke run
 * without updating the source field.
 */

const fs = require('node:fs');
const path = require('node:path');

const summaryPath = process.argv[2] || 'load-summary.json';
const baselinePath = process.argv[3] || path.join(__dirname, 'baseline.json');

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const scenarios = {};

for (const [name, values] of Object.entries(summary.scenarios || {})) {
  scenarios[name] = {
    p95_ms: values.p95_ms,
    p99_ms: values.p99_ms,
    error_rate: values.error_rate,
    success_rate: values.success_rate,
    rps: values.rps,
  };
}

const environment = (summary.meta && summary.meta.environment) || 'unknown';
const baseline = {
  version: 1,
  source: process.env.BASELINE_SOURCE || `${environment} k6 run`,
  generatedAt: (summary.meta && summary.meta.generatedAt) || new Date().toISOString(),
  commit: (summary.meta && summary.meta.commit) || '',
  environment,
  scenarios,
};

fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
console.log(`Wrote ${baselinePath} from ${summaryPath} (${Object.keys(scenarios).length} scenarios).`);
