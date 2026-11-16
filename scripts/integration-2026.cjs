// Season-switch check in the real Workers runtime. Runs `wrangler dev` with SEASON=2026 against a tiny local server
// that serves Givebutter's REAL "This fundraiser has not been published." page for the Daily Cal's 2026 link, and
// verifies: 2026 label, both sides pending ($0, "opening soon", not an error), and that the Daily Cal side flips to
// real numbers when the link publishes (the server is switched to a captured live page mid-test).
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const FIX = path.join(__dirname, '..', 'test', 'fixtures');
const read = (f) => fs.readFileSync(path.join(FIX, f));
const ORIGIN_PORT = 9798, DEV_PORT = 8789;
let published = false;
const fixtures = http.createServer((req, res) => {
  const slug = req.url.slice(1).split('?')[0];
  if (slug === 'inkbowl-2026-hgksv5') {
    // not published: Givebutter's real unpublished page; published: a captured live campaign page, re-labelled to this slug
    const body = published ? read('vanity-slug.html').toString().replace(/daily-cal-membership-campaign/g, 'inkbowl-2026-hgksv5') : read('unpublished.html');
    res.writeHead(200, { 'content-type': 'text/html' }); return res.end(body);
  }
  res.writeHead(404, { 'content-type': 'text/html' }); res.end('<title>Butter 404</title>');
});
const get = (p, headers = {}) => fetch(`http://127.0.0.1:${DEV_PORT}${p}`, { headers }).then(async (r) => ({ status: r.status, headers: r.headers, text: await r.text() }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (m) => console.log('  … ' + m);

(async () => {
  fs.rmSync(path.join(__dirname, '..', '.wrangler', 'state'), { recursive: true, force: true });
  await new Promise((r) => fixtures.listen(ORIGIN_PORT, '127.0.0.1', r));
  const dev = spawn('npx', ['wrangler', 'dev', '--port', String(DEV_PORT), '--ip', '127.0.0.1', '--var', `GIVEBUTTER_ORIGIN:http://127.0.0.1:${ORIGIN_PORT}`, '--var', 'SEASON:2026'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; dev.stdout.on('data', (d) => (log += d)); dev.stderr.on('data', (d) => (log += d));
  try {
    for (let i = 0; i < 90; i++) { try { if ((await get('/health')).status === 200) break; } catch {} await sleep(1000); }
    step('2026, both campaigns not public');
    let t = JSON.parse((await get('/api/totals.json?nocache=1')).text);
    assert.equal(t.event, 'Ink Bowl 2026'); assert.equal(t.season, '2026');
    assert.equal(t.sides.cal.slug, 'inkbowl-2026-hgksv5'); assert.equal(t.sides.stanford.slug, null);
    for (const k of ['cal', 'stanford']) { const s = t.sides[k]; assert.equal(s.pending, true, `${k} pending`); assert.equal(s.ok, true); assert.equal(s.raised, 0); assert.equal(s.stale, false); }
    assert.equal(t.headline, 'THE RACE IS ON'); assert.equal(t.stale, false);
    const svg = await get('/thermometer.svg?nocache=1'); assert.equal(svg.status, 200); assert.match(svg.text, /^<svg/); assert.match(svg.text, /INK BOWL 2026|aria-label="Ink Bowl 2026/);
    const page = await get('/', { accept: 'text/html', 'sec-fetch-dest': 'document' });
    assert.match(page.text, /Ink Bowl 2026/); assert.match(page.text, /Awaiting campaign data/); assert.match(page.text, /Awaiting campaign link/); assert.doesNotMatch(page.text, /<a class="btn"/); assert.match(page.text, /Give to The Daily Californian<small>/); // both disabled while both pending
    step('the Daily Cal link publishes: its side flips to real numbers on the next read, Stanford stays pending');
    published = true;
    let flipped = null;
    for (let i = 0; i < 25 && !flipped; i++) { // the Worker re-reads after its 2-minute reuse window; force with the cron-equivalent by waiting on nocache + memo expiry
      const j = JSON.parse((await get(`/api/totals.json?nocache=${i}`)).text);
      if (j.sides.cal.pending === false) flipped = j; else await sleep(5000);
    }
    assert.ok(flipped, 'the Daily Cal side never flipped to live numbers');
    assert.equal(flipped.sides.cal.raised, 3133.5); assert.equal(flipped.sides.cal.source, 'json-scoped'); assert.equal(flipped.sides.stanford.pending, true);
    assert.equal(flipped.leader, null, 'nobody leads while Stanford has no data'); assert.equal(flipped.headline, 'THE RACE IS ON');
    const pageAfter = await get('/', { accept: 'text/html', 'sec-fetch-dest': 'document' });
    assert.equal([...pageAfter.text.matchAll(/<a class="btn"/g)].length, 1, 'the Daily Cal button is now a real link'); assert.match(pageAfter.text, /Give to The Stanford Daily<small>Awaiting campaign link/);
    console.log('integration-2026: pending -> live flip verified in workerd');
  } catch (e) {
    console.error('integration-2026 FAILED:', e.message); console.error(log.split('\n').filter((l) => /error|ERROR|failed/i.test(l)).slice(-15).join('\n'));
    process.exitCode = 1;
  } finally { dev.kill('SIGTERM'); fixtures.close(); await sleep(500); try { process.kill(-dev.pid); } catch {} process.exit(process.exitCode || 0); }
})();
