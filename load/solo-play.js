import {
  apiRequest,
  baseOptions,
  baseSetup,
  envInt,
  expect,
  expectStatus,
  jsonOf,
  rampingScenario,
  recordOutcome,
  SCENARIOS,
  scenarioTags,
  writeSummary,
} from './common.js';

const NAME = SCENARIOS.solo;

export const options = baseOptions({
  [NAME]: rampingScenario(NAME, 'soloPlay'),
});

export function setup() {
  return baseSetup();
}

export function soloPlay(data) {
  const tags = scenarioTags(NAME, { operation: 'solo_round' });
  const requestedQuestions = envInt('SOLO_QUESTIONS', 3);
  const start = apiRequest(
    'POST',
    '/quick-game/rounds',
    { difficulty: envInt('SOLO_DIFFICULTY', 2), count: requestedQuestions },
    scenarioTags(NAME, { operation: 'start_round' }),
    data,
  );

  let ok = expectStatus(start, [200, 201], scenarioTags(NAME, { operation: 'start_round' }));
  const started = jsonOf(start);
  const totalQuestions = Number(started.totalQuestions || requestedQuestions);
  if (!ok || !started.roundId) {
    recordOutcome(false, tags);
    return;
  }

  for (let index = 0; index < totalQuestions; index += 1) {
    const questionTags = scenarioTags(NAME, { operation: 'next_question' });
    const next = apiRequest(
      'GET',
      `/quick-game/rounds/${started.roundId}/question`,
      undefined,
      questionTags,
      data,
    );
    const question = jsonOf(next).question;
    ok = expectStatus(next, 200, questionTags) && expect(question && question.id, 'question has an id', questionTags) && ok;
    if (!question || !question.id) break;

    const answerTags = scenarioTags(NAME, { operation: 'submit_answer' });
    const answer = apiRequest(
      'POST',
      `/quick-game/rounds/${started.roundId}/answers`,
      { questionId: question.id, answerIndex: index % 4 },
      answerTags,
      data,
    );
    ok = expectStatus(answer, [200, 201], answerTags) && ok;
  }

  const summaryTags = scenarioTags(NAME, { operation: 'summary' });
  const summary = apiRequest(
    'GET',
    `/quick-game/rounds/${started.roundId}`,
    undefined,
    summaryTags,
    data,
  );
  ok = expectStatus(summary, 200, summaryTags) && ok;

  recordOutcome(ok, tags);
}

export function handleSummary(data) {
  return writeSummary(data, [NAME]);
}
