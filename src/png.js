/**
 * PNG rasteriser: the same SVG, rendered by resvg (WASM) with the same
 * bundled fonts, so /thermometer.png is pixel-for-pixel the SVG. Needed
 * because most email clients will not render SVG.
 */
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { fontBuffers } from './fonts.js';

let ready = null;
export function ensureResvg(wasmModuleOrBytes) {
  if (!ready) ready = initWasm(wasmModuleOrBytes).catch((e) => { ready = null; throw e; });
  return ready;
}

/** @param {string} svg  @param {{scale?:number}} opts  scale 2 = retina-ready 1200px wide */
export function svgToPng(svg, { scale = 2 } = {}) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: scale },
    font: { fontBuffers: fontBuffers(), loadSystemFonts: false, defaultFontFamily: 'Oswald' },
    background: '#ffffff',
  });
  const out = r.render().asPng();
  r.free?.();
  return out;
}
