import {
  baseOptions,
  baseSetup,
  envInt,
  expect,
  expectStatus,
  guestPlayers,
  jsonOf,
  mockRequest,
  rampingScenario,
  recordOutcome,
  SCENARIOS,
  scenarioTags,
  writeSummary,
} from './common.js';

const NAME = SCENARIOS.wager;

export const options = baseOptions({
  [NAME]: rampingScenario(NAME, 'headToHeadStaking'),
});

export function setup() {
  return baseSetup();
}

export function headToHeadStaking(data) {
  const tags = scenarioTags(NAME, { operation: 'wager_lifecycle' });
  const players = guestPlayers(__ITER || 0, __VU || 1);
  const roundId = `load-${__VU}-${__ITER}-${Date.now()}`;
  const stake = String(envInt('WAGER_STAKE', 10000000));

  const createTags = scenarioTags(NAME, { operation: 'stake_head_to_head' });
  const created = mockRequest(
    'POST',
    '/mock/wagers/head-to-head',
    {
      roundId,
      playerA: players.a,
      playerB: players.b,
      asset: 'native',
      amount: stake,
    },
    createTags,
    data,
  );
  let ok = expectStatus(created, [200, 201], createTags);
  const match = jsonOf(created);
  if (!ok || !match.matchId) {
    recordOutcome(false, tags);
    return;
  }

  const lockTags = scenarioTags(NAME, { operation: 'lock_wagers' });
  const locked = mockRequest('POST', `/mock/wagers/${match.matchId}/lock`, {}, lockTags, data);
  ok = expectStatus(locked, 200, lockTags) && expect(jsonOf(locked).state === 'locked', 'round moved to locked', lockTags) && ok;

  const settleTags = scenarioTags(NAME, { operation: 'settle_wagers' });
  const settled = mockRequest(
    'POST',
    `/mock/wagers/${match.matchId}/settle`,
    { winner: 'A' },
    settleTags,
    data,
  );
  ok = expectStatus(settled, 200, settleTags) && expect(jsonOf(settled).state === 'settled', 'round moved to settled', settleTags) && ok;

  const claimTags = scenarioTags(NAME, { operation: 'claim_winnings' });
  const claimed = mockRequest(
    'POST',
    `/mock/wagers/${match.matchId}/claim`,
    { player: players.a },
    claimTags,
    data,
  );
  const claimBody = jsonOf(claimed);
  ok =
    expectStatus(claimed, 200, claimTags) &&
    expect(claimBody.wager && claimBody.wager.status === 'claimed', 'winner claimed', claimTags) &&
    ok;

  const readTags = scenarioTags(NAME, { operation: 'read_wagers' });
  const read = mockRequest('GET', `/mock/wagers/me?player=${players.a}`, undefined, readTags, data);
  ok = expectStatus(read, 200, readTags) && expect(Array.isArray(jsonOf(read).wagers), 'wager list returned', readTags) && ok;

  recordOutcome(ok, tags);
}

export function handleSummary(data) {
  return writeSummary(data, [NAME]);
}
