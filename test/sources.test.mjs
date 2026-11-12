import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSide } from '../src/sources.js';
import { fetchCampaignViaApi } from '../src/givebutter-api.js';
import { makeStore } from '../src/store.js';

const page = readFileSync(new URL('./fixtures/HbHXTN.html', import.meta.url), 'utf8');
const json = (obj, status = 200) => ({ ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj) });
const html = (body, status = 200) => ({ ok: status < 400, status, text: async () => body, json: async () => { throw new Error('not json'); } });

const apiCampaign = { id: 780123, code: 'HbHXTN', title: 'Ink Bowl 2025', goal: 10000, raised: 1400, donors: 12, status: 'active' };

test('API adapter finds a campaign by code in the list', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init.headers.authorization]);
    if (url.includes('/campaigns?page=1')) return json({ data: [{ id: 1, code: 'other', raised: 5, goal: 0 }, apiCampaign], meta: { last_page: 1 } });
    throw new Error('unexpected ' + url);
  };
  const r = await fetchCampaignViaApi({ apiKey: 'k', slug: 'hbhxtn' }, { fetchImpl });
  assert.equal(r.raised, 1400);
  assert.equal(r.goal, 10000);
  assert.equal(r.campaignId, 780123);
  assert.equal(r.source, 'api');
  assert.equal(calls[0][1], 'Bearer k');
});

test('API adapter uses a direct GET when the id is known', async () => {
  const fetchImpl = async (url) => url.endsWith('/campaigns/780123') ? json({ data: apiCampaign }) : json({}, 404);
  const r = await fetchCampaignViaApi({ apiKey: 'k', slug: 'HbHXTN', campaignId: 780123 }, { fetchImpl });
  assert.equal(r.raised, 1400);
});

test('side with no key reads the public page', async () => {
  const fetchImpl = async (url) => url.startsWith('https://givebutter.com/HbHXTN') ? html(page) : json({}, 500);
  const r = await readSide({ key: 'cal', slug: 'HbHXTN', apiKey: null }, { fetchImpl, store: makeStore({}) });
  assert.equal(r.ok, true);
  assert.equal(r.raised, 1391);
  assert.equal(r.source, 'json-scoped');
  assert.equal(r.apiEnabled, false);
});

test('side with a key prefers the API', async () => {
  const fetchImpl = async (url) => url.startsWith('https://api.givebutter.com') ? json({ data: apiCampaign }) : html(page);
  const r = await readSide({ key: 'cal', slug: 'HbHXTN', apiKey: 'k', campaignId: 780123 }, { fetchImpl, store: makeStore({}) });
  assert.equal(r.source, 'api');
  assert.equal(r.raised, 1400);
});

test('API failure falls back to the page, and the error is recorded', async () => {
  const fetchImpl = async (url) => url.startsWith('https://api.givebutter.com') ? json({ message: 'nope' }, 401) : html(page);
  const r = await readSide({ key: 'cal', slug: 'HbHXTN', apiKey: 'bad' }, { fetchImpl, store: makeStore({}) });
  assert.equal(r.ok, true);
  assert.equal(r.raised, 1391);
  assert.match(r.error, /api: .*401/);
});

test('total failure serves the last good number, marked stale', async () => {
  const store = makeStore({});
  await store.setLastGood('cal', { raised: 1391, goal: 10000, source: 'json-scoped', ok: true, stale: false });
  const fetchImpl = async () => html('<html>down</html>', 503);
  const r = await readSide({ key: 'cal', slug: 'HbHXTN', apiKey: null }, { fetchImpl, store });
  assert.equal(r.ok, false);
  assert.equal(r.stale, true);
  assert.equal(r.raised, 1391);
  assert.equal(r.source, 'json-scoped(last-good)');
});

test('a manual pin wins over everything', async () => {
  const store = makeStore({});
  await store.setPin('cal', { raised: 9999, goal: 10000 });
  const fetchImpl = async () => { throw new Error('should not be called'); };
  const r = await readSide({ key: 'cal', slug: 'HbHXTN', apiKey: 'k' }, { fetchImpl, store });
  assert.equal(r.source, 'pin');
  assert.equal(r.raised, 9999);
});
