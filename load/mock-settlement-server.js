#!/usr/bin/env node
'use strict';

/**
 * Test-only stand-in for the wallet -> Stellar escrow -> indexer write path.
 *
 * The LyricsFlip API deliberately has no HTTP endpoint that can place, stake,
 * settle or claim a wager (see backend/src/wager/wager.controller.ts), and the
 * nightly reconciliation service has no HTTP trigger. This harness exposes the
 * same wager state machine and reconciliation DTO shape so k6 can drive those
 * paths concurrently without a scaled Stellar network. It never replaces the
 * real contract or the real reconciler in production.
 */

const http = require('node:http');
const { randomUUID } = require('node:crypto');

const PORT = Number.parseInt(process.env.MOCK_PORT || '4555', 10);
const BASE_LATENCY_MS = Number.parseInt(process.env.MOCK_LATENCY_MS || '5', 10);
const JITTER_MS = Number.parseInt(process.env.MOCK_JITTER_MS || '10', 10);

const rounds = new Map();
const matches = new Map();
const wagers = new Map();
const locks = new Map();
let lastReconciliation = null;
let requestCount = 0;

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function fail(res, status, message) {
  send(res, status, { statusCode: status, message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

async function simulateWork() {
  const wait = Math.max(0, BASE_LATENCY_MS + Math.floor(Math.random() * (JITTER_MS + 1)));
  await new Promise((resolve) => setTimeout(resolve, wait));
}

async function withLock(key, fn) {
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  locks.set(key, current);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
}

function newWager(roundId, player, amount, asset) {
  const now = new Date().toISOString();
  const wager = {
    id: randomUUID(),
    roundId,
    player,
    amount: String(amount),
    asset: asset || 'native',
    txHash: null,
    status: 'escrowed',
    createdAt: now,
    updatedAt: now,
  };
  wagers.set(wager.id, wager);
  return wager;
}

function publicQuestion(question) {
  const { correctAnswer, timesUsed, correctAnswers, ...visible } = question;
  return visible;
}

async function handleSolo(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/api/v1/quick-game/rounds') {
    await simulateWork();
    const body = await readBody(req);
    const difficulty = Number(body.difficulty);
    const count = Number(body.count);
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
      return fail(res, 400, 'difficulty must be an integer between 1 and 5');
    }
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      return fail(res, 400, 'count must be an integer between 1 and 20');
    }
    const id = randomUUID();
    const questions = Array.from({ length: count }, (_, index) => ({
      id: randomUUID(),
      difficulty,
      snippet: `mock lyric snippet ${index + 1}`,
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: index % 4,
      timesUsed: 0,
      correctAnswers: 0,
      points: 100,
      timeLimit: 30,
    }));
    rounds.set(id, { id, questions, cursor: 0, servedAt: null, score: 0, flags: [] });
    return send(res, 201, { roundId: id, totalQuestions: count });
  }

  const questionMatch = pathname.match(/^\/api\/v1\/quick-game\/rounds\/([^/]+)\/question$/);
  if (req.method === 'GET' && questionMatch) {
    const round = rounds.get(decodeURIComponent(questionMatch[1]));
    if (!round) return fail(res, 404, 'Round not found');
    return withLock(`round:${round.id}`, async () => {
      await simulateWork();
      if (round.cursor >= round.questions.length) return fail(res, 400, 'Round is finished');
      if (round.servedAt === null) round.servedAt = Date.now();
      return send(res, 200, {
        index: round.cursor,
        question: publicQuestion(round.questions[round.cursor]),
      });
    });
  }

  const answerMatch = pathname.match(/^\/api\/v1\/quick-game\/rounds\/([^/]+)\/answers$/);
  if (req.method === 'POST' && answerMatch) {
    const round = rounds.get(decodeURIComponent(answerMatch[1]));
    if (!round) return fail(res, 404, 'Round not found');
    const body = await readBody(req);
    return withLock(`round:${round.id}`, async () => {
      await simulateWork();
      if (round.servedAt === null) return fail(res, 400, 'No question is awaiting an answer');
      const question = round.questions[round.cursor];
      if (!question || question.id !== body.questionId) {
        return fail(res, 400, 'Answer is not for the current question');
      }
      const correct = Number(body.answerIndex) === question.correctAnswer;
      const pointsAwarded = correct ? 100 : 0;
      round.score += pointsAwarded;
      round.cursor += 1;
      round.servedAt = null;
      return send(res, 201, {
        correct,
        correctAnswer: question.correctAnswer,
        pointsAwarded,
        responseTimeMs: 0,
        score: round.score,
        flags: [],
        finished: round.cursor >= round.questions.length,
      });
    });
  }

  const summaryMatch = pathname.match(/^\/api\/v1\/quick-game\/rounds\/([^/]+)$/);
  if (req.method === 'GET' && summaryMatch) {
    const round = rounds.get(decodeURIComponent(summaryMatch[1]));
    if (!round) return fail(res, 404, 'Round not found');
    await simulateWork();
    return send(res, 200, {
      roundId: round.id,
      answered: round.cursor,
      totalQuestions: round.questions.length,
      score: round.score,
      flags: [],
    });
  }

  return fail(res, 404, 'Unknown quick-game route');
}

