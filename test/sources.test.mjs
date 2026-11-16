import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSide } from '../src/sources.js';
import { fetchCampaignViaApi } from '../src/givebutter-api.js';
import { makeStore } from '../src/store.js';
import { NotLiveError, fetchCampaign, parseCampaign } from '../src/givebutter.js';

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
  await store.setLastGood('cal', { slug: 'HbHXTN', raised: 1391, goal: 10000, source: 'json-scoped', ok: true, stale: false });
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

test('unchanged reads do not rewrite last-good (KV Free write budget)', async () => {
  const store = makeStore({});
  let writes = 0; const orig = store.setLastGood; store.setLastGood = (...a) => { writes++; return orig(...a); };
  const fetchImpl = async () => html(page);
  // unique side key: the in-memory store is module-global, shared with the other tests
  for (let i = 0; i < 5; i++) await readSide({ key: 'write-budget', slug: 'HbHXTN', apiKey: null }, { fetchImpl, store });
  assert.equal(writes, 1);
});

// ---- 2026 readiness: a campaign that is not public yet ----
const unpublished = readFileSync(new URL('./fixtures/unpublished.html', import.meta.url), 'utf8');
const vanity = readFileSync(new URL('./fixtures/vanity-slug.html', import.meta.url), 'utf8');
const notLiveFetch = async () => html(unpublished);          // Givebutter: HTTP 200 + "This fundraiser has not been published."
const noSuchFetch = async () => html('<title>Butter 404</title>', 404);

test('an unpublished campaign is recognised as not live (not as an error)', async () => {
  await assert.rejects(() => fetchCampaign('inkbowl-2026-hgksv5', { fetchImpl: notLiveFetch }), NotLiveError);
  await assert.rejects(() => fetchCampaign('nope', { fetchImpl: noSuchFetch }), NotLiveError);
  // a transient outage is NOT "not live"
  await assert.rejects(() => fetchCampaign('x', { fetchImpl: async () => html('', 503) }), (e) => !(e instanceof NotLiveError));
  await assert.rejects(() => fetchCampaign('x', { fetchImpl: async () => html('<html>weird page</html>') }), (e) => !(e instanceof NotLiveError));
});

test('never-live campaign counts as $0, pending, ok (so the board shows "opening soon")', async () => {
  // unique side key: the in-memory store is module-global (an earlier test pins 'cal')
  const r = await readSide({ key: 'pending-test', slug: 'inkbowl-2026-hgksv5', apiKey: null }, { fetchImpl: notLiveFetch, store: makeStore({}) });
  assert.equal(r.pending, true); assert.equal(r.ok, true); assert.equal(r.stale, false);
  assert.equal(r.raised, 0); assert.equal(r.goal, null); assert.equal(r.source, 'pending');
  assert.match(r.reason, /not published/);
});

test('a missing slug (link not shared yet) is pending too, with no donate URL', async () => {
  const r = await readSide({ key: 'stanford', slug: null, apiKey: null }, { fetchImpl: async () => { throw new Error('must not fetch'); }, store: makeStore({}) });
  assert.equal(r.pending, true); assert.equal(r.url, null); assert.equal(r.raised, 0);
});

test('pending becomes real numbers as soon as the campaign publishes (even $0)', async () => {
  const store = makeStore({});
  const cfg = { key: 'wake-up', slug: 'daily-cal-membership-campaign', apiKey: null };
  const first = await readSide(cfg, { fetchImpl: notLiveFetch, store });
  assert.equal(first.pending, true);
  const second = await readSide(cfg, { fetchImpl: async () => html(vanity) , store });   // now public
  assert.equal(second.pending, false); assert.equal(second.ok, true); assert.equal(second.source, 'json-scoped');
  assert.equal(second.raised, 3133.5);
});

test('THE TRAP: last season\'s total is never shown under a new campaign link', async () => {
  const store = makeStore({});
  await store.setLastGood('trap', { slug: 'HbHXTN', raised: 1391, goal: 10000, source: 'json-scoped', ok: true, stale: false }); // 2025
  const r = await readSide({ key: 'trap', slug: 'inkbowl-2026-hgksv5', apiKey: null }, { fetchImpl: notLiveFetch, store });         // 2026
  assert.equal(r.pending, true); assert.equal(r.raised, 0, '2025 money must not appear under the 2026 link');
  const down = await readSide({ key: 'trap', slug: 'inkbowl-2026-hgksv5', apiKey: null }, { fetchImpl: async () => html('', 503), store });
  assert.equal(down.raised, 0, 'nor during an outage'); assert.equal(down.ok, false);
});

test('a campaign that was live keeps its last known value if it is later unpublished or the site is down', async () => {
  const store = makeStore({});
  await store.setLastGood('stays', { slug: 'live-one', raised: 500, goal: 1000, source: 'json-scoped', ok: true, stale: false });
  const a = await readSide({ key: 'stays', slug: 'live-one', apiKey: null }, { fetchImpl: notLiveFetch, store });
  assert.equal(a.raised, 500); assert.equal(a.stale, true); assert.equal(a.pending, false);
  const b = await readSide({ key: 'stays', slug: 'live-one', apiKey: null }, { fetchImpl: async () => html('', 503), store });
  assert.equal(b.raised, 500); assert.equal(b.stale, true);
});

test('first write for a new slug always persists, even if the numbers match the old slug', async () => {
  const store = makeStore({});
  await store.setLastGood('same', { slug: 'old', raised: 0, goal: null, source: 'json-scoped', ok: true, stale: false, writtenAt: Date.now() });
  const zero = `<html>"url":"https:\\/\\/givebutter.com\\/new-one","creator_name":"X","goal":0,"raised":"0.00","raised_percentage":0</html>`;
  await readSide({ key: 'same', slug: 'new-one', apiKey: null }, { fetchImpl: async () => html(zero), store });
  assert.equal((await store.getLastGood('same')).slug, 'new-one');
});

test('custom-named (vanity) links parse like code links', () => {
  const r = parseCampaign(vanity, 'daily-cal-membership-campaign');
  assert.equal(r.source, 'json-scoped'); assert.equal(r.raised, 3133.5);
});

test('the real, live Daily Cal 2026 campaign page (captured 2026-11-16) parses: $605 of $10,000', () => {
  const live2026 = readFileSync(new URL('./fixtures/dailycal-2026-live.html', import.meta.url), 'utf8');
  const r = parseCampaign(live2026, 'inkbowl-2026-hgksv5');
  assert.equal(r.source, 'json-scoped'); assert.equal(r.raised, 605); assert.equal(r.goal, 10000);
  assert.match(r.title, /Ink Bowl Competitive Fund Drive 2026/);
});
