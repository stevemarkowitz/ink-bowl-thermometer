/**
 * Ink Bowl thermometer — Cloudflare Worker.
 *
 *   GET /                    the whole site lives at the bare domain: browsers get the rivalry page
 *                            (board + a donate button per paper); image requests (<img>, Givebutter) get the board
 *   GET /thermometer.svg     the board explicitly, 600px wide — fallback for tools that need a file path
 *   GET /png                 staff page: renders the board to a PNG in the browser (no Worker CPU)
 *   GET /thermometer.png     the same board rasterised server-side at 2x — OFF unless SERVER_PNG=true,
 *                            because the raster needs ~300ms CPU (fine on Workers Paid, over Free's 10ms)
 *   GET /api/totals.json     numbers + which source produced each one (debugging)
 *   GET /health              ok
 *   GET /admin/pin?side=cal&raised=1234[&goal=10000][&hours=24]&token=…   freeze a side
 *   GET /admin/unpin?side=cal&token=…                                     release it
 *
 * Data: each side independently tries API (if that side has a key) → public page
 * → last good value. See src/sources.js.
 */
import { buildBoard } from './model.js';
import { renderSvg } from './render.js';
import { FONT_CSS } from './fonts.js';
import { readSide, sideConfig, SIDE_KEYS } from './sources.js';
import { makeStore } from './store.js';
import { ensureResvg, svgToPng } from './png.js';
import { embedPage, pngPage } from './page.js';
import { canonicalRedirect } from './host.js';
import resvgWasm from '../node_modules/@resvg/resvg-wasm/index_bg.wasm';

const FRESH_MS = 120_000;      // reuse a side's last read for 2 min before re-fetching
const EDGE_TTL = 60;           // seconds a rendered image stays in the edge cache

const DEFAULTS = {
  EVENT_LABEL: 'Ink Bowl 2025',
  GAME_DATE: '2026-11-21',
  CAL_SLUG: 'HbHXTN',          // Daily Cal "Ink Bowl 2025"
  STANFORD_SLUG: 'msB1YJ',     // Stanford Daily "Big Game 2025"
};

function cfg(env) {
  const e = { ...DEFAULTS, ...env };
  return e;
}

const memo = new Map(); // per-isolate: side key -> { at, slug, value }

async function collect(env, { force = false } = {}) {
  const store = makeStore(env);
  const now = new Date();
  const sides = {};
  await Promise.all(SIDE_KEYS.map(async (key) => {
    const c = sideConfig(env, key);
    const m = memo.get(key);
    if (!force && m && m.slug === c.slug && now.getTime() - m.at < FRESH_MS && !(await store.getPin(key))) {
      sides[key] = m.value; return;
    }
    const value = await readSide(c, { store, now, log: (msg) => console.log(msg) });
    if (value.ok) memo.set(key, { at: now.getTime(), slug: c.slug, value });
    sides[key] = value;
  }));
  return { store, now, sides };
}

function boardFrom(env, { now, sides }) {
  return buildBoard({ event: env.EVENT_LABEL, gameDate: env.GAME_DATE, now, cal: sides.cal, stanford: sides.stanford });
}

function sourceHeader(sides) {
  return SIDE_KEYS.map((k) => `${k}=${sides[k].source}`).join(';');
}

function imageHeaders(type, sides) {
  return {
    'content-type': type,
    'cache-control': `public, max-age=${EDGE_TTL}, s-maxage=${EDGE_TTL}, stale-while-revalidate=300`,
    'access-control-allow-origin': '*',
    'x-board-source': sourceHeader(sides),
  };
}

/**
 * The bare address (https://inkbowl.giving) is both the page and the image:
 * a browser navigating to it gets the page, while an <img> / image fetch gets the
 * thermometer. Browsers say so with Sec-Fetch-Dest and an image/* Accept header.
 * /thermometer.svg stays as an explicit fallback for tools that need a file path.
 */
