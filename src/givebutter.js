/**
 * Reads fundraising totals from a public Givebutter campaign page.
 *
 * Why page reading and not the API: api.givebutter.com returns 401 for every
 * request without a bearer token, and an API key is scoped to ONE Givebutter
 * account. A head-to-head board spans two unrelated nonprofits, so the API
 * route would require The Stanford Daily to hand over a key for their account.
 * The public campaign page carries the same numbers in an embedded JSON blob,
 * needs no credential, and works identically for both sides.
 *
 * Observed shape (verified 2026-11-12 against givebutter.com/HbHXTN):
 *   "url":"https:\/\/givebutter.com\/HbHXTN","creator_name":"...",
 *   "goal":10000,"raised":"1391.00","raised_percentage":13,"account_id":19258
 *
 * Note "raised" is a STRING and sits next to "raised_percentage" and
 * "raised_amount" — the patterns below are anchored on `"raised":"` so they
 * cannot pick up either neighbour.
 */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#039': "'",
};

export function decodeEntities(input) {
  return String(input)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+|#0?39);/gi, (m, name) => {
      const hit = ENTITIES[name] ?? ENTITIES[name.toLowerCase()];
      return hit === undefined ? m : hit;
    });
}

/** Campaign slug -> public page URL. */
export const DEFAULT_ORIGIN = 'https://givebutter.com';
export function campaignUrl(slug, origin = DEFAULT_ORIGIN) {
  return `${origin.replace(/\/+$/, '')}/${encodeURIComponent(slug)}`;
}

function toMoney(raw) {
  if (raw === undefined || raw === null) return null;
  const n = Number.parseFloat(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Locate the JSON object describing THIS slug. A campaign page can embed more
 * than one campaign (cross-promoted drives, the org's other active campaigns),
 * so anchoring on the slug's own "url" field matters: taking the first
 * "raised" on the page would sometimes report a neighbouring campaign.
 */
function sliceForSlug(html, slug) {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // JSON in the page escapes forward slashes, so match both spellings.
  const anchor = new RegExp(`"url":"https:(?:\\\\/\\\\/|//)givebutter\\.com(?:\\\\/|/)${escaped}"`);
  const m = anchor.exec(html);
  if (!m) return null;
  return html.slice(m.index, m.index + 2500);
}

const NO_FIELDS = { goal: null, raised: null, percent: null, creator: null };

function fieldsFrom(text) {
  if (!text) return { ...NO_FIELDS };
  const goal = /"goal":\s*"?(\d+(?:\.\d+)?)"?/.exec(text);
  const raised = /"raised":\s*"([\d.,]+)"/.exec(text) || /"raised":\s*(\d+(?:\.\d+)?)/.exec(text);
  const pct = /"raised_percentage":\s*(\d+(?:\.\d+)?)/.exec(text);
  const creator = /"creator_name":"((?:[^"\\]|\\.)*)"/.exec(text);
  return {
    goal: goal ? toMoney(goal[1]) : null,
    raised: raised ? toMoney(raised[1]) : null,
    percent: pct ? Number.parseFloat(pct[1]) : null,
    creator: creator ? decodeEntities(creator[1].replace(/\\(.)/g, '$1')) : null,
  };
}

/**
 * Parse a Givebutter campaign page.
 * Returns { slug, title, creator, raised, goal, percent, source }.
 * `source` records which strategy matched, so a future breakage is diagnosable
 * from /api/totals.json rather than by re-reading the HTML by hand.
 */
export function parseCampaign(html, slug) {
  const out = {
    slug, title: null, creator: null, raised: null, goal: null, percent: null, source: 'none',
  };

  const titleMatch = /<title>([^<]*)<\/title>/i.exec(html);
  if (titleMatch) {
    // "Ink Bowl 2025 | The Daily Californian Education Foundation"
    const full = decodeEntities(titleMatch[1]).trim();
    const pipe = full.indexOf('|');
    out.title = (pipe === -1 ? full : full.slice(0, pipe)).trim() || null;
    if (pipe !== -1) out.creator = full.slice(pipe + 1).trim() || null;
  }

  // Strategy 1 (preferred): the JSON object whose "url" is this slug.
  const scoped = fieldsFrom(sliceForSlug(html, slug));
  if (scoped.raised != null) {
    Object.assign(out, {
      raised: scoped.raised,
      goal: scoped.goal ?? out.goal,
      percent: scoped.percent,
      creator: scoped.creator || out.creator,
      source: 'json-scoped',
    });
    return out;
  }

  // Strategy 2: first campaign JSON anywhere on the page.
  const loose = fieldsFrom(html);
  if (loose.raised != null) {
    Object.assign(out, {
      raised: loose.raised,
      goal: loose.goal ?? out.goal,
      percent: loose.percent,
      creator: loose.creator || out.creator,
      source: 'json-loose',
    });
    return out;
  }

  // Strategy 3: the rendered goal bar, e.g. <span ...raised-percentage">13</span>% of
  const renderedPct = /raised-percentage"[^>]*>\s*([\d.]+)\s*</.exec(html);
  if (renderedPct) {
    out.percent = Number.parseFloat(renderedPct[1]);
    out.source = 'html-percent';
  }
  return out;
}

/** Fetch + parse one campaign. Throws on a non-200 so callers can fall back. */
export async function fetchCampaign(slug, { fetchImpl = fetch, cacheTtl = 60, origin = DEFAULT_ORIGIN } = {}) {
  const res = await fetchImpl(campaignUrl(slug, origin), {
    headers: {
      // Givebutter serves the embedded JSON to ordinary browsers; a bare
      // fetch with no Accept/UA is likelier to be treated as a bot.
      'accept': 'text/html,application/xhtml+xml',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Mozilla/5.0 (compatible; InkBowlThermometer/0.1; +https://givebutter.com)',
    },
    // Collapse bursts of requests into one origin hit per TTL.
    cf: { cacheTtl, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`givebutter ${slug}: HTTP ${res.status}`);
  const parsed = parseCampaign(await res.text(), slug);
  if (parsed.raised == null) throw new Error(`givebutter ${slug}: no raised amount found`);
  return parsed;
}
