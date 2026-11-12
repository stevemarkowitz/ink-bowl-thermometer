/**
 * Text as shapes. Lays a string out from outline data (see scripts/build-glyphs.py) and emits
 * <use> references to shared glyph <path>s, so the SVG contains no <text> and no web font:
 * it paints correctly on first load everywhere (an SVG in an <img> is painted once and never
 * repaints when an embedded font finishes decoding — the bug this replaces).
 */
import { GLYPH_SETS } from './glyphs.js';

/** Face names used by render.js -> keys in GLYPH_SETS. */
export const FACE = { display500: 'd500', display700: 'd700', serifItalic700: 's700i' };

const r2 = (n) => Math.round(n * 100) / 100;

export class TextLayer {
  constructor() { this.used = new Map(); } // glyph id -> path data

  /** Width in px of `str`, with kerning and letter-spacing (no trailing spacing). */
  measure(face, str, size, spacing = 0) {
    return this.#layout(face, str, size, spacing).width;
  }

  #layout(face, str, size, spacing) {
    const set = GLYPH_SETS[FACE[face]];
    if (!set) throw new Error(`unknown face ${face}`);
    const s = size / set.upm;
    const sp = spacing / s;
    const chars = [...String(str)];
    const items = [];
    let cursor = 0;
    chars.forEach((raw, i) => {
      const ch = set.glyphs[raw] ? raw : (set.glyphs['?'] ? '?' : null);
      if (ch === null) return;
      const [adv, d] = set.glyphs[ch];
      items.push({ ch, x: cursor, d });
      const next = chars[i + 1];
      cursor += adv + (next ? (set.kern[ch + next] || 0) : 0) + (i < chars.length - 1 ? sp : 0);
    });
    return { set, s, items, width: cursor * s };
  }

  /**
   * @param {string} str
   * @param {{face:string,size:number,x:number,y:number,anchor?:'start'|'middle'|'end',spacing?:number,fill:string}} o
   *   (x, y) is the baseline anchor point, like SVG <text>.
   */
  text(str, { face, size, x, y, anchor = 'start', spacing = 0, fill }) {
    const { set, s, items, width } = this.#layout(face, str, size, spacing);
    const x0 = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    const uses = [];
    for (const it of items) {
      if (!it.d) continue; // space
      const id = `${FACE[face]}-${it.ch.codePointAt(0)}`;
      this.used.set(id, it.d);
      uses.push(`<use xlink:href="#${id}" x="${r2(it.x)}"/>`);
    }
    return `<g transform="translate(${r2(x0)} ${r2(y)}) scale(${r2(s * 1000) / 1000} ${-r2(s * 1000) / 1000})" fill="${fill}">${uses.join('')}</g>`;
  }

  /** <defs> body: each glyph used anywhere in the image, defined once. */
  defs() {
    return [...this.used].map(([id, d]) => `<path id="${id}" d="${d}"/>`).join('');
  }
}
