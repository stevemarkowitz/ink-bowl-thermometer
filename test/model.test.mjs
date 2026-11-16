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
  // Honest scale: the tube is the goal, so fill = raised / goal (and still shared, so the taller tube raised more).
  assert.ok(Math.abs(stan.frac - 0.2805) < 1e-9, `stan frac ${stan.frac}`);
  assert.ok(Math.abs(cal.frac - 0.1391) < 1e-9, `cal frac ${cal.frac}`);
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

test('FILL AGREES WITH THE GOAL LABEL: the tube is the goal, never nearly full at a small percent', () => {
  const live = (raised, goal = 10000) => ({ raised, goal, ok: true, stale: false, url: 'x' });
  const pend = { raised: 0, goal: null, ok: true, stale: false, pending: true, url: null };
  for (const [cal, stanford] of [[live(625), pend], [live(625), live(0)], [live(1391), live(2805)], [live(9000), live(100)], [live(50), live(40)]]) {
    const b = buildBoard({ event: 'X', gameDate: '2026-11-21', now, cal, stanford });
    assert.equal(b.scaleMax, 10000, 'top of the tube = the goal');
    for (const s of b.sides) {
      if (!s.goal || s.raised <= 0) continue;
      // fill (as a percent) matches "N% of goal" to within a point (the visible minimum aside)
      assert.ok(Math.abs(s.frac * 100 - s.pctOfGoal) <= 1 || s.frac === 0.035, `${s.key}: tube ${(s.frac * 100).toFixed(1)}% vs label ${s.pctOfGoal}%`);
    }
  }
  const one = buildBoard({ event: 'X', gameDate: '2026-11-21', now, cal: live(625), stanford: pend });
  assert.ok(one.sides[0].frac < 0.07, 'the exact complaint: 6% of goal must not look nearly full');
});

test('passing the goal extends the tube and shows a goal line; no goal falls back to the leader', () => {
  const g = (raised) => ({ raised, goal: 10000, ok: true, stale: false, url: 'x' });
  const over = buildBoard({ event: 'X', gameDate: '2026-11-21', now, cal: g(11000), stanford: g(3000) });
  assert.ok(over.scaleMax > 10000); assert.ok(over.sides[0].goalFrac > 0.7 && over.sides[0].goalFrac < 0.95, 'goal line below the top once passed');
  const none = (raised) => ({ raised, goal: null, ok: true, stale: false, url: 'x' });
  const ng = buildBoard({ event: 'X', gameDate: '2026-11-21', now, cal: none(800), stanford: none(400) });
  assert.ok(ng.sides[0].frac >= 0.79, 'with no goal there is nothing to scale to but the leader');
});
