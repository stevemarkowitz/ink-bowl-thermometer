import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCampaignRef } from '../src/campaign.js';
import { parseNeonPage, fetchNeonCampaign, NEON_STATS_PATH } from '../src/neon.js';
import { NotLiveError } from '../src/givebutter.js';
import { readSide, sideConfig } from '../src/sources.js';
import { makeStore } from '../src/store.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const NEON_URL = 'https://friendsstanforddaily.app.neoncrm.com/campaigns/big-game-2026';
const page = fx('neon-big-game-2026.html');           // the REAL page, captured 2026-11-17
const noSuch = fx('neon-no-such-campaign.html');      // the REAL generic page Neon serves for a campaign that does not exist
const html = (body, status = 200) => ({ ok: status < 400, status, text: async () => body, json: async () => JSON.parse(body) });
const json = (obj, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(obj), json: async () => obj });

/** A fake Neon: serves the page on GET and the statistics on POST, recording what was posted. */
function fakeNeon({ pageBody = page, pageStatus = 200, stats = { donorCount: 1, registrantCount: 0, raisedTotal: 52.04 }, statsStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body });
    if (url.endsWith(NEON_STATS_PATH)) return json(stats, statsStatus);
    return html(pageBody, pageStatus);
  };
  return { fetchImpl, calls };
}

test('campaign references: Givebutter slug, Givebutter link, Neon link, nonsense', () => {
  assert.deepEqual(parseCampaignRef('HbHXTN'), { provider: 'givebutter', id: 'HbHXTN', slug: 'HbHXTN', url: 'https://givebutter.com/HbHXTN' });
  assert.equal(parseCampaignRef('https://givebutter.com/inkbowl-2026-hgksv5').id, 'inkbowl-2026-hgksv5');
  const n = parseCampaignRef(NEON_URL);
  assert.equal(n.provider, 'neon'); assert.equal(n.id, 'neon:friendsstanforddaily/big-game-2026'); assert.equal(n.url, NEON_URL);
  assert.equal(parseCampaignRef(`${NEON_URL}?utm=x#top`).id, n.id, 'query and fragment are ignored');
  assert.equal(parseCampaignRef(''), null); assert.equal(parseCampaignRef(null), null);
  assert.equal(parseCampaignRef('https://example.com/campaigns/x'), null);
  assert.equal(parseCampaignRef('https://friendsstanforddaily.app.neoncrm.com/'), null, 'a Neon host without a campaign page');
});

test('the real Neon page parses: campaign id 6, goal $10,000, and the page\'s own include-flags', () => {
  const p = parseNeonPage(page);
  assert.equal(p.campaignId, 6); assert.equal(p.goal, 10000); assert.equal(p.title, 'Big Game 2026');
  assert.deepEqual(p.flags, { includeSub: true, includeEvent: false, includePledge: true });
});

test('a page that is not a campaign (no such campaign) is not parsed', () => {
  assert.equal(parseNeonPage(noSuch), null);
  assert.equal(parseNeonPage('<html>maintenance</html>'), null);
});

test('fetchNeonCampaign sends exactly the page\'s own statistics request and returns the page\'s number', async () => {
  const { fetchImpl, calls } = fakeNeon();
  const r = await fetchNeonCampaign(parseCampaignRef(NEON_URL), { fetchImpl });
  assert.equal(r.raised, 52.04); assert.equal(r.goal, 10000); assert.equal(r.donors, 1); assert.equal(r.source, 'neon');
  assert.equal(r.slug, 'neon:friendsstanforddaily/big-game-2026');
  const post = calls.find((c) => c.method === 'POST');
  assert.equal(post.url, 'https://friendsstanforddaily.app.neoncrm.com' + NEON_STATS_PATH);
  assert.deepEqual(JSON.parse(post.body), { campaignId: 6, includeSub: true, includeEvent: false, includePledge: true, includeAnonymous: true });
});

test('a missing raisedTotal is $0, like the page itself does', async () => {
  const { fetchImpl } = fakeNeon({ stats: { donorCount: 0, registrantCount: 0 } });
  assert.equal((await fetchNeonCampaign(parseCampaignRef(NEON_URL), { fetchImpl })).raised, 0);
});

