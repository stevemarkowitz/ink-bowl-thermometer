/**
 * Board model: turns two raw totals into everything the renderers need.
 * Pure functions, no I/O, so the SVG and PNG renderers stay in lockstep and
 * the maths is unit-testable without a Worker.
 */

export const TEAMS = {
  cal: {
    key: 'cal',
    short: 'DAILY CAL',
    masthead: 'The Daily Californian',
    school: 'CAL',
    // Official UC Berkeley brand: Berkeley Blue + California Gold.
    primary: '#003262',
    accent: '#FDB515',
    primaryDeep: '#041E42',
    // The paper's own blue (sampled from its avatar) for the logo tile. The thermometer, amount and
    // nameplate stay Berkeley Blue: light-blue lettering was too faint on cream at phone size.
    tileFill: '#4B9BD0',
  },
  stanford: {
    key: 'stanford',
    short: 'STANFORD DAILY',
    masthead: 'The Stanford Daily',
    school: 'STANFORD',
    // Official Stanford brand: Cardinal Red + Cool Grey.
    primary: '#8C1515',
    accent: '#D2C295',      // Stanford Sandstone, used for the mercury cap
    primaryDeep: '#5E0F0F',
    secondary: '#4D4F53',   // Stanford Cool Grey
  },
};

export function formatMoney(n, { cents = false } = {}) {
  if (n == null || !Number.isFinite(n)) return '—';
  const opts = cents
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 };
  return '$' + Math.round(cents ? n : Math.round(n)).toLocaleString('en-US', opts);
}

/** Round a scale ceiling to a "nice" number so goal ticks land on round values. */
export function niceCeiling(v) {
  if (v <= 0) return 1000;
  const mag = 10 ** Math.floor(Math.log10(v));
  const steps = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];
  for (const s of steps) if (s * mag >= v) return s * mag;
  return 10 * mag;
}

export function daysUntil(dateISO, now = new Date(), tz = 'America/Los_Angeles') {
  // Compare calendar days in Pacific time, not raw ms, so "0 days" means game day.
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const toUtcDay = (d) => {
    const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day);
  };
  return Math.round((toUtcDay(new Date(dateISO + 'T12:00:00Z')) - toUtcDay(now)) / 86400000);
}

export function formatUpdated(date, tz = 'America/Los_Angeles') {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date);
}

/**
 * @param {object} p
 * @param {string} p.event        e.g. "INK BOWL 2026"
 * @param {string} p.gameDate     ISO date, e.g. "2026-11-21"
 * @param {Date}   [p.now]
 * @param {{raised:number, goal:number|null, ok:boolean, stale:boolean, url:string}} p.cal
 * @param {{raised:number, goal:number|null, ok:boolean, stale:boolean, url:string}} p.stanford
 */
export function buildBoard({ event, gameDate, now = new Date(), cal, stanford }) {
  const sides = [
    { ...TEAMS.cal, ...cal },
    { ...TEAMS.stanford, ...stanford },
  ];
  for (const s of sides) {
    s.raised = Number.isFinite(s.raised) ? Math.max(0, s.raised) : 0;
    s.goal = Number.isFinite(s.goal) && s.goal > 0 ? s.goal : null;
  }

  const [a, b] = sides;
  const top = Math.max(a.raised, b.raised);
  // Scale to the leader with headroom, so the race always fills the frame.
  // Falls back to a goal (or $1k) before any money arrives.
  const scaleMax = niceCeiling(top > 0 ? top * 1.12 : (a.goal ?? b.goal ?? 1000) * 0.25);

  const MIN_VISIBLE = 0.035; // a $5 gift should still be visible as mercury
  for (const s of sides) {
    const frac = scaleMax > 0 ? s.raised / scaleMax : 0;
    s.frac = s.raised > 0 ? Math.max(MIN_VISIBLE, Math.min(1, frac)) : 0;
    s.pctOfGoal = s.goal ? Math.min(999, Math.round((s.raised / s.goal) * 100)) : null;
    s.goalFrac = s.goal && s.goal <= scaleMax ? s.goal / scaleMax : null;
    s.raisedText = formatMoney(s.raised);
    s.goalText = s.goal ? formatMoney(s.goal) : null;
    s.scaleLabels = { 0.5: formatMoney(scaleMax / 2), 1: formatMoney(scaleMax) };
  }

  const diff = a.raised - b.raised;
  const leader = diff === 0 ? null : diff > 0 ? a : b;
  const trailer = leader ? (leader === a ? b : a) : null;
  const gap = Math.abs(diff);

  for (const s of sides) {
    s.leading = leader === s;
    s.trailing = trailer === s;
    // The single most motivating number on the board.
    s.nudge = s.trailing
      ? `${formatMoney(gap + 1)} takes the lead`
      : s.leading
        ? `Ahead by ${formatMoney(gap)}`
        : 'Dead even';
  }

  const days = daysUntil(gameDate, now);
  const countdown = days > 1 ? `${days} DAYS TO BIG GAME`
    : days === 1 ? 'BIG GAME TOMORROW'
      : days === 0 ? 'BIG GAME TODAY'
        : 'FINAL';

  const combined = a.raised + b.raised;
  const headline = leader
    ? `${leader.short} LEADS BY ${formatMoney(gap)}`
    : combined > 0 ? `DEAD EVEN AT ${formatMoney(a.raised)}` : 'THE RACE IS ON';

  const anyStale = sides.some((s) => s.stale || !s.ok);

  return {
    event, gameDate, days, countdown, headline,
    scaleMax, scaleMaxText: formatMoney(scaleMax),
    combined, combinedText: formatMoney(combined),
    leader: leader?.key ?? null, gap, gapText: formatMoney(gap),
    updatedText: formatUpdated(now),
    stale: anyStale,
    sides,
  };
}
