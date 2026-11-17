// The 2026 story in the real Workers runtime (wrangler dev), each side on its own platform:
//   Daily Cal = Givebutter, Stanford Daily = Neon CRM. A local server stands in for both, serving the REAL captured pages:
//   Givebutter's real "This fundraiser has not been published." page and a real live campaign page, and Neon's real
//   generic "no such campaign" page and the real Big Game 2026 page + statistics call.
// Verified: 1) both awaiting data (pending, $0, disabled buttons, no lead claimed) 2) the Daily Cal goes live while Stanford
// is still awaiting 3) Stanford (Neon) goes live: both real, the leader appears, both donate links are real.
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const FIX = path.join(__dirname, '..', 'test', 'fixtures');
const read = (f) => fs.readFileSync(path.join(FIX, f));
const ORIGIN_PORT = 9798, DEV_PORT = 8789;
const NEON_URL = 'https://friendsstanforddaily.app.neoncrm.com/campaigns/big-game-2026';
let calPublished = false, stanfordPublished = false;

const origin = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'POST' && url === '/nx/portal/landing-page/retrieveCampaignStatics') {
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ donorCount: 1, registrantCount: 0, raisedTotal: 52.04 }));
  }
  if (url === '/campaigns/big-game-2026') {                                  // Neon: Stanford
    res.writeHead(200, { 'content-type': 'text/html' }); return res.end(stanfordPublished ? read('neon-big-game-2026.html') : read('neon-no-such-campaign.html'));
  }
  const slug = url.slice(1);
  if (slug === 'inkbowl-2026-hgksv5') {                                      // Givebutter: Daily Cal
    const body = calPublished ? read('dailycal-2026-live.html') : read('unpublished.html');
    res.writeHead(200, { 'content-type': 'text/html' }); return res.end(body);
  }
  res.writeHead(404, { 'content-type': 'text/html' }); res.end('<title>Butter 404</title>');
});
const get = (p, headers = {}) => fetch(`http://127.0.0.1:${DEV_PORT}${p}`, { headers }).then(async (r) => ({ status: r.status, headers: r.headers, text: await r.text() }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (m) => console.log('  … ' + m);
const totals = async (n) => JSON.parse((await get(`/api/totals.json?nocache=${n}`)).text);
async function until(pred, what, tries = 40) {
  for (let i = 0; i < tries; i++) { const t = await totals(`${what}-${i}`); if (pred(t)) return t; await sleep(3000); }
  throw new Error(`timed out waiting for: ${what}`);
}

(async () => {
  fs.rmSync(path.join(__dirname, '..', '.wrangler', 'state'), { recursive: true, force: true });
  await new Promise((r) => origin.listen(ORIGIN_PORT, '127.0.0.1', r));
  const dev = spawn('npx', ['wrangler', 'dev', '--port', String(DEV_PORT), '--ip', '127.0.0.1',
    '--var', `GIVEBUTTER_ORIGIN:http://127.0.0.1:${ORIGIN_PORT}`, '--var', `NEON_ORIGIN:http://127.0.0.1:${ORIGIN_PORT}`, '--var', 'SEASON:2026'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; dev.stdout.on('data', (d) => (log += d)); dev.stderr.on('data', (d) => (log += d));
  try {
    for (let i = 0; i < 90; i++) { try { if ((await get('/health')).status === 200) break; } catch {} await sleep(1000); }

    step('1) 2026: both campaigns not public (Givebutter unpublished page; Neon no-such-campaign page)');
    let t = await totals('a');
    assert.equal(t.event, 'Ink Bowl 2026'); assert.equal(t.season, '2026');
    assert.equal(t.sides.cal.slug, 'inkbowl-2026-hgksv5'); assert.equal(t.sides.cal.provider, 'givebutter');
    assert.equal(t.sides.stanford.slug, 'neon:friendsstanforddaily/big-game-2026'); assert.equal(t.sides.stanford.provider, 'neon');
    for (const k of ['cal', 'stanford']) { const s = t.sides[k]; assert.equal(s.pending, true, `${k} pending`); assert.equal(s.ok, true); assert.equal(s.raised, 0); assert.equal(s.stale, false); }
    assert.equal(t.headline, 'THE RACE IS ON'); assert.equal(t.leader, null);
    const svg = await get('/thermometer.svg?nocache=1'); assert.equal(svg.status, 200); assert.match(svg.text, /^<svg/);
    let page = await get('/', { accept: 'text/html', 'sec-fetch-dest': 'document' });
    assert.match(page.text, /Ink Bowl 2026/); assert.match(page.text, /Awaiting campaign data/); assert.doesNotMatch(page.text, /<a class="btn"/);

    step('2) the Daily Cal (Givebutter) goes live; Stanford (Neon) is still awaiting');
    calPublished = true;
    t = await until((j) => j.sides.cal.pending === false, 'cal-live');
    assert.equal(t.sides.cal.raised, 605, 'the real live Daily Cal page: $605'); assert.equal(t.sides.cal.source, 'json-scoped');
    assert.equal(t.sides.stanford.pending, true); assert.equal(t.leader, null, 'nobody leads while Stanford has no data'); assert.equal(t.headline, 'THE RACE IS ON');

    step('3) Stanford (Neon CRM) goes live: both real, the leader appears, both donate links are real');
    stanfordPublished = true;
    t = await until((j) => j.sides.stanford.pending === false, 'stanford-live');
    assert.equal(t.sides.stanford.raised, 52.04); assert.equal(t.sides.stanford.goal, 10000); assert.equal(t.sides.stanford.source, 'neon');
    assert.equal(t.sides.stanford.provider, 'neon'); assert.equal(t.sides.cal.pending, false);
    assert.equal(t.leader, 'cal'); assert.match(t.headline, /DAILY CAL LEADS BY \$553/);
    page = await get('/', { accept: 'text/html', 'sec-fetch-dest': 'document' });
    assert.equal([...page.text.matchAll(/<a class="btn"/g)].length, 2, 'both donate buttons are real links');
    assert.ok(page.text.includes(`href="${NEON_URL}"`), 'the Stanford button goes to its Neon campaign page');
    assert.doesNotMatch(page.text, /<p class="pending-note">/);
    console.log('integration-2026: both-awaiting -> Daily Cal (Givebutter) live -> Stanford (Neon) live, verified in workerd');
  } catch (e) {
    console.error('integration-2026 FAILED:', e.message); console.error(log.split('\n').filter((l) => /error|ERROR|failed/i.test(l)).slice(-15).join('\n'));
    process.exitCode = 1;
  } finally { dev.kill('SIGTERM'); origin.close(); await sleep(500); try { process.kill(-dev.pid); } catch {} process.exit(process.exitCode || 0); }
})();
