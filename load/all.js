import {
  baseOptions,
  baseSetup,
  constantScenario,
  envInt,
  rampingScenario,
  SCENARIOS,
  writeSummary,
} from './common.js';
import { soloPlay } from './solo-play.js';
import { headToHeadStaking } from './head-to-head.js';
import { reconcileSweep } from './reconcile-backlog.js';

const names = [SCENARIOS.solo, SCENARIOS.wager, SCENARIOS.reconcile];

export const options = baseOptions({
  [SCENARIOS.solo]: rampingScenario(SCENARIOS.solo, 'runSoloPlay'),
  [SCENARIOS.wager]: rampingScenario(SCENARIOS.wager, 'runHeadToHead'),
  [SCENARIOS.reconcile]: constantScenario(SCENARIOS.reconcile, 'runReconcile', {
    vus: envInt('RECONCILE_VUS', 5),
    duration: __ENV.RECONCILE_DURATION || '20s',
  }),
});

export function setup() {
  return baseSetup({ seedBacklog: true });
}

export function runSoloPlay(data) {
  soloPlay(data);
}

export function runHeadToHead(data) {
  headToHeadStaking(data);
}

export function runReconcile(data) {
  reconcileSweep(data);
}

export function handleSummary(data) {
  return writeSummary(data, names);
}
