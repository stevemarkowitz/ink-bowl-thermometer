/**
 * Per-side data resolution with a strict fallback order:
 *
 *   1. manual pin   (an operator froze the number via /admin/pin)
 *   2. API          (only if that side has an API key configured)
 *   3. public page  (always available; the no-credential path)
 *   4. last good    (whatever we last read successfully — board never blanks)
 *   5. pending      (the campaign is not public yet: $0, "opening soon", polled until it is)
 *   6. zero         (first boot with everything failing)
 *
 * Last good is only used for the SAME campaign link: a new season's link must never inherit last season's total.
 *
 * Each side resolves independently, so one paper's key, outage or page change
 * never affects the other side's number.
 */
import { fetchCampaign, campaignUrl, NotLiveError } from './givebutter.js';
import { fetchCampaignViaApi } from './givebutter-api.js';

export const SIDE_KEYS = ['cal', 'stanford'];

/** Pull per-side config out of Worker env/vars. */
export function sideConfig(env, key) {
  const K = key.toUpperCase();
  return {
    key,
    slug: env[`${K}_SLUG`] || null,
    apiKey: env[`${K}_API_KEY`] || null,
    campaignId: env[`${K}_CAMPAIGN_ID`] || null,
    origin: env.GIVEBUTTER_ORIGIN || undefined, // test hook; production uses givebutter.com
  };
}

const pendingSide = (base, now, reason) => ({
  ...base, raised: 0, goal: null, ok: true, stale: false, pending: true, source: 'pending', readAt: now.getTime(), error: null, reason,
});

export async function readSide(cfg, { fetchImpl = fetch, store, now = new Date(), log = () => {} } = {}) {
  const base = {
    key: cfg.key, slug: cfg.slug, url: cfg.slug ? campaignUrl(cfg.slug) : null, // public URL (donate link); cfg.origin only affects where we READ from
    raised: 0, goal: null, title: null, source: 'none', ok: false, stale: true,
    readAt: null, error: null, apiEnabled: Boolean(cfg.apiKey), pending: false, reason: null,
  };
  if (!cfg.slug) return pendingSide(base, now, 'no campaign link yet');

  const pin = await store?.getPin(cfg.key);
  if (pin && (!pin.expiresAt || pin.expiresAt > now.getTime())) {
    return { ...base, ...pin.values, source: 'pin', ok: true, stale: false, readAt: pin.setAt };
  }

  const attempts = [];
  if (cfg.apiKey) {
    attempts.push(['api', () => fetchCampaignViaApi({ apiKey: cfg.apiKey, slug: cfg.slug, campaignId: cfg.campaignId }, { fetchImpl })]);
  }
  attempts.push(['page', () => fetchCampaign(cfg.slug, { fetchImpl, origin: cfg.origin })]);

  const errors = [];
  let notLive = null;
  for (const [name, run] of attempts) {
    try {
      const r = await run();
      const good = {
        ...base,
        raised: r.raised, goal: r.goal ?? null, title: r.title ?? null,
        source: name === 'api' ? 'api' : r.source, // page parser reports its strategy
        rawRaised: r.rawRaised ?? null, campaignId: r.campaignId ?? cfg.campaignId ?? null,
        ok: true, stale: false, readAt: now.getTime(), error: errors.join('; ') || null,
      };
      // KV Free allows 1,000 writes/day: persist only on change (or a 6h refresh), never per read.
      const prev = await store?.getLastGood(cfg.key);
      const changed = !prev || prev.slug !== good.slug || prev.raised !== good.raised || prev.goal !== good.goal
        || prev.source !== good.source || now.getTime() - (prev.writtenAt || 0) > 6 * 3600 * 1000;
      if (changed) await store?.setLastGood(cfg.key, { ...good, writtenAt: now.getTime() });
      return good;
    } catch (e) {
      if (e instanceof NotLiveError) notLive = notLive || e;
      errors.push(`${name}: ${e.message}`);
      log(`[${cfg.key}] ${name} failed: ${e.message}`);
    }
  }

  // Last known value, but only for THIS campaign link (never last season's total under a new link).
  const last = await store?.getLastGood(cfg.key);
  if (last && last.slug === cfg.slug) return { ...last, ok: false, stale: true, pending: false, source: `${last.source}(last-good)`, error: errors.join('; ') };
  // Not public yet and never seen live: count it as $0 and keep polling; real numbers appear when it publishes.
  if (notLive) return pendingSide(base, now, notLive.message);
  return { ...base, error: errors.join('; ') };
}
