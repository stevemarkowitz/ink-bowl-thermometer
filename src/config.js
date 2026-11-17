/**
 * Season configuration: the one place that decides which Givebutter campaigns and which event label the board uses.
 *
 * Flip a season by setting SEASON in wrangler.toml (and filling in any missing slug); nothing else changes.
 *   SEASON            "2025" or "2026": picks the *_SLUG_<SEASON> pair below and the label "Ink Bowl <SEASON>"
 *   CAL_SLUG_<yyyy>   the Daily Cal campaign's slug (the part after givebutter.com/)
 *   STANFORD_SLUG_<yyyy>  the Stanford Daily campaign; empty = not shared yet (shown as "awaiting campaign data")
 *   Each *_SLUG_<yyyy> may be a Givebutter slug or link, OR a Neon CRM campaign link (the Stanford Daily uses Neon CRM): see campaign.js.
 *   GAME_DATE         the Big Game's calendar date, drives the countdown and the date on the board
 * CAL_SLUG / STANFORD_SLUG / EVENT_LABEL, if set, override the season-derived values (handy for a one-off test).
 */
export const DEFAULTS = {
  SEASON: '2026',
  GAME_DATE: '2026-11-21',
  CAL_SLUG_2025: 'HbHXTN',
  STANFORD_SLUG_2025: 'msB1YJ',
  CAL_SLUG_2026: 'inkbowl-2026-hgksv5',
  STANFORD_SLUG_2026: 'https://friendsstanforddaily.app.neoncrm.com/campaigns/big-game-2026',
};

export function resolveConfig(env = {}) {
  const e = { ...DEFAULTS, ...env };
  const season = String(e.SEASON).trim();
  const pick = (override, bySeason) => (String(override || '').trim() || String(bySeason || '').trim() || null);
  return {
    season,
    eventLabel: String(e.EVENT_LABEL || '').trim() || `Ink Bowl ${season}`,
    gameDate: e.GAME_DATE,
    slugs: {
      cal: pick(e.CAL_SLUG, e[`CAL_SLUG_${season}`]),
      stanford: pick(e.STANFORD_SLUG, e[`STANFORD_SLUG_${season}`]),
    },
  };
}
