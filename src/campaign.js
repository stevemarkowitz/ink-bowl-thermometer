/**
 * A side's campaign can live on different fundraising platforms. A campaign reference is whatever the owner pasted into
 * wrangler.toml: a bare Givebutter slug ("HbHXTN"), a Givebutter link, or a Neon CRM campaign link. This turns it into a
 * normalised ref:
 *   { provider: 'givebutter', id: <slug>, slug, url }
 *   { provider: 'neon',       id: 'neon:<org>/<page>', org, page, origin, path, url }
 * `id` is what "last known" is keyed by, so a campaign on one platform/link can never inherit another's total.
 */
export function parseCampaignRef(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return givebutterRef(raw.replace(/^\/+|\/+$/g, ''));
  let u;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'givebutter.com' || host === 'www.givebutter.com') return parts[0] ? givebutterRef(parts[0]) : null;
  const neon = /^([a-z0-9-]+)\.app\.neoncrm\.com$/.exec(host);
  if (neon) {
    // https://<org>.app.neoncrm.com/campaigns/<page>
    const i = parts.indexOf('campaigns');
    const page = i >= 0 ? parts[i + 1] : null;
    if (!page) return null;
    const origin = `${u.protocol}//${u.host}`;
    return { provider: 'neon', id: `neon:${neon[1]}/${page}`, org: neon[1], page, origin, path: `/campaigns/${page}`, url: `${origin}/campaigns/${page}` };
  }
  return null;
}

function givebutterRef(slug) {
  if (!slug) return null;
  return { provider: 'givebutter', id: slug, slug, url: `https://givebutter.com/${encodeURIComponent(slug)}` };
}
