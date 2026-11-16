import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from '../src/config.js';
import { buildBoard, formatGameDate } from '../src/model.js';
import { renderSvg } from '../src/render.js';
import { embedPage } from '../src/page.js';

test('SEASON 2025 reads the 2025 campaigns and says 2025', () => {
  const c = resolveConfig({ SEASON: '2025' });
  assert.equal(c.season, '2025'); assert.equal(c.eventLabel, 'Ink Bowl 2025');
  assert.deepEqual(c.slugs, { cal: 'HbHXTN', stanford: 'msB1YJ' });
});

test('the default season is 2026 (the live season)', () => {
  assert.equal(resolveConfig({}).season, '2026'); assert.equal(resolveConfig({}).eventLabel, 'Ink Bowl 2026');
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

test('both pending: a calm $0 start, explicit "awaiting campaign data" for both, no lead claimed, not an error', () => {
  const b = buildBoard({ event: 'Ink Bowl 2026', gameDate: '2026-11-21', now, cal: pend, stanford: pend });
  assert.equal(b.headline, 'THE RACE IS ON'); assert.equal(b.stale, false); assert.equal(b.pending, true); assert.equal(b.leader, null);
  assert.deepEqual(b.sides.map((s) => s.nudge), ['Awaiting campaign data', 'Awaiting campaign data']);
  assert.deepEqual(b.sides.map((s) => s.raisedText), ['$0', '$0']);
  assert.doesNotThrow(() => renderSvg(b));
});

test('one pending: NOBODY leads (no claim over a side with no data); the live side says every gift counts', () => {
  const b = buildBoard({ event: 'Ink Bowl 2026', gameDate: '2026-11-21', now, cal: live(605), stanford: pend });
  assert.equal(b.leader, null); assert.equal(b.gap, 0); assert.equal(b.headline, 'THE RACE IS ON');
  assert.equal(b.sides[0].nudge, 'Every gift counts'); assert.equal(b.sides[1].nudge, 'Awaiting campaign data');
  assert.equal(b.sides[0].leading, false); assert.equal(b.sides[0].trailing, false);
  assert.equal(b.combinedText, '$605');
});

test('every pending combination renders, in both directions, with the notice fitting its box', () => {
  for (const [cal, stanford] of [[pend, live(605)], [live(605), pend], [pend, pend]]) {
    const svg = renderSvg(buildBoard({ event: 'Ink Bowl 2026', gameDate: '2026-11-21', now, cal, stanford }));
    assert.match(svg, /aria-label="[^"]*awaiting campaign data/);
    assert.doesNotMatch(svg, /<text[\s>]|font-family/);
  }
});

test('the page keeps both buttons at the bottom; a pending side is visibly disabled with the reason', () => {
  const b = buildBoard({ event: 'Ink Bowl 2026', gameDate: '2026-11-21', now, cal: live(605), stanford: pend });
  const page = embedPage(b, { origin: 'https://inkbowl.giving' });
  assert.match(page, /Give to The Daily Californian/);
  assert.match(page, /<span class="btn off" role="link" aria-disabled="true" tabindex="-1">[\s\S]*Give to The Stanford Daily<small>Awaiting campaign link<\/small>/);
  assert.equal([...page.matchAll(/<a class="btn"/g)].length, 1, 'only the live side is a real link');
  assert.match(page, /Awaiting campaign data:<\/strong> The Stanford Daily hasn't opened its 2026 campaign yet/);
  // buttons come after the board image, i.e. at the bottom
  assert.ok(page.indexOf('class="board"') < page.indexOf('class="btn'), 'buttons are below the board');
});

test('a fully live board shows no pending note and two real links', () => {
  const b = buildBoard({ event: 'Ink Bowl 2026', gameDate: '2026-11-21', now, cal: live(605), stanford: live(400) });
  const page = embedPage(b, { origin: 'https://inkbowl.giving' });
  assert.equal([...page.matchAll(/<a class="btn"/g)].length, 2); assert.doesNotMatch(page, /<p class="pending-note">/);
});
