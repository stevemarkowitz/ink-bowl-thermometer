# Changelog

All notable changes. Newest first. Everything below shipped on 2026-11-12 unless noted; commit
hashes are on `main`. Live site: **https://inkbowl.giving**.

## Equal nameplate size (this change)
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