function wantsImage(request) {
  const dest = request.headers.get('sec-fetch-dest');
  if (dest === 'image') return true;
  if (dest === 'document' || dest === 'iframe' || dest === 'frame') return false;
  const accept = request.headers.get('accept') || '';
  return /image\//i.test(accept) && !/text\/html/i.test(accept);
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a)); const y = enc.encode(String(b));
  if (x.length !== y.length) return false;
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export default {
  async fetch(request, rawEnv, ctx) {
    const env = cfg(rawEnv);
    const url = new URL(request.url);
    const canonical = canonicalRedirect(url);
    if (canonical) return Response.redirect(canonical, 301);
    let path = url.pathname.replace(/\/+$/, '') || '/';
    const viaRoot = path === '/';
    if (viaRoot && wantsImage(request)) path = '/thermometer.svg';

    if (path === '/health') return new Response('ok', { headers: { 'content-type': 'text/plain' } });

    if (path.startsWith('/admin/')) return admin(path, url, env);

    // Edge cache for the two images: many story-page loads, one render.
    const cacheable = path === '/thermometer.svg' || path === '/thermometer.png';
    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}${path}`, { method: 'GET' });
    if (cacheable && !url.searchParams.has('nocache')) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        if (!viaRoot) return hit;
        const r = new Response(hit.body, hit); // cached copy may predate the root alias: always mark the variance
        r.headers.set('vary', 'Accept, Sec-Fetch-Dest');
        return r;
      }
    }

    const data = await collect(env);
    const board = boardFrom(env, data);

    let res;
    if (path === '/thermometer.svg') {
      res = new Response(renderSvg(board, { css: FONT_CSS }), { headers: imageHeaders('image/svg+xml; charset=utf-8', data.sides) });
      if (viaRoot) res.headers.set('vary', 'Accept, Sec-Fetch-Dest');
    } else if (path === '/thermometer.png') {
      if (String(env.SERVER_PNG) !== 'true') {
        return new Response('Server-side PNG is off. Use /png (renders in the browser), or set SERVER_PNG=true on a Workers Paid plan.\n', { status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
      }
      await ensureResvg(resvgWasm);
      const png = svgToPng(renderSvg(board, { css: FONT_CSS }), { scale: 2 });
      res = new Response(png, { headers: imageHeaders('image/png', data.sides) });
    } else if (path === '/api/totals.json') {
      const body = {
        event: board.event, headline: board.headline, leader: board.leader, gap: board.gap,
        combined: board.combined, countdown: board.countdown, updated: data.now.toISOString(),
        store: data.store.backend, stale: board.stale,
        sides: Object.fromEntries(SIDE_KEYS.map((k) => {
          const s = data.sides[k];
          return [k, { slug: s.slug, url: s.url, title: s.title, raised: s.raised, goal: s.goal, source: s.source,
            apiEnabled: s.apiEnabled, rawRaised: s.rawRaised ?? null, ok: s.ok, stale: s.stale,
            readAt: s.readAt ? new Date(s.readAt).toISOString() : null, error: s.error }];
        })),
      };
      res = new Response(JSON.stringify(body, null, 2), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });
    } else if (path === '/' || path === '/embed') {
      res = new Response(embedPage(board, { origin: url.origin, serverPng: String(env.SERVER_PNG) === 'true' }), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=30', vary: 'Accept, Sec-Fetch-Dest' } });
    } else if (path === '/png') {
      res = new Response(pngPage(board, { origin: url.origin, serverPng: String(env.SERVER_PNG) === 'true' }), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    } else {
      return new Response('Not found', { status: 404 });
    }

    if (cacheable) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },

  /** Cron: keep "last good" warm so a Givebutter hiccup never blanks the board. */
  async scheduled(_event, rawEnv, ctx) {
    ctx.waitUntil(collect(cfg(rawEnv), { force: true }));
  },
};

async function admin(path, url, env) {
  const deny = (msg, status = 403) => new Response(msg, { status, headers: { 'content-type': 'text/plain' } });
  if (!env.ADMIN_TOKEN) return deny('admin disabled: set ADMIN_TOKEN secret', 404);
  if (!timingSafeEqual(url.searchParams.get('token') || '', env.ADMIN_TOKEN)) return deny('forbidden');
  const side = url.searchParams.get('side');
  if (!SIDE_KEYS.includes(side)) return deny(`side must be one of ${SIDE_KEYS.join(', ')}`, 400);
  const store = makeStore(env);

  if (path === '/admin/unpin') {
    await store.clearPin(side);
    return new Response(`unpinned ${side}\n`, { headers: { 'content-type': 'text/plain' } });
  }
  if (path === '/admin/pin') {
    const raised = Number(url.searchParams.get('raised'));
    if (!Number.isFinite(raised) || raised < 0) return deny('raised must be a non-negative number', 400);
    const goalRaw = url.searchParams.get('goal');
    const goal = goalRaw ? Number(goalRaw) : (await store.getLastGood(side))?.goal ?? null;
    const hours = Number(url.searchParams.get('hours') || 0);
    await store.setPin(side, { raised, goal }, { ttlSeconds: hours > 0 ? Math.round(hours * 3600) : null });
    return new Response(`pinned ${side} at ${raised}${goal ? ` (goal ${goal})` : ''}${hours ? ` for ${hours}h` : ' until unpinned'}\n`, { headers: { 'content-type': 'text/plain' } });
  }
  return deny('unknown admin route', 404);
}