async function handleWagers(req, res, pathname, searchParams) {
  if (req.method === 'GET' && pathname === '/mock/wagers/me') {
    await simulateWork();
    const player = searchParams.get('player') || '';
    return send(res, 200, {
      wagers: [...wagers.values()].filter((wager) => wager.player === player),
    });
  }

  if (req.method === 'POST' && pathname === '/mock/wagers/backlog') {
    await simulateWork();
    const body = await readBody(req);
    const count = Math.min(Math.max(Number.parseInt(body.count, 10) || 0, 0), 10000);
    for (let index = 0; index < count; index += 1) {
      newWager(`backlog-${randomUUID()}`, `G${'A'.repeat(55)}`, '10000000', body.asset || 'native');
    }
    const pending = [...wagers.values()].filter((wager) => wager.status === 'escrowed').length;
    return send(res, 201, { created: count, pending });
  }

  if (req.method === 'POST' && pathname === '/mock/wagers/head-to-head') {
    await simulateWork();
    const body = await readBody(req);
    if (!body.playerA || !body.playerB || !body.roundId || !body.amount) {
      return fail(res, 400, 'playerA, playerB, roundId and amount are required');
    }
    const matchId = randomUUID();
    const stake = String(body.amount);
    const asset = body.asset || 'native';
    const created = [
      newWager(body.roundId, body.playerA, stake, asset),
      newWager(body.roundId, body.playerB, stake, asset),
    ];
    matches.set(matchId, {
      id: matchId,
      roundId: body.roundId,
      state: 'open',
      winner: null,
      wagerIds: created.map((wager) => wager.id),
    });
    return send(res, 201, { matchId, roundId: body.roundId, state: 'open', wagers: created });
  }

  const actionMatch = pathname.match(/^\/mock\/wagers\/([^/]+)\/(lock|settle|claim)$/);
  if (req.method === 'POST' && actionMatch) {
    const matchId = decodeURIComponent(actionMatch[1]);
    const action = actionMatch[2];
    const body = await readBody(req);
    return withLock(`match:${matchId}`, async () => {
      await simulateWork();
      const match = matches.get(matchId);
      if (!match) return fail(res, 404, 'Match not found');

      if (action === 'lock') {
        if (match.state !== 'open') return fail(res, 409, `Cannot lock a ${match.state} match`);
        match.state = 'locked';
        return send(res, 200, { matchId, state: match.state, roundId: match.roundId });
      }

      if (action === 'settle') {
        if (match.state !== 'locked') return fail(res, 409, `Cannot settle a ${match.state} match`);
        if (body.winner !== 'A' && body.winner !== 'B') return fail(res, 400, 'winner must be A or B');
        const winningWagerId = body.winner === 'A' ? match.wagerIds[0] : match.wagerIds[1];
        for (const id of match.wagerIds) {
          const wager = wagers.get(id);
          wager.status = id === winningWagerId ? 'won' : 'lost';
          wager.updatedAt = new Date().toISOString();
        }
        match.winner = body.winner;
        match.state = 'settled';
        return send(res, 200, {
          matchId,
          state: match.state,
          winner: match.winner,
          wagers: match.wagerIds.map((id) => wagers.get(id)),
        });
      }

      const winningWager = match.wagerIds.map((id) => wagers.get(id)).find(
        (wager) => wager.player === body.player && wager.status === 'won',
      );
      if (!winningWager) return fail(res, 409, 'Player has no winnings to claim');
      winningWager.status = 'claimed';
      winningWager.updatedAt = new Date().toISOString();
      return send(res, 200, { wager: winningWager });
    });
  }

  return fail(res, 404, 'Unknown wager route');
}

async function handleReconciliation(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/mock/reconcile') {
    return withLock('reconcile', async () => {
      await simulateWork();
      const dbEscrowedTotals = {};
      for (const wager of wagers.values()) {
        if (wager.status !== 'escrowed') continue;
        dbEscrowedTotals[wager.asset] =
          (BigInt(dbEscrowedTotals[wager.asset] || '0') + BigInt(wager.amount)).toString();
      }
      const contractBalances = { ...dbEscrowedTotals };
      const differences = {};
      for (const asset of Object.keys(contractBalances)) {
        differences[asset] = (
          BigInt(contractBalances[asset]) - BigInt(dbEscrowedTotals[asset])
        ).toString();
      }
      lastReconciliation = {
        checkedAt: new Date().toISOString(),
        dbEscrowedTotals,
        contractBalances,
        differences,
        matched: Object.values(differences).every((difference) => difference === '0'),
      };
      return send(res, 200, lastReconciliation);
    });
  }

  if (req.method === 'GET' && pathname === '/mock/reconcile/status') {
    if (!lastReconciliation) return fail(res, 404, 'No reconciliation result yet');
    return send(res, 200, lastReconciliation);
  }

  return fail(res, 404, 'Unknown reconciliation route');
}

async function route(req, res) {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const pathname = url.pathname;

  requestCount += 1;
  if (requestCount === 1 || requestCount % 500 === 0) {
    process.stderr.write(`[load-harness] handled ${requestCount} requests\n`);
  }

  if (pathname === '/health/live' && req.method === 'GET') {
    return send(res, 200, { status: 'ok' });
  }
  if (pathname === '/health/ready' && req.method === 'GET') {
    return send(res, 200, { status: 'ok', mode: 'mock-settlement' });
  }
  if (pathname.startsWith('/api/v1/quick-game/')) {
    return handleSolo(req, res, pathname);
  }
  if (pathname.startsWith('/mock/wagers/')) {
    return handleWagers(req, res, pathname, url.searchParams);
  }
  if (pathname.startsWith('/mock/reconcile')) {
    return handleReconciliation(req, res, pathname);
  }
  return fail(res, 404, 'Unknown route');
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    process.stderr.write(`[load-harness] ${error.stack || error.message}\n`);
    if (!res.headersSent) fail(res, 500, 'Internal mock harness error');
  });
});

server.listen(PORT, '127.0.0.1', () => {
  process.stderr.write(`[load-harness] mock settlement ready on http://127.0.0.1:${PORT}\n`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
