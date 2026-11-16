# Changelog

All notable changes. Newest first. Everything below shipped on 2026-11-12 unless noted; commit
hashes are on `main`. Live site: **https://inkbowl.giving**.

## Fix: the thermometer now agrees with "% of goal" (this change)
- **Bug (reported 2026-11-16):** the board said "6% of $10,000 goal" but the thermometer looked almost full. The tubes were
  scaled to the *leader* (leader's total + 12%), so the leading tube was always ~90% full however little had been raised.
- **Fix:** when a goal is known the **tube is the goal**: the top of the tube is the goal ($10,000 -> ticks at $5,000 and
  $10,000), so fill = raised / goal and always matches the label. The scale is still shared and in dollars, so the taller tube is
  still the side that has raised more; it only grows (with a dashed goal line) if someone passes the goal. With no goal known it
  falls back to the leader with headroom.
- **Zero at the bulb, not inside it:** a small total used to sit entirely behind the bulb so the tube looked empty. Zero is now
  where the tube meets the bulb (as on a real thermometer), so 6% is a visible sliver of mercury. Mercury is only drawn when
  there is some (no stray gray bar on an empty tube). The "GOAL" label (shown once the goal is passed) moved beside the tube.
- Tests: `FILL AGREES WITH THE GOAL LABEL` (the exact complaint, across several states), over-goal and no-goal cases.

## LIVE ON 2026 (`b02235d`): Daily Cal live, Stanford awaiting its link
- **`SEASON = "2026"`** (2026-11-16). The Daily Cal's campaign (`inkbowl-2026-hgksv5`, "Ink Bowl Competitive Fund Drive 2026")
  is live and read from its real page ($605 of $10,000 when taken live). `STANFORD_SLUG_2026` is blank (no Stanford 2026
  campaign existed on its Givebutter hub when checked), so Stanford is *pending* until its link is shared. Title, page, PNG and
  countdown read 2026 (5 days to Big Game on Nov. 21 when taken live). The real live Daily Cal page is a test fixture.
- **Pending state redesigned so it can't be mistaken for a real $0:** the pending side's column is grayed out (tile,
  nameplate, `$0`, bulb), reads "NO TOTAL YET", and a dashed clock notice under its thermometer says **"AWAITING CAMPAIGN DATA
  FROM THE STANFORD DAILY"**; the thermometer stays visible at zero. Symmetric: the Daily Cal gets the same treatment if it is
  the one awaiting data (`docs/design/2026-pending-states.png`).
- **No false lead claims:** while either side is pending, nobody "leads": the banner says "THE RACE IS ON" (neutral), the
  live side says "EVERY GIFT COUNTS", and the API returns `leader: null`, `gap: 0`, `pending: true`.
- **Page:** the donate buttons stay at the bottom; the pending side's button is visibly disabled (dashed, grayed, clock,
  "Awaiting campaign link"), not a link, with a plain-language note under the buttons
  (`docs/design/page-with-pending-button.png`). The deploy smoke test now also prints `season` and each side's `pending`.

## 2026 readiness: season switch, "not public yet" handling, last-known fix (this change)
- **Season switch:** `SEASON` in `wrangler.toml` picks the campaigns and the label ("Ink Bowl <SEASON>"); per-season slugs
  `CAL_SLUG_2025/2026`, `STANFORD_SLUG_2025/2026` (`src/config.js`). The Daily Cal's 2026 link
  (`inkbowl-2026-hgksv5`) is on file; Stanford's is blank until shared. Still `SEASON = "2025"`.
- **Not public yet = $0, then real numbers:** Givebutter serves an unpublished campaign as HTTP 200 with "This fundraiser has
  not been published." (and a missing link as 404). That is now a distinct *pending* state: $0, "Campaign opening soon",
  disabled donate button on the page, re-checked on every request; real numbers appear the moment it publishes (even $0).
  Outages (5xx) are not "not live" and keep the last known value.
