// Renders docs/preview*.svg/png for a pair of totals, screenshotting the SVG
// inside an <img> tag (no external resources) exactly as Givebutter and email
// clients display it — at desktop width AND at the ~340px a phone gives a
// Givebutter story image. Usage: node scripts/preview.cjs [cal] [stanford] [outPrefix]
const fs = require('node:fs');
(async () => {
  const [calRaised = 1391, stanRaised = 2805, out = 'docs/preview'] = process.argv.slice(2);
  const { buildBoard } = await import('../src/model.js');
  const { renderSvg, W, H } = await import('../src/render.js');
  const { FONT_CSS } = await import('../src/fonts.js');
  const side = (raised, goal = 10000) => ({ raised: Number(raised), goal, ok: true, stale: false, url: 'x' });
  const b = buildBoard({ event: 'Ink Bowl 2025', gameDate: '2026-11-21', cal: side(calRaised), stanford: side(stanRaised) });
  const svg = renderSvg(b, { css: FONT_CSS });
  fs.writeFileSync(`${out}.svg`, svg);
  const { chromium } = require('playwright');
  const br = await chromium.launch();
  const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  for (const [name, width, dpr] of [['desktop', 600, 2], ['phone', 340, 3]]) {
    const pg = await br.newPage({ viewport: { width: width + 24, height: Math.round((H / W) * width) + 24 }, deviceScaleFactor: dpr });
    await pg.setContent(`<html><body style="margin:0;background:#fff;padding:12px"><img src="${data}" style="width:${width}px;height:auto;display:block"></body></html>`);
    await pg.waitForTimeout(300);
    await pg.screenshot({ path: `${out}-${name}.png` });
    await pg.close();
  }
  await br.close();
  console.log(`${out}.svg (${svg.length} bytes), ${out}-desktop.png, ${out}-phone.png written`);
})().catch((e) => { console.error(e); process.exit(1); });
