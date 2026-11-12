/**
 * Per-side data resolution with a strict fallback order:
 *
 *   1. manual pin   (an operator froze the number via /admin/pin)
 *   2. API          (only if that side has an API key configured)
 *   3. public page  (always available; the no-credential path)
 *   4. last good    (whatever we last read successfully — board never blanks)
 *   5. zero         (first boot with everything failing)
 *
 * Each side resolves independently, so one paper's key, outage or page change
 * never affects the other side's number.
 */
import { fetchCampaign, campaignUrl } from './givebutter.js';
import { fetchCampaignViaApi } from './givebutter-api.js';

export const SIDE_KEYS = ['cal', 'stanford'];

/** Pull per-side config out of Worker env/vars. */
export function sideConfig(env, key) {
  const K = key.toUpperCase();
  return {
    key,
    slug: env[`${K}_SLUG`],
    apiKey: env[`${K}_API_KEY`] || null,
    campaignId: env[`${K}_CAMPAIGN_ID`] || null,
    origin: env.GIVEBUTTER_ORIGIN || undefined, // test hook; production uses givebutter.com
  };
}

export async function readSide(cfg, { fetchImpl = fetch, store, now = new Date(), log = () => {} } = {}) {
  const base = {
    key: cfg.key, slug: cfg.slug, url: campaignUrl(cfg.slug), // public URL (donate link); cfg.origin only affects where we READ from
    raised: 0, goal: null, title: null, source: 'none', ok: false, stale: true,
    readAt: null, error: null, apiEnabled: Boolean(cfg.apiKey),
  };
  if (!cfg.slug) return { ...base, error: 'no slug configured' };

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
      const changed = !prev || prev.raised !== good.raised || prev.goal !== good.goal
        || prev.source !== good.source || now.getTime() - (prev.writtenAt || 0) > 6 * 3600 * 1000;
      if (changed) await store?.setLastGood(cfg.key, { ...good, writtenAt: now.getTime() });
      return good;
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
      log(`[${cfg.key}] ${name} failed: ${e.message}`);
    }
  }

  const last = await store?.getLastGood(cfg.key);
  if (last) return { ...last, ok: false, stale: true, source: `${last.source}(last-good)`, error: errors.join('; ') };
  return { ...base, error: errors.join('; ') };
}
