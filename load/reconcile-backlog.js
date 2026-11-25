import {
  backlogSize,
  baseOptions,
  baseSetup,
  constantScenario,
  envInt,
  expect,
  expectStatus,
  jsonOf,
  reconcileRequest,
  RECONCILE_PATH,
  RECONCILE_STATUS_PATH,
  recordOutcome,
  SCENARIOS,
  scenarioTags,
  writeSummary,
} from './common.js';

const NAME = SCENARIOS.reconcile;

export const options = baseOptions({
  [NAME]: constantScenario(NAME, 'reconcileSweep', {
    vus: envInt('RECONCILE_VUS', 5),
    duration: __ENV.RECONCILE_DURATION || '20s',
  }),
});

export function setup() {
  return baseSetup({ seedBacklog: true });
}

export function reconcileSweep(data) {
  const tags = scenarioTags(NAME, { operation: 'reconcile_sweep' });
  backlogSize.add(data.backlog || 0, tags);

  const sweepTags = scenarioTags(NAME, { operation: 'sweep' });
  const swept = reconcileRequest('POST', RECONCILE_PATH, {}, sweepTags, data);
  let ok = expectStatus(swept, [200, 201], sweepTags);
  const result = jsonOf(swept);
  ok = expect(result.matched === true, 'escrow balances reconciled', sweepTags) && ok;

  const statusTags = scenarioTags(NAME, { operation: 'reconciliation_status' });
  const status = reconcileRequest('GET', RECONCILE_STATUS_PATH, undefined, statusTags, data);
  const statusBody = jsonOf(status);
  ok =
    expectStatus(status, 200, statusTags) &&
    expect(statusBody.checkedAt === result.checkedAt, 'status shows the latest sweep', statusTags) &&
    ok;

  recordOutcome(ok, tags);
}

export function handleSummary(data) {
  return writeSummary(data, [NAME]);
}
