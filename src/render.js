/**
 * SVG renderer for the Ink Bowl board — MOBILE-FIRST.
 *
 * Givebutter caps story images at 600px, and on a phone that same image is
 * drawn at roughly 340px wide (a 0.57x scale). So the canvas is 600 units wide
 * and every type size below is chosen for the PHONE: nothing a donor needs is
 * under 18 units (~10px on a phone), the amounts are 66 units (~38px), and the
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
 * All text is drawn as outlined shapes (src/text.js), never as <text> with a web
 * font: an SVG in an <img> is painted once, so text waiting on an embedded font
 * stayed invisible on first load. Outlines look identical everywhere, immediately.
 */
import { TextLayer } from './text.js';
import { LOGOS } from './logos.js';
import { WORDMARKS } from './wordmarks.js';

export const W = 600;
export const H = 900;

const PAPER = '#FBFAF6';
const INK = '#161616';
const INK_SOFT = '#5F5D58';
const INK_FAINT = '#8F8C84';
const RULE = '#E4E0D5';
const TRACK = '#ECE8DF';

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const r2 = (n) => Math.round(n * 100) / 100;

// Vertical rhythm (SVG units). Keep in one place so the PNG and SVG agree.
const Y = {
  title: 72, countdown: 105, rule: 126,
  tileTop: 146,                     // logo lockup: tile, then the paper's nameplate beneath
  wmTop: 236,                       // nameplate box top (box height WM_BOX)
  amount: 348, pct: 378,
  tubeTop: 404, tubeBottom: 640,
  nudge: 762,
  bandTop: 792, bandH: 60, bandText: 832,
  footer: 880,
};
const TILE = 76;                    // logo tile size
const WM_BOX = 40;                  // vertical room for the nameplate
const WM_MAX_W = 246;               // widest a nameplate may be: leaves a clear gutter between the two columns
const WM_TARGET_H = { cal: 22, stanford: 36 }; // each nameplate's natural weight; the wide thin Cal line is capped by width                // tile -> name
const TUBE_W = 78;
const BULB_R = 48;
const COL = { cal: 158, stanford: 442 };

/** Logo tile (white mark on the team colour) with the paper's own nameplate beneath, centred on the column. */
function lockup(side, { cx }) {
  const L = LOGOS[side.key];
  const sc = Math.min((TILE * 0.84) / L.w, (TILE * 0.78) / L.h);
  const left = cx - TILE / 2;
  const mx = left + (TILE - L.w * sc) / 2;
  const my = Y.tileTop + (TILE - L.h * sc) / 2;

  const W_ = WORDMARKS[side.key];
  const ws = Math.min(WM_MAX_W / W_.w, WM_TARGET_H[side.key] / W_.h);
  const wx = cx - (W_.w * ws) / 2 - W_.x * ws;
  const wy = Y.wmTop + (WM_BOX - W_.h * ws) / 2 - W_.y * ws;
  return `
    <rect x="${r2(left)}" y="${Y.tileTop}" width="${TILE}" height="${TILE}" rx="17" fill="${side.primary}"/>
    <rect x="${r2(left + 1.5)}" y="${Y.tileTop + 1.5}" width="${TILE - 3}" height="${TILE - 3}" rx="15.5" fill="none" stroke="${side.accent}" stroke-width="3"/>
    <use xlink:href="#logo-${side.key}" transform="translate(${r2(mx)} ${r2(my)}) scale(${Math.round(sc * 10000) / 10000})" fill="#FFFFFF"/>
    <use xlink:href="#wm-${side.key}" transform="translate(${r2(wx)} ${r2(wy)}) scale(${Math.round(ws * 10000) / 10000})" fill="${side.primary}"/>`;
}