- **Bug fixed (would have shown the wrong money):** "last known" was stored per side, not per campaign, so a new season's
  link could have shown last season's total during a failure. It is now only reused for the same link (test `THE TRAP`).
  The first write for a new link always persists.
- **Date from config:** "NOV 21" was hard-coded; it now comes from `GAME_DATE` (the countdown already did).
- Default empty-state thermometer scale is $1,000 (was $250) when no goals are known.
- Tests: pending/live/trap/outage behaviour, config, vanity-slug parsing, pending rendering; new
  `scripts/integration-2026.cjs` runs the real Worker against local fixtures including Givebutter's real unpublished page
  and a not-public-to-live flip. (It caught a missing `memo` definition before deploy.)
- Docs: the owner's standing 2026 instructions and a flip checklist in `docs/STATUS.md` and `CLAUDE.md`.

## Equal-footprint logo marks; brand accents restored (`13baed3`)
- **Brand accents back** (California Gold / Stanford Sandstone) at the owner's request, after seeing the
  vividness asymmetry side by side. Treatment stays structurally identical for both sides; tests now assert
  that. `ACCENTS = 'neutral'` reverts. Recorded as the owner's decision in `docs/FAIRNESS.md`.
- **Logo marks** now use **equal footprint** (the same rule as the nameplates) instead of equal ink: DC 67x32,
  S 47x46. The DC mark is already as wide as its tile allows, so only the S could change. Candidates:
  `docs/design/logo-mark-size-rules.png`.

## Fairness audit (`e2a5224`)
- **Nameplates** now sized to **equal footprint** on one baseline. Equal cap height (the previous
  change) left the Daily Cal's very wide line covering more of the page, so it looked bigger; equal
  width (before that) made Stanford look bigger. Four rules were compared at phone size
  (`docs/design/nameplate-size-rules.png`); equal footprint looked most balanced.
- **Logo marks** scaled to **equal ink** inside the equal tiles: the "S" was ~1.6x heavier than the
  "DC" mark; now both carry the same visual mass.
- **Accents** (tile ring, mercury cap, top-bar underline) are now one **neutral** treatment for both
  sides: California Gold is far more vivid than Stanford's Sandstone, which made Cal pop
  (`docs/design/accent-parity.png`). `ACCENTS = 'brand'` restores them.
- New `docs/FAIRNESS.md` (audit of every per-paper element, rules, known unavoidable differences, open
  question about left/right order); `FAIRNESS:` tests; `src/ink.js` generated by
  `scripts/measure-ink.cjs`.

## Equal nameplate cap height (`837d484`, superseded by the rule above)
- **Problem:** both nameplates were the same *width*, but at equal width Stanford's blackletter capitals
  were ~1.5x taller than the Daily Cal's (overall height ~1.7x, with descenders), so Stanford looked
  bigger and bolder.
- **Fix:** both are now drawn at the **same cap height on the same baseline** (`nameplateLayout()` in
  `src/render.js`; per-nameplate `top`/`base` recorded by `scripts/trace-wordmarks.py`). Widths differ
  because the names differ in length. Common cap height is capped so the wider Daily Cal line fits its
  column. A test fails if the two ever differ. Before/after: `docs/design/nameplate-sizing.png`.

## Daily Cal logo tile in the paper's own blue (`6b7b425`)
- The Daily Cal's logo tile uses its avatar's own light blue (`#4B9BD0`); thermometer, amount and
  nameplate stay Berkeley Blue (`#003262`). Four options were compared at phone size
  (`docs/design/daily-cal-colour-options.png`): light-blue lettering was too faint on cream, so the
  nameplate stays navy. Stanford needs no change (its avatar red is its cardinal).

## Official nameplates (`e7122ed`)
- Each column now shows the paper's own nameplate under its logo tile: **The Stanford Daily** uses
  the official SVG published on its site (`StanfordDailyLogo-01.svg`, blackletter); **The Daily
  Californian** is traced from a clean capture of its site's nameplate (dailycal.org blocks
  automated requests, so no file could be downloaded). Replaces the italic serif text names.
