import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard } from '../src/model.js';
import { renderSvg, nameplateLayout, markLayout, W, H } from '../src/render.js';
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

test('FAIRNESS: the two nameplates are sized to equal visual size and share a baseline', () => {
  const n = nameplateLayout();
  const ratio = (f) => n.stanford[f] / n.cal[f];
  assert.ok(Math.abs(ratio('footprint') - 1) < 1e-6, 'equal footprint (the chosen rule)');
  assert.equal(n.cal.baseline, n.stanford.baseline, 'same baseline');
  // The measures cannot all be equal (the shapes differ), but none may drift far: guard against either paper looking favoured.
  assert.ok(ratio('capH') > 0.9 && ratio('capH') < 1.2, `cap height ratio ${ratio('capH')}`);
  assert.ok(ratio('ink') > 0.8 && ratio('ink') < 1.4, `ink ratio ${ratio('ink')}`);
  assert.ok(ratio('width') > 0.65 && ratio('width') < 1.5, `width ratio ${ratio('width')}`);
  assert.ok(n.cal.capH > 12 && n.stanford.capH > 12, 'legible at phone size');
  for (const k of ['cal', 'stanford']) assert.ok(n[k].width <= 264 + 1e-9, `${k} fits its column`);
});

test('FAIRNESS: the two logo marks carry equal ink inside equal-size tiles', () => {
  const m = markLayout();
  assert.ok(Math.abs(m.stanford.ink / m.cal.ink - 1) < 0.01, `mark ink ratio ${m.stanford.ink / m.cal.ink}`);
  for (const k of ['cal', 'stanford']) assert.ok(m[k].width <= 76 * 0.88 + 1e-9 && m[k].height <= 76 * 0.8 + 1e-9, `${k} mark fits its tile`);
});

test('FAIRNESS: decorative accents are identical for both sides (no vivid gold vs muted sandstone)', () => {
  const svg = renderSvg(board);
  assert.doesNotMatch(svg, /#FDB515|#D2C295/i);
  const other = renderSvg(buildBoard({ event: 'X', gameDate: '2026-11-21', now: new Date('2026-11-12T20:00:00Z'), cal: side(3000), stanford: side(1000) }));
  assert.doesNotMatch(other, /#FDB515|#D2C295/i);
});
