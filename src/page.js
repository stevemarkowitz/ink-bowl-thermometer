import { esc, W, H } from './render.js';

const CSS = `
  :root{color-scheme:light}
  body{margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;color:#161616}
  main{max-width:600px;margin:0 auto;padding:16px}
  img.board{display:block;width:100%;height:auto;border-radius:22px;box-shadow:0 1px 2px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.08)}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
  .btn{display:block;text-align:center;padding:15px 10px;border-radius:12px;color:#fff;font-weight:700;text-decoration:none;font-size:16px;letter-spacing:.2px;border:0;cursor:pointer}
  .btn:hover{filter:brightness(1.08)}
  .btn.dark{background:#161616}
  p.note{text-align:center;color:#8a877f;font-size:12px;margin:14px 0 0}
  p.note a{color:#8a877f}
  @media (max-width:420px){.row{grid-template-columns:1fr}}`;

const head = (title, description, { origin, ogImage }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
${ogImage ? `<meta property="og:image" content="${esc(origin)}/thermometer.png"><meta property="og:image:width" content="${W * 2}"><meta property="og:image:height" content="${H * 2}"><meta name="twitter:card" content="summary_large_image">` : ''}
<style>${CSS}</style></head>`;

/** Shared rivalry page: the board plus a donate button for each paper. Also what an iframe embed shows. */
export function embedPage(board, { origin, serverPng = false }) {
  const [cal, stan] = board.sides;
  const btn = (s) => `<a class="btn" style="background:${s.primary}" href="${esc(s.url)}" target="_top" rel="noopener">Give to ${esc(s.masthead)}</a>`;
  return `${head(`${board.event} — ${board.headline}`, `${cal.masthead} vs. ${stan.masthead}: a live fundraising race for student journalism ahead of Big Game. ${cal.short} ${cal.raisedText} · ${stan.short} ${stan.raisedText}.`, { origin, ogImage: serverPng })}
<body><main>
  <img class="board" src="/thermometer.svg?v=${Date.now()}" width="${W}" height="${H}" alt="${esc(board.event)}: ${esc(board.headline)}. ${esc(cal.short)} ${esc(cal.raisedText)}, ${esc(stan.short)} ${esc(stan.raisedText)}.">
  <div class="row">${btn(cal)}${btn(stan)}</div>
  <p class="note">Totals refresh automatically. Reload to see the latest. <a href="/png">PNG for email</a></p>
</main></body></html>`;
}

/**
 * Staff page: renders the current board to a PNG IN THE BROWSER (canvas), so
 * it costs the Worker no CPU and works on any Cloudflare plan. Meant for the
 * occasional email blast; linked discreetly from the main page.
 */
export function pngPage(board, { origin, serverPng = false }) {
  const [cal, stan] = board.sides;
  const stamp = new Date().toISOString().slice(0, 10);
  return `${head(`${board.event} — PNG for email`, 'Download the current thermometer as a PNG for email.', { origin, ogImage: serverPng })}
<body><main>
  <img class="board" id="board" src="/thermometer.svg?nocache=1&v=${Date.now()}" width="${W}" height="${H}" alt="${esc(board.event)}: ${esc(board.headline)}.">
  <div class="row" style="grid-template-columns:1fr">
    <button class="btn dark" id="dl" type="button">Download PNG (${W * 2}×${H * 2}, for email)</button>
  </div>
  <p class="note" id="status">Snapshot of the totals as of ${esc(board.updatedText)}. ${esc(cal.short)} ${esc(cal.raisedText)} · ${esc(stan.short)} ${esc(stan.raisedText)}.${serverPng ? ` A live-updating PNG URL is also available at <a href="/thermometer.png">/thermometer.png</a>.` : ''}</p>
  <p class="note"><a href="/">Back to the board</a></p>
<script>
(function () {
  var btn = document.getElementById('dl'), status = document.getElementById('status'), SCALE = 2, W = ${W}, H = ${H};
  btn.addEventListener('click', function () {
    btn.disabled = true; btn.textContent = 'Rendering…';
    fetch('/thermometer.svg?nocache=1&t=' + Date.now()).then(function (r) { return r.text(); }).then(function (svg) {
      var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = W * SCALE; c.height = H * SCALE;
        var ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) {
          var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
          a.download = 'ink-bowl-${stamp}.png'; document.body.appendChild(a); a.click(); a.remove();
          btn.disabled = false; btn.textContent = 'Download PNG (' + (W * SCALE) + '×' + (H * SCALE) + ', for email)';
          status.textContent = 'Saved ' + a.download + ' (' + Math.round(blob.size / 1024) + ' KB).';
        }, 'image/png');
      };
      img.onerror = function () { btn.disabled = false; btn.textContent = 'Could not render — try another browser'; };
      img.src = url;
    });
  });
})();
</script>
</main></body></html>`;
}
