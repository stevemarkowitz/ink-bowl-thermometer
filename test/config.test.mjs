import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from '../src/config.js';
import { buildBoard, formatGameDate } from '../src/model.js';
import { renderSvg } from '../src/render.js';
import { embedPage } from '../src/page.js';

test('SEASON 2025 (the default) reads the 2025 campaigns and says 2025', () => {
  const c = resolveConfig({});
  assert.equal(c.season, '2025'); assert.equal(c.eventLabel, 'Ink Bowl 2025');
  assert.deepEqual(c.slugs, { cal: 'HbHXTN', stanford: 'msB1YJ' });
});

test('SEASON 2026 reads the 2026 slugs and says 2026; a missing slug is null (opening soon)', () => {
  const c = resolveConfig({ SEASON: '2026' });
  assert.equal(c.eventLabel, 'Ink Bowl 2026');
  assert.equal(c.slugs.cal, 'inkbowl-2026-hgksv5');
  assert.equal(c.slugs.stanford, null, 'Stanford link not shared yet');
  assert.equal(resolveConfig({ SEASON: '2026', STANFORD_SLUG_2026: 'abc123' }).slugs.stanford, 'abc123');
});

test('explicit overrides beat the season values', () => {
  const c = resolveConfig({ SEASON: '2026', CAL_SLUG: 'zzz', EVENT_LABEL: 'Ink Bowl Test' });
  assert.equal(c.slugs.cal, 'zzz'); assert.equal(c.eventLabel, 'Ink Bowl Test');
});

test('the Big Game date drives the date on the board and the countdown', () => {
  assert.equal(formatGameDate('2026-11-21'), 'NOV 21');
  assert.equal(formatGameDate('2027-11-20'), 'NOV 20');
  const side = (raised) => ({ raised, goal: 10000, ok: true, stale: false, url: 'x' });
  const b = buildBoard({ event: 'Ink Bowl 2026', gameDate: '2026-11-21', now: new Date('2026-11-16T20:00:00Z'), cal: side(0), stanford: side(0) });
  assert.equal(b.countdown, '5 DAYS TO BIG GAME'); assert.equal(b.gameDateText, 'NOV 21');
  const g = buildBoard({ event: 'X', gameDate: '2026-11-21', now: new Date('2026-11-21T18:00:00Z'), cal: side(0), stanford: side(0) });
  assert.equal(g.countdown, 'BIG GAME TODAY');
});

const pend = { raised: 0, goal: null, ok: true, stale: false, pending: true, url: null };
const live = (raised) => ({ raised, goal: 10000, ok: true, stale: false, url: 'https://givebutter.com/x' });
const now = new Date('2026-11-16T20:00:00Z');

test('both pending: a calm $0 start, "opening soon" for both, not an error and not stale', () => {
  const b = buildBoard({ event: 'Ink Bowl 2026', gameDate: '2026-11-21', now, cal: pend, stanford: pend });
  assert.equal(b.headline, 'THE RACE IS ON'); assert.equal(b.stale, false);
  assert.deepEqual(b.sides.map((s) => s.nudge), ['Opening soon', 'Opening soon']);
  assert.deepEqual(b.sides.map((s) => s.raisedText), ['$0', '$0']);
  assert.doesNotThrow(() => renderSvg(b));
});

test('one pending: the live side leads, the pending side says opening soon', () => {
  const b = buildBoard({ event: 'Ink Bowl 2026', gameDate: '2026-11-21', now, cal: live(250), stanford: pend });
  assert.equal(b.leader, 'cal'); assert.equal(b.sides[1].nudge, 'Opening soon'); assert.equal(b.sides[0].nudge, 'Ahead by $250');
});

test('the page shows a disabled button for a pending side and a real link for a live one', () => {
  const b = buildBoard({ event: 'Ink Bowl 2026', gameDate: '2026-11-21', now, cal: live(250), stanford: pend });
  const page = embedPage(b, { origin: 'https://inkbowl.giving' });
  assert.match(page, /Give to The Daily Californian/);
  assert.match(page, /The Stanford Daily: campaign opening soon/);
  assert.doesNotMatch(page, /Give to The Stanford Daily/);
  assert.equal([...page.matchAll(/<a class="btn"/g)].length, 1);
});
