import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard } from '../src/model.js';
import { renderSvg, nameplateLayout, W, H } from '../src/render.js';
import { TextLayer } from '../src/text.js';

const side = (raised, goal = 10000) => ({ raised, goal, ok: true, stale: false, url: 'x' });
const board = buildBoard({ event: 'Ink Bowl 2025', gameDate: '2026-11-21', now: new Date('2026-11-12T20:00:00Z'), cal: side(1391), stanford: side(2805) });

// Regression guard for the "text missing on first load" bug: an SVG in an <img> is painted once,
// so any text waiting on a web font stays invisible. The board must carry no font dependency.
test('the board has no <text>, no @font-face and no font-family', () => {
  const svg = renderSvg(board);
  assert.doesNotMatch(svg, /<text[\s>]/);
  assert.doesNotMatch(svg, /@font-face|font-family|<style/);
  assert.match(svg, /<use /);
});

test('the numbers stay available to screen readers and tools via aria-label', () => {
  const svg = renderSvg(board);
  assert.match(svg, /aria-label="[^"]*\$1,391[^"]*\$2,805/);
});

test('every <use> resolves to a defined glyph path', () => {
  const svg = renderSvg(board);
  const defined = new Set([...svg.matchAll(/<path id="([^"]+)"/g)].map((m) => m[1]));
  const used = [...svg.matchAll(/xlink:href="#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(used.length > 100);
  for (const id of used) assert.ok(defined.has(id), `missing glyph ${id}`);
});

test('text layout: anchors, spacing and kerning', () => {
  const L = new TextLayer();
  const w = L.measure('display700', 'INK BOWL', 46, 5);
  assert.ok(w > 150 && w < 400, `width ${w}`);
  assert.ok(L.measure('display700', 'INK BOWL', 46, 10) > w, 'letter-spacing widens');
  assert.ok(L.measure('display500', '$1,391', 66) > 0);
  const mid = L.text('AB', { face: 'display700', size: 40, x: 300, y: 100, anchor: 'middle', fill: '#000' });
  const start = L.text('AB', { face: 'display700', size: 40, x: 300, y: 100, anchor: 'start', fill: '#000' });
  assert.notEqual(mid, start);
});

test('characters outside the charset do not break rendering', () => {
  const L = new TextLayer();
  assert.doesNotThrow(() => L.text('Ink Bowl ✓ 2026', { face: 'display700', size: 40, x: 0, y: 0, fill: '#000' }));
});

test('the image stays a reasonable size', () => {
  const svg = renderSvg(board);
  assert.ok(svg.length < 80_000, `svg is ${svg.length} bytes`);
  assert.equal(W, 600);
});

test('both papers\' logos are drawn, as vectors, on team-colour tiles', () => {
  const svg = renderSvg(board);
  assert.match(svg, /<path id="logo-cal"/);
  assert.match(svg, /<path id="logo-stanford"/);
  assert.equal([...svg.matchAll(/xlink:href="#logo-(cal|stanford)"/g)].length, 2);
  assert.doesNotMatch(svg, /<image|data:image|\.(jpg|png)/i);   // no raster, nothing to load
});

test('each paper\'s own nameplate is drawn as vectors (no fonts)', () => {
  const svg = renderSvg(board);
  assert.match(svg, /<path id="wm-cal"/);
  assert.match(svg, /<path id="wm-stanford"/);
  assert.equal([...svg.matchAll(/xlink:href="#wm-(cal|stanford)"/g)].length, 2);
  assert.doesNotMatch(svg, /<text[\s>]|font-family|@font-face/);
});

test('the Daily Cal logo tile uses the paper\'s own blue; the thermometer stays Berkeley Blue', () => {
  const svg = renderSvg(board);
  assert.match(svg, /fill="#4B9BD0"/);             // the tile
  assert.match(svg, /stop-color="#003262"/);       // the mercury
});

test('both nameplates have the same cap height and share a baseline, so neither paper looks favoured', () => {
  const nl = nameplateLayout();
  assert.ok(Math.abs(nl.cal.capH - nl.stanford.capH) < 1e-9, 'same cap height');
  assert.equal(nl.cal.baseline, nl.stanford.baseline, 'same baseline');
  assert.ok(nl.cal.capH > 12, `cap height ${nl.cal.capH} stays legible at phone size`);
  for (const k of ['cal', 'stanford']) assert.ok(nl[k].width <= 264 + 1e-9, `${k} fits its column`);
});
