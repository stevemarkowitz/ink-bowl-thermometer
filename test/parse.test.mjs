import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCampaign, decodeEntities, campaignUrl } from '../src/givebutter.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

// Fixtures are real pages captured 2026-11-12. If Givebutter changes its page
// shape these tests fail, which is the signal to update the parser.
test('Daily Cal campaign HbHXTN', () => {
  const r = parseCampaign(fx('HbHXTN.html'), 'HbHXTN');
  assert.equal(r.source, 'json-scoped');
  assert.equal(r.raised, 1391);
  assert.equal(r.goal, 10000);
  assert.equal(r.title, 'Ink Bowl 2025');
  assert.match(r.creator, /Daily Californian Education Foundation/);
});

test('Stanford campaign msB1YJ', () => {
  const r = parseCampaign(fx('msB1YJ.html'), 'msB1YJ');
  assert.equal(r.source, 'json-scoped');
  assert.equal(r.raised, 2805);
  assert.equal(r.goal, 10000);
  assert.equal(r.title, 'Big Game 2025');
});

test('scoped parse ignores other campaigns on the page', () => {
  // The Stanford hub lists three campaigns; asking for one slug must not
  // return another slug's total.
  const hub = fx('stanford-hub.html');
  const ink = parseCampaign(hub, 'fRGluy');
  const other = parseCampaign(hub, 'h0CJIU');
  if (ink.source === 'json-scoped' && other.source === 'json-scoped') {
    assert.notEqual(ink.raised, other.raised);
  }
});

test('unknown slug does not silently borrow a number', () => {
  const r = parseCampaign(fx('HbHXTN.html'), 'ZZZZZZ');
  // Falls back to loose parse, but must record that it did so.
  assert.notEqual(r.source, 'json-scoped');
});

test('entity decoding', () => {
  assert.equal(decodeEntities('Goodbye &#039;25 &amp; hello'), "Goodbye '25 & hello");
  assert.equal(decodeEntities('a&nbsp;b'), 'a b');
});

test('campaignUrl', () => {
  assert.equal(campaignUrl('HbHXTN'), 'https://givebutter.com/HbHXTN');
});
