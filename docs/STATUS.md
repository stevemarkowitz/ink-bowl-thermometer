# Status and runbook

Last updated 2026-11-12. For the story of how we got here see `HISTORY.md`; for what changed
see `../CHANGELOG.md`.

## Current state
- **Live:** https://inkbowl.giving (page for browsers, thermometer image for `<img>` requests);
  `www.inkbowl.giving` redirects to it. Explicit image: `https://inkbowl.giving/thermometer.svg`.
  Staff PNG for email: `https://inkbowl.giving/png`.
- **Reading the 2025 Ink Bowl campaigns** (proof of concept): Daily Cal `HbHXTN`, Stanford
  `msB1YJ` (titled "Big Game 2025" on Stanford's side). No 2026 Ink Bowl *fundraising* campaign
  existed on either paper's Givebutter hub when checked (2026-11-12; the Daily Cal had only an
  "Ink Bowl Trivia Night 2026" with $0).
- **Big Game 2026:** Saturday 2026-11-21 at California Memorial Stadium (kickoff not announced
  when checked). `GAME_DATE` in `wrangler.toml` drives the countdown.
- **Deploys:** every push to `main` runs the Deploy workflow (tests, KV, `wrangler deploy`,
  smoke test against the live domain). Manual run: Actions -> Deploy -> Run workflow.

## Where things live
| Thing | Value |
| --- | --- |
| Repo | `stevemarkowitz/ink-bowl-thermometer` (a personal GitHub user's repo; Claude sessions push as collaborator `smarkowitz`) |
| Cloudflare account | id `3698908aee438e9c20994f722c7e6098`, pinned in `wrangler.toml` (workers.dev subdomain `dailycal-keepsakes`, shared with the `dc-byline-search` Worker: do not rename it) |
| Zones in that account | `inkbowl.giving` (this project), `dcsearch.vip` (Byline Search: leave alone) |
| Worker | `ink-bowl-thermometer`; custom domains `inkbowl.giving`, `www.inkbowl.giving`; workers.dev off |
| KV | namespace titled `ink-bowl-thermometer-THERMO`, binding `THERMO` (id injected at deploy) |
| GitHub secrets (Settings -> Secrets and variables -> Actions) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` set. `ADMIN_TOKEN` **not set yet** (optional) |
| Cloudflare token needs | Workers Scripts: Edit, Workers KV Storage: Edit, plus Zone: DNS Edit and Workers Routes Edit on `inkbowl.giving` (custom domains) |

## Runbooks
**Switch to the 2026 campaigns.** Get each paper's 2026 Givebutter campaign link
(`givebutter.com/<slug>`), then in `wrangler.toml` set `CAL_SLUG`, `STANFORD_SLUG` and
`EVENT_LABEL = "Ink Bowl 2026"`. Commit to `main`; the deploy does the rest. Check
`https://inkbowl.giving/api/totals.json` (both sides `ok: true`, `source: "json-scoped"`).

**Turn on the Givebutter API for a side.** The key must be a *Worker* secret named `CAL_API_KEY` or
`STANFORD_API_KEY` (a GitHub repo secret alone does nothing: the workflow currently only forwards
`ADMIN_TOKEN`, so either run `npx wrangler secret put CAL_API_KEY` from a machine with the
Cloudflare token, or extend the workflow's secret step to forward the new one). Then compare
`rawRaised` in `/api/totals.json` with the campaign page once (the API is assumed to report whole
dollars). Optional `CAL_CAMPAIGN_ID` / `STANFORD_CAMPAIGN_ID` make the API read one direct GET.
Each side is independent: one key, two keys or none all work.

**Enable manual pinning.** Create a long random `ADMIN_TOKEN` (store it in a password manager),
add it as a GitHub repo secret, run the Deploy workflow (it pushes it to Cloudflare). Then
`/admin/pin?side=cal&raised=1234&token=...` (optional `&goal=` `&hours=`) and `/admin/unpin`.

**If a number looks wrong.** `/api/totals.json` says which source produced each side and any
error. If the page reader broke (Givebutter changed its markup), `npm test` fails against the
captured pages in `test/fixtures/`; update `src/givebutter.js`. Until fixed, pin the number.

**Put it on a Givebutter campaign.** In the campaign's Story editor, add an image from a URL:
`https://inkbowl.giving` (fall back to `https://inkbowl.giving/thermometer.svg` if the editor
wants a file-style URL), put it first in the Story, optionally link it to `https://inkbowl.giving`.
Story images max out at 600 px wide; the board is designed for that.

**Email PNG.** Open `https://inkbowl.giving/png`, click Download PNG (1200x1800), attach it.

## Open items
1. **2026 campaign links** from both papers (see runbook).
2. **Givebutter story test (unverified):** does the story editor keep the image as a live link, or
   copy it on save (freezing the totals)? Test on a draft campaign. Fallback: iframe the page.
   Also confirm the editor accepts the extension-less `https://inkbowl.giving` as an image URL.
3. **Logo and nameplate approval.** The marks and nameplates are the papers' trademarks. Each paper
   should approve this use. If either has an official vector, swap it into `src/logos.js` /
   `src/wordmarks.js` (the Daily Cal nameplate is a trace, not the original file).
4. **Email-spoofing records for `inkbowl.giving`** (Cloudflare suggested them; not added). We
   receive no email there, so: MX `@` -> `.` (priority 0, "null MX"); TXT `@` = `v=spf1 -all`;
   TXT `_dmarc` = `v=DMARC1; p=reject; adkim=s; aspf=s`. No DKIM needed (nothing sends mail).
5. **`ADMIN_TOKEN`** (optional) and **API keys** (optional) as above.
6. **Repo visibility:** the repo was created public; make it private if intended.
7. Daily Cal brand blue: its avatar uses a lighter blue than Berkeley Blue (`#003262`), which the
   board uses for coherence. One-line change in `src/model.js` if preferred.

## Limits to remember (Workers Free plan)
- 10 ms CPU per request: the server-side PNG (`/thermometer.png`, ~300 ms) is **off** by default
  (`SERVER_PNG=false`); staff use `/png`, which renders in their browser. Enable it only on Workers
  Paid.
- KV: 1,000 writes/day (hence write-on-change), 100k reads/day.
- Images are edge-cached 60 s; each side's read is reused 2 min; a cron every 5 min keeps
  last-good values warm.
