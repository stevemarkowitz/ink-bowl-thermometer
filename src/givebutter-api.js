/**
 * Givebutter REST API adapter — the OPTIONAL fast path.
 *
 * Enabled per side by setting that side's API key as a Worker secret
 * (CAL_API_KEY / STANFORD_API_KEY). A key is scoped to one Givebutter account,
 * so each paper supplies its own; the board works with two keys, one, or none.
 *
 * Endpoints (base https://api.givebutter.com/v1, Authorization: Bearer <key>):
 *   GET /campaigns/{id}   single campaign, wrapped as { data: {...} }
 *   GET /campaigns?page=N paginated list, { data: [...], meta: {...} }
 * Campaign object fields used: id, code (the slug in the public URL), title,
 * goal (integer), raised (integer), donors, status.
 *
 * Unit assumption: `raised`/`goal` are whole dollars, matching the public page
 * ("raised":"1391.00" on the page == 1391 via API). /api/totals.json exposes
 * the raw API value so this is checked at a glance when the first key is added.
 */

export const API_BASE = 'https://api.givebutter.com/v1';

function unwrap(json) {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

function normalise(c, slug) {
  const raised = Number(c.raised);
  const goal = Number(c.goal);
  return {
    slug: c.code || slug,
    campaignId: c.id ?? null,
    title: c.title ?? null,
    raised: Number.isFinite(raised) ? raised : null,
    goal: Number.isFinite(goal) && goal > 0 ? goal : null,
    donors: Number.isFinite(Number(c.donors)) ? Number(c.donors) : null,
    status: c.status ?? null,
    rawRaised: c.raised,
    source: 'api',
  };
}

async function apiGet(path, apiKey, fetchImpl) {
  const res = await fetchImpl(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`givebutter api ${path}: HTTP ${res.status}`);
  return res.json();
}

/**
 * Read one campaign through the API. Prefers a direct GET when the numeric
 * campaignId is known; otherwise walks the account's campaign list looking for
 * the matching `code`. The resolved id is returned so callers can cache it.
 */
export async function fetchCampaignViaApi({ apiKey, slug, campaignId = null }, { fetchImpl = fetch, maxPages = 10 } = {}) {
  if (!apiKey) throw new Error('givebutter api: no key');

  if (campaignId) {
    const c = unwrap(await apiGet(`/campaigns/${encodeURIComponent(campaignId)}`, apiKey, fetchImpl));
    if (!c || c.raised === undefined) throw new Error('givebutter api: unexpected campaign shape');
    return normalise(c, slug);
  }

  const want = String(slug).toLowerCase();
  for (let page = 1; page <= maxPages; page++) {
    const json = await apiGet(`/campaigns?page=${page}&per_page=100`, apiKey, fetchImpl);
    const list = Array.isArray(unwrap(json)) ? unwrap(json) : [];
    const hit = list.find((c) => String(c.code ?? c.slug ?? '').toLowerCase() === want);
    if (hit) return normalise(hit, slug);
    const last = json?.meta?.last_page ?? json?.meta?.lastPage;
    if (!list.length || (last && page >= last) || (json?.links && !json.links.next)) break;
  }
  throw new Error(`givebutter api: campaign ${slug} not found in this account`);
}
