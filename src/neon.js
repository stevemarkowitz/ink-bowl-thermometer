/**
 * Reads a campaign's total from a Neon CRM (Neon One) campaign page, the way the page's own thermometer does.
 *
 * Neon's campaign page is rendered in the browser. Its HTML holds the goal and the campaign's internal id; the amount raised
 * comes from one public call the page makes itself:
 *     POST /nx/portal/landing-page/retrieveCampaignStatics   {campaignId, includeSub, includeEvent, includePledge, includeAnonymous}
 *  -> {"donorCount":1,"registrantCount":0,"raisedTotal":52.04}
 * We make the same two requests (page for id/goal/flags, then the statistics call) with the SAME include-flags the page uses,
 * so the number is exactly what the page shows ("SO FAR, WE HAVE RAISED"). No login, cookie or API key is needed.
 *
 * "Not live yet": a campaign that doesn't exist (or isn't published) comes back as HTTP 200 with a generic organisation page
 * that lacks the campaign data (`const campaignLandingPage = {...}`); that is a NotLiveError, shown as pending ($0).
 * Anything else that goes wrong (5xx, a statistics failure) is a plain Error: the board keeps the last known value.
 *
 * This is an undocumented-but-public page call, so it can change; test/fixtures hold the real page and the tests fail first.
 * Upgrade path: Neon's official API with an API key from the foundation's account.
 */
import { NotLiveError } from './givebutter.js';

export const NEON_STATS_PATH = '/nx/portal/landing-page/retrieveCampaignStatics';

const flag = (blob, name, dflt) => {
  const m = new RegExp(`"${name}"\\s*:\\s*(\\d)`).exec(blob);
  return m ? m[1] === '1' : dflt;
};

/** Pull the campaign id, goal, include-flags and title out of the page HTML. Returns null if it is not a campaign page. */
export function parseNeonPage(html) {
  const at = html.indexOf('const campaignLandingPage');
  if (at < 0) return null;
  const blob = html.slice(at, at + 6000);
  const id = /"campaignId"\s*:\s*(\d+)/.exec(blob);
  if (!id) return null;
  const goal = /campaignGoalMeter\s*=\s*\{[^}]*?\bgoal\s*:\s*([\d.]+)/.exec(html);
  const title = /<title>([^<]*)<\/title>/i.exec(html);
  const pageTitle = /"pageTitle"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(blob);
  const goalNum = goal ? Number.parseFloat(goal[1]) : null;
  return {
    campaignId: Number(id[1]),
    goal: Number.isFinite(goalNum) && goalNum > 0 ? goalNum : null,
    // the same include-flags the page sends, so our total equals the page's
    flags: { includeSub: flag(blob, 'includeSub', true), includeEvent: flag(blob, 'includeEvent', true), includePledge: flag(blob, 'includePledge', true) },
    title: (title ? title[1] : pageTitle ? pageTitle[1] : '').trim() || null,
  };
}

/**
 * @param ref a parsed Neon campaign ref (see campaign.js)
 * @param opts.origin test hook: read from here instead of the real Neon host
 */
export async function fetchNeonCampaign(ref, { fetchImpl = fetch, origin, cacheTtl = 300 } = {}) {
  const base = String(origin || ref.origin).replace(/\/+$/, '');
  const pageUrl = `${base}${ref.path}`;
  const res = await fetchImpl(pageUrl, {
    headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9', 'user-agent': 'Mozilla/5.0 (compatible; InkBowlThermometer/0.1)' },
    // the id/goal/flags rarely change: reuse the page for a few minutes
    cf: { cacheTtl, cacheEverything: true },
  });
  if (res.status === 404 || res.status === 410) throw new NotLiveError(`neon ${ref.id}: HTTP ${res.status} (no such campaign yet)`);
  if (!res.ok) throw new Error(`neon ${ref.id}: page HTTP ${res.status}`);
  const page = parseNeonPage(await res.text());
  if (!page) throw new NotLiveError(`neon ${ref.id}: not a published campaign page yet`);

  const stats = await fetchImpl(`${base}${NEON_STATS_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json;charset=UTF-8', accept: 'application/json, text/plain, */*', referer: pageUrl, 'user-agent': 'Mozilla/5.0 (compatible; InkBowlThermometer/0.1)' },
    body: JSON.stringify({ campaignId: page.campaignId, ...page.flags, includeAnonymous: true }),
  });
  if (!stats.ok) throw new Error(`neon ${ref.id}: statistics HTTP ${stats.status}`);
  const j = await stats.json();
  // The page itself treats a missing/empty raisedTotal as 0.
  const raised = j && j.raisedTotal ? Number(j.raisedTotal) : 0;
  if (!Number.isFinite(raised) || raised < 0) throw new Error(`neon ${ref.id}: unexpected raisedTotal ${JSON.stringify(j?.raisedTotal)}`);
  return {
    slug: ref.id, campaignId: page.campaignId, title: page.title, raised, goal: page.goal,
    donors: Number.isFinite(Number(j.donorCount)) ? Number(j.donorCount) : null, rawRaised: j.raisedTotal ?? null, source: 'neon',
  };
}
