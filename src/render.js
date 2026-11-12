/**
 * SVG renderer for the Ink Bowl board — MOBILE-FIRST.
 *
 * Givebutter caps story images at 600px, and on a phone that same image is
 * drawn at roughly 340px wide (a 0.57x scale). So the canvas is 600 units wide
 * and every type size below is chosen for the PHONE: nothing a donor needs is
 * under 20 units (~11px on a phone), the amounts are 66 units (~38px), and the
 * action line under the trailing side is 25 units bold. Height is free —
 * phones scroll — so the board is portrait.
 *
 * Design intent (see README "Design notes"):
 *  - two thermometers on ONE shared scale keyed to the leader, so the race
 *    fills the frame and the taller tube is always the side that's ahead;
 *  - the gap is stated as an actionable dollar figure under the trailing side;
 *  - a Big Game countdown for urgency and a combined total for unity;
 *  - official UC Berkeley and Stanford palettes.
 *
 * `fonts.css` embeds @font-face data so the SVG renders with the same
 * typefaces in a browser <img>, in Givebutter, and in the PNG rasteriser.
 */

export const W = 600;
export const H = 790;

const PAPER = '#FBFAF6';
const INK = '#161616';
const INK_SOFT = '#5F5D58';
const INK_FAINT = '#8F8C84';
const RULE = '#E4E0D5';
const TRACK = '#ECE8DF';

export const DEFAULT_FONTS = {
  display: "'Oswald', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
  serif: "'Playfair Display', Georgia, 'Times New Roman', serif",
  css: '',
};

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const r2 = (n) => Math.round(n * 100) / 100;

// Vertical rhythm (SVG units). Keep in one place so the PNG and SVG agree.
const Y = {
  title: 72, countdown: 105, rule: 126,
  masthead: 168, amount: 236, pct: 266,
  tubeTop: 294, tubeBottom: 530,
  nudge: 652,
  bandTop: 682, bandH: 60, bandText: 722,
  footer: 770,
};
const TUBE_W = 78;
const BULB_R = 48;
const COL = { cal: 158, stanford: 442 };

function thermometer(side, { cx, fonts, flip }) {
  const tubeH = Y.tubeBottom - Y.tubeTop;
  const x = cx - TUBE_W / 2;
  const rx = TUBE_W / 2;
  const bulbCy = Y.tubeBottom + BULB_R * 0.62;
  const fillH = r2(tubeH * side.frac);
  const fillY = r2(Y.tubeBottom - fillH);
  const id = side.key;
  const dir = flip ? -1 : 1;              // ticks + labels on the OUTER edge
  const tickX = cx + dir * (TUBE_W / 2 + 8);

  const ticks = [0.5, 1].map((f) => {
    const y = r2(Y.tubeBottom - tubeH * f);
    return `<line x1="${tickX}" y1="${y}" x2="${tickX + dir * 12}" y2="${y}" stroke="${INK_FAINT}" stroke-width="2" stroke-linecap="round"/>
      <text x="${tickX + dir * 18}" y="${y + 6}" text-anchor="${flip ? 'end' : 'start'}" font-family="${fonts.display}" font-size="18" font-weight="500" letter-spacing="0.5" fill="${INK_FAINT}">${esc(side.scaleLabels[f])}</text>`;
  }).join('');

  const goal = side.goalFrac != null ? (() => {
    const y = r2(Y.tubeBottom - tubeH * side.goalFrac);
    return `<line x1="${x - 10}" y1="${y}" x2="${x + TUBE_W + 10}" y2="${y}" stroke="${INK}" stroke-width="2" stroke-dasharray="4 4"/>
      <text x="${cx}" y="${y - 7}" text-anchor="middle" font-family="${fonts.display}" font-size="16" font-weight="700" letter-spacing="1.5" fill="${INK}">GOAL</text>`;
  })() : '';

  const cap = side.frac > 0
    ? `<rect x="${x + 4}" y="${fillY}" width="${TUBE_W - 8}" height="7" rx="3.5" fill="${side.accent}" clip-path="url(#tube-${id})"/>`
    : '';

  return `
  <g>
    <defs>
      <clipPath id="tube-${id}"><rect x="${x}" y="${Y.tubeTop}" width="${TUBE_W}" height="${tubeH + BULB_R}" rx="${rx}"/></clipPath>
      <linearGradient id="merc-${id}" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="${side.primary}" stop-opacity="0.82"/>
        <stop offset="0.45" stop-color="${side.primary}"/>
        <stop offset="1" stop-color="${side.primaryDeep}"/>
      </linearGradient>
      <linearGradient id="glass-${id}" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#F4F1EA"/><stop offset="0.5" stop-color="${TRACK}"/><stop offset="1" stop-color="#DDD8CC"/>
      </linearGradient>
      <radialGradient id="bulb-${id}" cx="0.38" cy="0.32" r="0.8">
        <stop offset="0" stop-color="${side.primary}" stop-opacity="0.75"/>
        <stop offset="0.55" stop-color="${side.primary}"/>
        <stop offset="1" stop-color="${side.primaryDeep}"/>
      </radialGradient>
    </defs>
    ${ticks}
    <rect x="${x}" y="${Y.tubeTop}" width="${TUBE_W}" height="${tubeH + BULB_R * 0.6}" rx="${rx}" fill="url(#glass-${id})" stroke="${RULE}" stroke-width="2"/>
    <rect x="${x}" y="${fillY}" width="${TUBE_W}" height="${fillH + BULB_R}" fill="url(#merc-${id})" clip-path="url(#tube-${id})"/>
    ${cap}
    <rect x="${x + 9}" y="${Y.tubeTop + 12}" width="8" height="${tubeH - 24}" rx="4" fill="#FFFFFF" fill-opacity="0.28"/>
    <circle cx="${cx}" cy="${bulbCy}" r="${BULB_R}" fill="url(#bulb-${id})" stroke="${PAPER}" stroke-width="5"/>
    <circle cx="${cx - BULB_R * 0.3}" cy="${bulbCy - BULB_R * 0.32}" r="${BULB_R * 0.22}" fill="#FFFFFF" fill-opacity="0.22"/>
    ${goal}
  </g>`;
}

