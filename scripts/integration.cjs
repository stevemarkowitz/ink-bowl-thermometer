// End-to-end check in the real Workers runtime: starts a tiny HTTP server that
// serves the captured Givebutter pages from test/fixtures, runs `wrangler dev`
// with GIVEBUTTER_ORIGIN pointed at it, and asserts every route.
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const FIX = path.join(__dirname, '..', 'test', 'fixtures');
const ORIGIN_PORT = 9797, DEV_PORT = 8787;

const fixtures = http.createServer((req, res) => {
  const slug = req.url.slice(1).split('?')[0];
  const f = path.join(FIX, `${slug}.html`);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('no fixture'); }
  res.writeHead(200, { 'content-type': 'text/html' }); fs.createReadStream(f).pipe(res);
});

const get = (p, as = 'text', headers = {}) => fetch(`http://127.0.0.1:${DEV_PORT}${p}`, { headers }).then(async (r) => ({ status: r.status, headers: r.headers, body: as === 'json' ? await r.json() : as === 'buf' ? Buffer.from(await r.arrayBuffer()) : await r.text() }));
const step = (m) => console.log('  … ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(path.join(__dirname, '..', '.wrangler', 'state'), { recursive: true, force: true }); // stale local edge cache
  await new Promise((r) => fixtures.listen(ORIGIN_PORT, '127.0.0.1', r));
  const dev = spawn('npx', ['wrangler', 'dev', '--port', String(DEV_PORT), '--ip', '127.0.0.1', '--var', `GIVEBUTTER_ORIGIN:http://127.0.0.1:${ORIGIN_PORT}`, '--var', 'ADMIN_TOKEN:test-token', '--var', 'SERVER_PNG:true'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; dev.stdout.on('data', (d) => (log += d)); dev.stderr.on('data', (d) => (log += d));
  try {
    for (let i = 0; i < 90; i++) { try { if ((await get('/health')).status === 200) break; } catch {} await sleep(1000); }
    step('dev ready; /api/totals.json');
    const t = await get('/api/totals.json', 'json');
    assert.equal(t.body.sides.cal.raised, 1391, 'cal raised');
    assert.equal(t.body.sides.stanford.raised, 2805, 'stanford raised');
    assert.equal(t.body.sides.cal.source, 'json-scoped');
    assert.equal(t.body.leader, 'stanford');
    assert.equal(t.body.headline, 'STANFORD DAILY LEADS BY $1,414');
    step('svg'); const svg = await get('/thermometer.svg?nocache=1');
    assert.equal(svg.status, 200); assert.match(svg.headers.get('content-type'), /svg/); assert.match(svg.body, /\$2,805/);
    assert.equal(svg.headers.get('x-board-source'), 'cal=json-scoped;stanford=json-scoped');
    step('server png'); const t0 = Date.now(); const png = await get('/thermometer.png?nocache=1', 'buf'); const pngMs = Date.now() - t0;
    assert.equal(png.status, 200); assert.equal(png.body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'png signature');
    assert.equal(png.body.readUInt32BE(16), 1200, 'png width');
    step('pages + admin'); const pngPage = await get('/png');
    assert.match(pngPage.body, /Download PNG/);
    const asImg = await get('/', 'text', { accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8', 'sec-fetch-dest': 'image' });
    assert.match(asImg.headers.get('content-type'), /svg/, 'bare domain serves the image to <img> requests'); assert.match(asImg.body, /^<svg/);
    assert.match(asImg.headers.get('vary') || '', /Accept/i);
    const asDoc = await get('/', 'text', { accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'sec-fetch-dest': 'document' });
    assert.match(asDoc.headers.get('content-type'), /html/, 'bare domain serves the page to browsers'); assert.match(asDoc.body, /Give to The Stanford Daily/);
    const page = await get('/');
    assert.match(page.body, /Give to The Daily Californian/); assert.match(page.body, /Give to The Stanford Daily/);
    assert.equal((await get('/admin/pin?side=cal&raised=5')).status, 403, 'admin needs token');
    assert.match((await get('/admin/pin?side=cal&raised=9000&token=test-token')).body, /pinned cal at 9000/);
    const pinned = await get('/api/totals.json?nocache=1', 'json');
    assert.equal(pinned.body.sides.cal.source, 'pin'); assert.equal(pinned.body.leader, 'cal');
    await get('/admin/unpin?side=cal&token=test-token');
    assert.equal((await get('/nope')).status, 404);
    // browser-side PNG export: load /png in Chromium, click Download, check the file
    step('browser png export'); const { chromium } = require('playwright');
    const br = await chromium.launch(); const ctx = await br.newContext({ acceptDownloads: true }); const pg = await ctx.newPage();
    await pg.goto(`http://127.0.0.1:${DEV_PORT}/png`);
    const [download] = await Promise.all([pg.waitForEvent('download', { timeout: 30000 }), pg.click('#dl')]);
    const file = await download.path(); const buf = fs.readFileSync(file);
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'browser png signature');
    assert.equal(buf.readUInt32BE(16), 1200, 'browser png width');
    fs.copyFileSync(file, path.join(__dirname, '..', 'docs', 'preview-browser-export.png'));
    await br.close();
    console.log(`browser PNG export OK: ${download.suggestedFilename()} ${buf.length} bytes`);
    console.log(`integration: all routes OK in workerd (png ${png.body.length} bytes in ${pngMs}ms wall)`);
  } catch (e) {
    console.error('integration FAILED:', e.message); console.error(log.split('\n').filter((l) => /error|ERROR|failed/i.test(l)).slice(-15).join('\n'));
    process.exitCode = 1;
  } finally { dev.kill('SIGTERM'); fixtures.close(); await sleep(500); try { process.kill(-dev.pid); } catch {} process.exit(process.exitCode || 0); }
})();
