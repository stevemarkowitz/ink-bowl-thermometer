# Ink Bowl thermometer: instructions for Claude sessions

Live Cal-vs-Stanford fundraising thermometer on a Cloudflare Worker. Read `docs/STATUS.md` first
(current state, accounts, runbooks, open items), then `docs/HISTORY.md` for why things are as they
are. Update `CHANGELOG.md` and the relevant doc with every change (commit docs with the code).

## Targets and boundaries
- Deploys go **only** through the GitHub Actions workflow on push to `main`. Do not run
  `wrangler deploy` from a session. Cloudflare account id is pinned in `wrangler.toml`; never deploy
  elsewhere.
- Leave alone: the `dc-byline-search` Worker, the `dcsearch.vip` zone, and the account's workers.dev
  subdomain `dailycal-keepsakes` (shared with other projects).
- Production writes (deploys via push, DNS records, secrets, domain changes) are authorised by the
  user per task; ask before DNS/email-record changes, token rotation or anything destructive.
- Never print or commit secrets (Cloudflare token, `*_API_KEY`, `ADMIN_TOKEN`) or personal contact
  details. Secrets live in GitHub repo secrets / Worker secrets.
- Logos and nameplates are the papers' trademarks used for their joint fundraiser; keep the approval
  note in `docs/STATUS.md` until both papers have confirmed.

## Standing instruction: 2026 (owner, 2026-11-16, updated 2026-11-17)
The board is **live on 2026** (`SEASON = "2026"`) with both sides reporting: the Daily Cal from **Givebutter**
(`inkbowl-2026-hgksv5`) and The Stanford Daily from **Neon CRM** (`friendsstanforddaily.app.neoncrm.com/campaigns/big-game-2026`;
Stanford did not use Givebutter). A `*_SLUG_<yyyy>` holds a Givebutter slug/link or a Neon CRM campaign link, and each side is read
from its own platform. A link that is not public yet counts as $0 / pending ("Awaiting campaign data") and the board updates itself
when it publishes (even at $0); while any side is pending nobody "leads". Never let last season's total (or another platform's
total) appear under a new link (the `THE TRAP` tests guard it).

## Invariants (tests enforce most of these)
- The SVG has **no `<text>`, `@font-face` or font-family**: all text is outlined (`src/text.js`).
  An SVG in an `<img>` paints once, so font-dependent text is invisible on first load.
- The board is 600 wide (Givebutter story max); keep type sizes legible at ~340 px.
- **Neither paper may look favoured** (`docs/FAIRNESS.md`). Anything shown per paper is sized for equal visual
  size, never by one dimension: nameplates share a baseline and equal footprint (`nameplateLayout()`), logo
  marks equal footprint (`markLayout()`), accents structurally identical (`ACCENTS`; the owner chose the brand
  gold/sandstone knowing gold is more vivid, so do not "fix" that without asking). Check every visual change at
  phone width, including the swapped case, and keep the `FAIRNESS:` tests passing.
- **The thermometer must agree with the labels:** when a goal is known the top of the tube is the goal and fill = raised / goal,
  so "6% of goal" can never look nearly full (the `FILL AGREES WITH THE GOAL LABEL` test guards it). Never rescale the tube to
  the leader.
- Server-side PNG stays off (`SERVER_PNG=false`) on Workers Free (10 ms CPU). Staff use `/png`.
- KV writes stay write-on-change (Free allows 1,000/day).
- `https://inkbowl.giving` must keep serving the page to browsers and the SVG to image requests.

## Commands
```bash
npm ci
npm test                     # unit tests (parser, board maths, sources, renderer, redirects)
npm run test:integration     # wrangler dev in workerd + browser PNG export (needs Playwright)
npm run test:integration:2026 # SEASON=2026: both awaiting -> Daily Cal (Givebutter) live -> Stanford (Neon) live, real pages
npm run preview -- 1391 2805 # docs/preview-{desktop,phone}.png
```
Regenerate generated data only when inputs change: `scripts/build-glyphs.py` (typefaces),
`scripts/trace-logos.py` (avatars), `scripts/trace-wordmarks.py` (nameplates), then `node scripts/measure-ink.cjs`. Check any visual
change at phone width (`docs/preview-phone.png`) before pushing.