export function renderSvg(board, fonts = DEFAULT_FONTS) {
  fonts = { ...DEFAULT_FONTS, ...fonts };
  const [cal, stan] = board.sides;
  const leaderColor = board.leader ? board.sides.find((s) => s.key === board.leader).primary : INK;

  const column = (side, cx, flip) => {
    const nudgeColor = side.trailing ? side.primary : INK_SOFT;
    const nudgeWeight = side.trailing ? 700 : 500;
    return `
    <text x="${cx}" y="${Y.masthead}" text-anchor="middle" font-family="${fonts.serif}" font-size="24" font-weight="700" font-style="italic" fill="${INK}">${esc(side.masthead)}</text>
    <text x="${cx}" y="${Y.amount}" text-anchor="middle" font-family="${fonts.display}" font-size="66" font-weight="700" letter-spacing="-1" fill="${side.primary}">${esc(side.raisedText)}</text>
    <text x="${cx}" y="${Y.pct}" text-anchor="middle" font-family="${fonts.display}" font-size="20" font-weight="500" letter-spacing="1.5" fill="${INK_SOFT}">${side.goalText ? `${side.pctOfGoal}% OF ${esc(side.goalText)} GOAL` : 'RAISED SO FAR'}</text>
    ${thermometer(side, { cx, fonts, flip })}
    <text x="${cx}" y="${Y.nudge}" text-anchor="middle" font-family="${fonts.display}" font-size="25" font-weight="${nudgeWeight}" letter-spacing="1" fill="${nudgeColor}">${esc(side.nudge.toUpperCase())}</text>`;
  };

  const updated = `${board.stale ? 'LAST KNOWN  ·  ' : ''}UPDATED ${esc(board.updatedText.toUpperCase())}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(board.event)}: ${esc(board.headline)}. ${esc(cal.short)} ${esc(cal.raisedText)}, ${esc(stan.short)} ${esc(stan.raisedText)}.">
  <style>${fonts.css}</style>
  <defs>
    <linearGradient id="band-cal" x1="0" x2="1"><stop offset="0" stop-color="${cal.primaryDeep}"/><stop offset="1" stop-color="${cal.primary}"/></linearGradient>
    <linearGradient id="band-stan" x1="0" x2="1"><stop offset="0" stop-color="${stan.primary}"/><stop offset="1" stop-color="${stan.primaryDeep}"/></linearGradient>
    <clipPath id="card"><rect x="0" y="0" width="${W}" height="${H}" rx="22"/></clipPath>
  </defs>
  <g clip-path="url(#card)">
    <rect x="0" y="0" width="${W}" height="${H}" fill="${PAPER}"/>
    <rect x="0" y="0" width="${W / 2}" height="12" fill="url(#band-cal)"/>
    <rect x="0" y="12" width="${W / 2}" height="4" fill="${cal.accent}"/>
    <rect x="${W / 2}" y="0" width="${W / 2}" height="12" fill="url(#band-stan)"/>
    <rect x="${W / 2}" y="12" width="${W / 2}" height="4" fill="${stan.accent}"/>

    <text x="${W / 2}" y="${Y.title}" text-anchor="middle" font-family="${fonts.display}" font-size="46" font-weight="700" letter-spacing="5" fill="${INK}">${esc(board.event.toUpperCase())}</text>
    <text x="${W / 2}" y="${Y.countdown}" text-anchor="middle" font-family="${fonts.display}" font-size="20" font-weight="500" letter-spacing="3" fill="${INK_SOFT}">${esc(board.countdown)}  ·  NOV 21</text>
    <line x1="40" y1="${Y.rule}" x2="${W - 40}" y2="${Y.rule}" stroke="${RULE}" stroke-width="1.5"/>

    ${column(cal, COL.cal, true)}
    ${column(stan, COL.stanford, false)}

    <circle cx="${W / 2}" cy="${(Y.tubeTop + Y.tubeBottom) / 2}" r="30" fill="${INK}"/>
    <text x="${W / 2}" y="${(Y.tubeTop + Y.tubeBottom) / 2 + 9}" text-anchor="middle" font-family="${fonts.display}" font-size="25" font-weight="700" letter-spacing="1.5" fill="${PAPER}">VS</text>

    <rect x="0" y="${Y.bandTop}" width="${W}" height="${Y.bandH}" fill="${leaderColor}"/>
    <text x="${W / 2}" y="${Y.bandText}" text-anchor="middle" font-family="${fonts.display}" font-size="30" font-weight="700" letter-spacing="3" fill="#FFFFFF">${esc(board.headline)}</text>

    <text x="24" y="${Y.footer}" font-family="${fonts.display}" font-size="18" font-weight="500" letter-spacing="0.8" fill="${INK_FAINT}">TOGETHER ${esc(board.combinedText)} FOR STUDENT JOURNALISM</text>
    <text x="${W - 24}" y="${Y.footer}" text-anchor="end" font-family="${fonts.display}" font-size="18" font-weight="500" letter-spacing="0.8" fill="${INK_FAINT}">${updated}</text>
  </g>
</svg>`;
}