function thermometer(side, { cx, flip, T }) {
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
      ${T(side.scaleLabels[f], { face: 'display500', size: 18, x: tickX + dir * 18, y: y + 6, anchor: flip ? 'end' : 'start', spacing: 0.5, fill: INK_FAINT })}`;
  }).join('');

  const goal = side.goalFrac != null ? (() => {
    const y = r2(Y.tubeBottom - tubeH * side.goalFrac);
    return `<line x1="${x - 10}" y1="${y}" x2="${x + TUBE_W + 10}" y2="${y}" stroke="${INK}" stroke-width="2" stroke-dasharray="4 4"/>
      ${T('GOAL', { face: 'display700', size: 16, x: cx, y: y - 7, anchor: 'middle', spacing: 1.5, fill: INK })}`;
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

export function renderSvg(board) {
  const layer = new TextLayer();
  const T = (str, o) => layer.text(str, o);
  const [cal, stan] = board.sides;
  const leaderColor = board.leader ? board.sides.find((s) => s.key === board.leader).primary : INK;

  const column = (side, cx, flip) => {
    const nudgeColor = side.trailing ? side.primary : INK_SOFT;
    const nudgeFace = side.trailing ? 'display700' : 'display500';
    return `
    ${lockup(side, { cx })}
    ${T(side.raisedText, { face: 'display700', size: 66, x: cx, y: Y.amount, anchor: 'middle', spacing: -1, fill: side.primary })}
    ${T(side.goalText ? `${side.pctOfGoal}% OF ${side.goalText} GOAL` : 'RAISED SO FAR', { face: 'display500', size: 20, x: cx, y: Y.pct, anchor: 'middle', spacing: 1.5, fill: INK_SOFT })}
    ${thermometer(side, { cx, flip, T })}
    ${T(side.nudge.toUpperCase(), { face: nudgeFace, size: 25, x: cx, y: Y.nudge, anchor: 'middle', spacing: 1, fill: nudgeColor })}`;
  };

  const updated = `${board.stale ? 'LAST KNOWN · ' : ''}UPDATED ${board.updatedText.toUpperCase()}`;
  const midY = (Y.tubeTop + Y.tubeBottom) / 2;

  const body = `
    <rect x="0" y="0" width="${W}" height="${H}" fill="${PAPER}"/>
    <rect x="0" y="0" width="${W / 2}" height="12" fill="url(#band-cal)"/>
    <rect x="0" y="12" width="${W / 2}" height="4" fill="${cal.accent}"/>
    <rect x="${W / 2}" y="0" width="${W / 2}" height="12" fill="url(#band-stan)"/>
    <rect x="${W / 2}" y="12" width="${W / 2}" height="4" fill="${stan.accent}"/>

    ${T(board.event.toUpperCase(), { face: 'display700', size: 46, x: W / 2, y: Y.title, anchor: 'middle', spacing: 5, fill: INK })}
    ${T(`${board.countdown} · NOV 21`, { face: 'display500', size: 20, x: W / 2, y: Y.countdown, anchor: 'middle', spacing: 3, fill: INK_SOFT })}
    <line x1="40" y1="${Y.rule}" x2="${W - 40}" y2="${Y.rule}" stroke="${RULE}" stroke-width="1.5"/>

    ${column(cal, COL.cal, true)}
    ${column(stan, COL.stanford, false)}

    <circle cx="${W / 2}" cy="${midY}" r="30" fill="${INK}"/>
    ${T('VS', { face: 'display700', size: 25, x: W / 2, y: midY + 9, anchor: 'middle', spacing: 1.5, fill: PAPER })}

    <rect x="0" y="${Y.bandTop}" width="${W}" height="${Y.bandH}" fill="${leaderColor}"/>
    ${T(board.headline, { face: 'display700', size: 30, x: W / 2, y: Y.bandText, anchor: 'middle', spacing: 3, fill: '#FFFFFF' })}

    ${T(`TOGETHER ${board.combinedText} FOR STUDENT JOURNALISM`, { face: 'display500', size: 18, x: 24, y: Y.footer, spacing: 0.8, fill: INK_FAINT })}
    ${T(updated, { face: 'display500', size: 18, x: W - 24, y: Y.footer, anchor: 'end', spacing: 0.8, fill: INK_FAINT })}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(board.event)}: ${esc(board.headline)}. ${esc(cal.short)} ${esc(cal.raisedText)}, ${esc(stan.short)} ${esc(stan.raisedText)}.">
  <defs>
    <linearGradient id="band-cal" x1="0" x2="1"><stop offset="0" stop-color="${cal.primaryDeep}"/><stop offset="1" stop-color="${cal.primary}"/></linearGradient>
    <linearGradient id="band-stan" x1="0" x2="1"><stop offset="0" stop-color="${stan.primary}"/><stop offset="1" stop-color="${stan.primaryDeep}"/></linearGradient>
    <clipPath id="card"><rect x="0" y="0" width="${W}" height="${H}" rx="22"/></clipPath>
    ${Object.entries(LOGOS).map(([k, l]) => `<path id="logo-${k}" d="${l.d}" fill-rule="evenodd"/>`).join('')}
    ${Object.entries(WORDMARKS).map(([k, w]) => `<path id="wm-${k}" d="${w.d}" fill-rule="${w.rule}"/>`).join('')}
    ${layer.defs()}
  </defs>
  <g clip-path="url(#card)">${body}
  </g>
</svg>`;
}
