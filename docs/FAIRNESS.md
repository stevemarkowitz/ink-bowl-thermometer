# Fairness audit

**Principle: neither paper may look bigger, bolder or favoured.** This is a joint fundraiser between two
rivals; donors on both sides must feel the board treats them equally. Everything drawn per paper is
checked here. Rules live in `src/render.js`; tests in `test/render.test.mjs` enforce them (the
`FAIRNESS:` tests). If you add anything per paper, add it to this table and test it.

| Element | Treatment | Rule / status |
| --- | --- | --- |
| **Nameplates** (The Daily Californian vs The Stanford Daily) | Same baseline; sized to **equal footprint** (bounding-box area) | Equal *width* made Stanford's blackletter look bigger (capitals ~1.5x taller); equal *cap height* made the Daily Cal's very wide line look bigger. Measures disagree because the shapes differ, so we chose the rule that treats width and height alike and checked it by eye. With it: Stanford vs Cal = cap 1.11x, width 0.76x, ink 1.28x, footprint 1.00x. Guarded to stay within cap 0.9-1.2x, ink 0.8-1.4x, width 0.65-1.5x. Options compared: `design/nameplate-size-rules.png`. |
| **Logo marks** (inside the tiles) | Tiles are identical (76 units); marks sized to **equal footprint** (same rule as the nameplates) | The DC mark is wide and flat, the "S" square and dense, and the DC mark is already as wide as its tile allows (67 of 76 units), so a rule can only change the S. Result: DC 67x32, S 47x46, footprint 1.00x (ink S/DC 0.90x, guarded 0.75-1.35x). "Fill the tile" was rejected (S gets 1.75x the footprint). Options compared: `design/logo-mark-size-rules.png`. |
| **Decorative accents** (tile ring, mercury cap, top-bar underline) | **Brand accents, structurally identical** (`ACCENTS = 'brand'`) | **Owner's decision, 2026-11-13:** keep California Gold and Stanford Sandstone. Ring width/opacity, cap size and underline are identical for both sides, but the colours are not equally vivid: gold is far more saturated than sandstone, so Cal's ring and cap draw a bit more attention. This was shown side by side (`design/accent-parity.png`) and accepted. `ACCENTS = 'neutral'` gives both one identical pale highlight if that changes. Tests assert the treatment is structurally identical. |
| **Amounts, goal lines, labels, ticks** | Same typeface, size, weight, spacing | By construction (one code path). |
| **Thermometers** | Identical geometry; **one shared scale keyed to the leader** | By construction; the taller tube is always the side that is ahead. |
| **Leader / trailer messaging** | Symmetric logic | The trailing side gets the "$X takes the lead" call to action in its team colour; the leader's line is quieter; a tie reads "Dead even" for both. Data-driven, not paper-driven. |
| **Headline band** | Takes the leader's colour | Data-driven. |
| **Donate buttons** (page) | Same size and style, one per paper | Only the label length differs (the names differ). |
| **Data** | Both read the same way (public campaign page; API per side when a key exists) | Neither side is favoured by the reader; each side's failure is independent and shown honestly (`LAST KNOWN`). |

## Differences we cannot, and should not, remove
- **Accent vividness** (accepted by the owner; see the accents row): gold is more vivid than sandstone.
- **Team colours.** Each paper keeps its own official primary: Berkeley Blue `#003262` and Stanford Cardinal
  `#8C1515`. Navy is darker than cardinal, so it carries slightly more visual weight on the cream card.
  That is each side's identity; recolouring either would be less fair, not more. (The Daily Cal's logo tile
  uses the paper's own lighter blue; see `HISTORY.md` decision 9.)
- **Logo and nameplate shapes.** Different artwork has different shapes; we equalise size and weight, not shape.

## Open question: left/right order
The Daily Cal is on the left and The Stanford Daily on the right (alphabetical by masthead; and the 2026 Big
Game is in Berkeley). Left-first can read as "first/primary". Options if either paper cares: agree an order,
alternate it by year, or add a config switch (`LEFT_SIDE`) — not built; ask the papers.

## How to check a change
1. `npm test` (the `FAIRNESS:` tests).
2. `npm run preview -- 1391 2805` and look at `docs/preview-phone.png` at phone width, side by side.
3. Try the swapped case (`npm run preview -- 3000 1000`) so the leader/trailer treatment is also symmetric.
