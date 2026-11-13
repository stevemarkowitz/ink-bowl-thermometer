# History and decisions

How the Ink Bowl thermometer came to be, what we learned, and why it is built the way it is.
(Research below was done 2026-11-12; items marked *unverified* could not be confirmed.)

## The ask
For the Ink Bowl flag-football game between The Daily Californian and The Stanford Daily (ahead of
the Cal-Stanford Big Game), show a visual thermometer comparing what each side has raised, to create
excitement and pressure for donors to back their side. Both papers fundraise on Givebutter. The
build should be on Cloudflare, embeddable on both papers' Givebutter pages, usable in email, and
work on mobile first.

## Past Ink Bowl fundraising (institutional memory)
Whoever ran the earlier thermometer is not documented; we could not confirm what drew it.
- 2017: The Stanford Daily ran an "Ink Bowl fundraising challenge" against the Daily Cal.
- 2020: with no game, the papers ran an online fundraising competition (the Daily Cal won).
  The likeliest home of the old thermometer; no surviving page was found.
- 2023: the Daily Cal's Ink Bowl drive was on GoFundMe, benefiting the Daily Californian Education
  Foundation (DCEF).
- 2024: Stanford hosted a joint page with a donate button per paper, each linking to its own
  Givebutter campaign. Stanford's "Ink Bowl 2024" campaign: `fRGluy`, $2,650 of $10,000 (read
  2026-11-12).
- 2025: Daily Cal "Ink Bowl 2025", `HbHXTN`; Stanford "Big Game 2025", `msB1YJ` (the two campaigns
  this proof of concept reads). Totals read 2026-11-12: $1,391 and $2,805, both with $10,000 goals.

## What Givebutter does and does not offer
- No head-to-head feature across two accounts. It does offer an embeddable per-campaign goal bar
  (progress bar or thermometer); the widget library is installed per account (*unverified* whether
  one page can show goal bars from two accounts).
- **API:** `https://api.givebutter.com/v1`, bearer-token auth, returns 401 without a key. A key is
  scoped to **one** Givebutter account, so a head-to-head board over two unrelated nonprofits would
  need The Stanford Daily to hand over a key. Campaign objects carry `goal`, `raised`, donors, `code`.
- **Public campaign page** embeds the same numbers as JSON (`"goal":10000,"raised":"1391.00"`),
  needs no credential, and is identical for both sides. This is why the default is a page reader.
- **Story editor:** images can be inserted by URL or upload; story images max 600 px wide; the story
  sits below the cover photo and goal bar (so the board cannot be at the very top unless baked into
  the cover). *Unverified:* whether Givebutter keeps an image URL live or copies the file at save.
  A community post reports iframes working in a story.
- Other platforms: not surveyed in depth. Team leaderboards generally live inside one campaign owned
  by one organisation, which does not fit two separate nonprofits, and switching platforms was not
  realistic. No turnkey open-source two-organisation thermometer was found.

## Key decisions
1. **Page reader first, API as an optional per-side upgrade.** Works today with no credential from
   either paper; each side flips to the API independently when a key exists. Fallback order per side:
   manual pin -> API -> public page -> last good value -> $0. The board never blanks.
2. **Cloudflare Worker + KV**, deployed by GitHub Actions on push to `main`, pinned to one
   Cloudflare account so the wrong environment fails instead of landing elsewhere.
3. **One shared scale keyed to the leader** (not the goal), so the race looks close and both tubes
   are substantial; the gap is stated as an actionable number under the trailing side ("$1,415 takes
   the lead"). Goal shown as a percentage and a dashed line once within range.
4. **Mobile-first**: a Givebutter story image shows at ~340 px on a phone; type sizes are chosen for
   that. Official primaries: Berkeley Blue `#003262` and Stanford Cardinal `#8C1515`
   (plus each brand's accent, California Gold `#FDB515` / Sandstone `#D2C295`: see decision 11).
5. **PNG for email without Worker CPU:** staff download it from `/png`, rendered in their browser.
   Server-side PNG exists but is off (Workers Free CPU limit).
6. **One address.** `https://inkbowl.giving` serves the page to browsers and the image to image
   requests (content negotiation); `/thermometer.svg` remains as a fallback.
7. **All text as outlines, never `<text>`.** See the incident below.
8. **Papers' own identity:** logo marks (vector-traced from their avatars) on team-colour tiles, and
   each paper's own nameplate (Stanford: its published SVG; Daily Cal: traced). Subject to each
   paper's approval.
9. **Paper brand vs team colours.** The Daily Cal's logo tile uses the paper's own light blue; the
   thermometer, amount and nameplate use Berkeley Blue. Distinct brands, coherent column; light-blue
   lettering failed on legibility (see `docs/design/daily-cal-colour-options.png`).
10. **Fairness in all respects** (see `FAIRNESS.md`). Sizing by one measure always favoured someone: equal
   width made Stanford's blackletter look bigger, equal cap height made the Daily Cal's very wide line
   look bigger. Nameplates are now sized to equal footprint on a shared baseline and logo marks to equal footprint
   too (see decision 11 for accents). Rule of thumb:
   never size per-paper art by a single dimension; compare rules visually at phone size
   (`docs/design/`) and guard the result with tests.
11. **Brand accents kept, by the owner's choice.** After seeing neutral vs brand accents side by side, the owner
   chose California Gold and Stanford Sandstone (2026-11-13). The treatment is identical in structure; the
   inherent difference in vividness is accepted and recorded in `FAIRNESS.md`. Logo marks use the same
   equal-footprint rule as the nameplates.

## Incidents and lessons
- **Invisible text on a phone's first load.** An SVG in an `<img>` paints once; text waiting on an
  embedded web font stayed invisible. Fixed by outlining text (`be88462`). Do not reintroduce
  `<text>` / `@font-face`; the render test guards this.
- **New domain not reachable right after deploy.** A brand-new zone needed minutes for DNS and the
  HTTPS certificate; the deploy succeeded but the smoke test failed. The smoke test now checks via
  Cloudflare's edge when public DNS lags (`b83af31`).
- **KV Free write budget.** Writing last-good on every read would exceed 1,000 writes/day; now
  write-on-change (`eb72b6a`).
- **Tracing tool quirk:** `potracer` traces the cells that are *False*; `scripts/trace-*.py` account
  for it.

## Accounts and access (how the pieces connect)
- **Cloudflare:** a workers.dev subdomain belongs to the *account*, not a Worker, so every Worker in
  the account shares it; to avoid an unrelated name the project is served on its own domain
  (`inkbowl.giving`). A token scoped to one account (and to the zone for custom domains) is used by
  CI. Claude Code web sessions authenticate to Cloudflare via a per-environment network secret and
  could not reach KV or zone DNS with it; those happen in CI with the broader token.
- **GitHub:** the repo is under a personal user; Claude sessions act as a different user who must be
  added as a *collaborator* (the GitHub App's repository access alone was not enough to push).
- **Not in this repo on purpose:** secrets, tokens, personal contact details, the original avatar
  screenshots. Source assets can be regenerated with the scripts in `scripts/`.