- `scripts/trace-wordmarks.py` -> `src/wordmarks.js`. Layout: tile above, nameplate beneath
  (the Cal nameplate is a very wide thin line, ~15:1, so a side-by-side lockup was too small).
  Image is now 600x900 (PNG 1200x1800).
- Docs: added this changelog, `docs/STATUS.md`, `docs/HISTORY.md`, `CLAUDE.md`.

## `5e1585e` Logos as vector tiles
- Each paper's white mark, vector-traced from its avatar (`scripts/trace-logos.py` ->
  `src/logos.js`), on a team-colour tile ringed in gold (Cal) / sandstone (Stanford).
  Nothing to load, sharp at any size.

## `be88462` Fix: text missing on first load (phones)
- **Bug:** on a phone's first visit the board's shapes drew but all text was invisible; a reload
  fixed it. An SVG inside an `<img>` is painted once and never repaints, and the text depended on
  an embedded web font that was still decoding.
- **Fix:** all text is now drawn as outlined glyph shapes (`src/text.js`, generated
  `src/glyphs.js` from `scripts/build-glyphs.py`): no `<text>`, no `@font-face`. Smaller too.
- Regression test (`test/render.test.mjs`) fails if font-dependent text returns.

## `860a24f` `www.inkbowl.giving` redirects to the bare domain
- Second custom domain on the Worker; `canonicalRedirect` (`src/host.js`) 301s `www.` to the
  apex, keeping path and query.

## `b83af31` Smoke test tolerates DNS lag on a new zone
- If public DNS is not visible yet, the deploy smoke test checks the Worker via Cloudflare's
  edge with `--resolve` (TLS still verified) and emits a warning instead of failing.

## `c168265` The bare domain is the whole site
- `https://inkbowl.giving` serves the rivalry **page** to browsers and the thermometer **image**
  to image requests (`<img>`, Givebutter story), chosen by `Sec-Fetch-Dest` / `Accept`;
  `Vary` set. `/thermometer.svg` remains as an explicit fallback.

## `1339f85` Moved to `inkbowl.giving`
- New zone `inkbowl.giving` in the same Cloudflare account. `wrangler.toml` route changed from
  `inkbowl.dcsearch.vip`; the old attachment was removed by the deploy (Byline Search's domains
  untouched).

## `83d1e53` Custom domain only; stronger smoke test
- workers.dev turned off (it sat under the unrelated `dailycal-keepsakes` account subdomain).
- Smoke test requests the CPU-heavy routes (`/thermometer.svg`, `/`, `/png`) and checks the
  server-PNG gate, to exercise the Workers Free CPU limit for real.

## `eb72b6a` GitHub Actions deploy, KV, custom domain
- `.github/workflows/deploy.yml`: test, find-or-create the KV namespace
  (`ink-bowl-thermometer-THERMO`), `wrangler deploy`, optionally set `ADMIN_TOKEN`, smoke test.
- KV binding `THERMO`. **KV write budget:** Workers Free allows 1,000 writes/day, so last-good
  values are persisted only on change (or every 6 h); read freshness is tracked per isolate.

## `e48d38f` Initial build
- Worker that reads each paper's total from its **public Givebutter campaign page** (no API key
  needed), with a per-side API path that switches on when `CAL_API_KEY` / `STANFORD_API_KEY` is set
  and fallbacks: pin -> API -> page -> last good -> $0.
- Mobile-first SVG thermometer: shared leader-keyed scale, "$X takes the lead" under the trailing
  side, Big Game countdown, combined total, official palettes.
- Routes: `/`, `/thermometer.svg`, `/png` (staff PNG download, rendered in the browser),
  `/thermometer.png` (server PNG, off by default, `SERVER_PNG`), `/api/totals.json`,
  `/admin/pin|unpin`, `/health`.
- Tests: unit tests against captured Givebutter pages, and a workerd integration run (incl. a
  browser PNG export).
