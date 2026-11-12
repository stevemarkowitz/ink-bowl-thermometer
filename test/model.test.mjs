import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard, formatMoney, niceCeiling, daysUntil } from '../src/model.js';

const side = (raised, goal = 10000) => ({ raised, goal, ok: true, stale: false, url: 'x' });
const now = new Date('2026-11-12T20:00:00Z'); // Nov 12, 12pm PT

test('formatMoney', () => {
  assert.equal(formatMoney(1391), '$1,391');
  assert.equal(formatMoney(2805.4), '$2,805');
  assert.equal(formatMoney(0), '$0');
  assert.equal(formatMoney(null), '—');
});

test('niceCeiling lands on round numbers', () => {
  assert.equal(niceCeiling(3141), 4000);
  assert.equal(niceCeiling(1000), 1000);
  assert.equal(niceCeiling(10001), 12500);
  assert.equal(niceCeiling(0), 1000);
});

test('countdown to Big Game', () => {
  assert.equal(daysUntil('2026-11-21', now), 9);
  assert.equal(daysUntil('2026-11-21', new Date('2026-11-21T18:00:00Z')), 0);
});

test('leader, trailer and nudges from live 2025 numbers', () => {
  const b = buildBoard({ event: 'INK BOWL 2025', gameDate: '2026-11-21', now, cal: side(1391), stanford: side(2805) });
  assert.equal(b.leader, 'stanford');
  assert.equal(b.headline, 'STANFORD DAILY LEADS BY $1,414');
  const [cal, stan] = b.sides;
  assert.equal(cal.nudge, '$1,415 takes the lead');
  assert.equal(stan.nudge, 'Ahead by $1,414');
  assert.equal(b.countdown, '9 DAYS TO BIG GAME');
  assert.equal(b.combinedText, '$4,196');
  // Leader fills most of the frame; shared scale keeps the race honest.
  assert.ok(stan.frac > 0.7 && stan.frac <= 1, `stan frac ${stan.frac}`);
  assert.ok(cal.frac < stan.frac);
  assert.equal(cal.pctOfGoal, 14);
  assert.equal(stan.pctOfGoal, 28);
});

test('zero state and tie are handled', () => {
  const z = buildBoard({ event: 'X', gameDate: '2026-11-21', now, cal: side(0), stanford: side(0) });
  assert.equal(z.leader, null);
  assert.equal(z.headline, 'THE RACE IS ON');
  assert.equal(z.sides[0].frac, 0);
  const t = buildBoard({ event: 'X', gameDate: '2026-11-21', now, cal: side(500), stanford: side(500) });
  assert.equal(t.headline, 'DEAD EVEN AT $500');
  assert.equal(t.sides[0].nudge, 'Dead even');
});

test('tiny gift is still visible', () => {
  const b = buildBoard({ event: 'X', gameDate: '2026-11-21', now, cal: side(5), stanford: side(9000) });
  assert.ok(b.sides[0].frac >= 0.035);
});