test('not live: 404, or the generic no-such-campaign page, is NotLive; an outage is not', async () => {
  const ref = parseCampaignRef(NEON_URL);
  await assert.rejects(() => fetchNeonCampaign(ref, { fetchImpl: fakeNeon({ pageStatus: 404, pageBody: '' }).fetchImpl }), NotLiveError);
  await assert.rejects(() => fetchNeonCampaign(ref, { fetchImpl: fakeNeon({ pageBody: noSuch }).fetchImpl }), NotLiveError);
  await assert.rejects(() => fetchNeonCampaign(ref, { fetchImpl: fakeNeon({ pageStatus: 503, pageBody: '' }).fetchImpl }), (e) => !(e instanceof NotLiveError));
  await assert.rejects(() => fetchNeonCampaign(ref, { fetchImpl: fakeNeon({ statsStatus: 500 }).fetchImpl }), (e) => !(e instanceof NotLiveError));
  await assert.rejects(() => fetchNeonCampaign(ref, { fetchImpl: fakeNeon({ stats: { raisedTotal: 'banana' } }).fetchImpl }), (e) => !(e instanceof NotLiveError));
});

test('a side configured with the Neon link reads from Neon (via readSide), not Givebutter', async () => {
  const cfg = sideConfig({ STANFORD_SLUG: NEON_URL }, 'stanford');
  assert.equal(cfg.campaign.provider, 'neon'); assert.equal(cfg.slug, 'neon:friendsstanforddaily/big-game-2026');
  const { fetchImpl, calls } = fakeNeon();
  const r = await readSide(cfg, { fetchImpl, store: makeStore({}) });
  assert.equal(r.ok, true); assert.equal(r.pending, false); assert.equal(r.raised, 52.04); assert.equal(r.goal, 10000);
  assert.equal(r.source, 'neon'); assert.equal(r.provider, 'neon'); assert.equal(r.url, NEON_URL, 'the donate link is the Neon campaign page');
  assert.ok(calls.every((c) => c.url.includes('neoncrm.com')), 'no Givebutter request for a Neon side');
});

test('Neon side not published yet: pending $0; then live: real numbers (even $0)', async () => {
  const store = makeStore({}); const cfg = { ...sideConfig({ STANFORD_SLUG: NEON_URL }, 'stanford'), key: 'neon-flip' };  // unique store key (the in-memory store is module-global)
  const a = await readSide(cfg, { fetchImpl: fakeNeon({ pageBody: noSuch }).fetchImpl, store });
  assert.equal(a.pending, true); assert.equal(a.raised, 0); assert.equal(a.ok, true);
  const b = await readSide(cfg, { fetchImpl: fakeNeon({ stats: { donorCount: 0, registrantCount: 0, raisedTotal: 0 } }).fetchImpl, store });
  assert.equal(b.pending, false); assert.equal(b.raised, 0); assert.equal(b.source, 'neon');
});

test('Neon outage keeps the last known value; and never inherits a Givebutter total (the trap)', async () => {
  const store = makeStore({}); const cfg = { ...sideConfig({ STANFORD_SLUG: NEON_URL }, 'stanford'), key: 'neon-keep' };
  await readSide(cfg, { fetchImpl: fakeNeon().fetchImpl, store });                     // live: 52.04
  const down = await readSide(cfg, { fetchImpl: fakeNeon({ statsStatus: 503 }).fetchImpl, store });
  assert.equal(down.raised, 52.04); assert.equal(down.stale, true); assert.equal(down.ok, false);
  // a stored Givebutter total under the same side key must not appear for the Neon campaign
  await store.setLastGood('neon-trap', { slug: 'msB1YJ', raised: 2805, goal: 10000, source: 'json-scoped', ok: true, stale: false });
  const t = await readSide({ ...sideConfig({ STANFORD_SLUG: NEON_URL }, 'stanford'), key: 'neon-trap' }, { fetchImpl: fakeNeon({ pageBody: noSuch }).fetchImpl, store });
  assert.equal(t.pending, true); assert.equal(t.raised, 0);
});
