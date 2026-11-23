# V30 — Navbar: icon top bar, Tools & Terms gear menu

Cade, 2026-11-22 ~23:46: "Navbar. Clean up the top of the page so it's not
repeating things. Home (Home Logo), Discover (Some kind of SVG), Tools &
Terms (Gearbox Logo)."

## Scope

- Header becomes a sticky top bar: "Cabal" wordmark + three icon items
  (house Home, compass Discover, gear Tools & Terms).
- The big "Cabal Ring Kit" title and the explainer tagline leave the
  header. The pitch already lives in first-run setup ("What's your game?")
  and the footer. No more title + tagline + four text buttons saying the
  same thing.
- The gear is a button opening a menu with "Campaign tools" and "Terms".
  Closes on outside click, Escape, or after picking a link.
  `aria-expanded` tracked, `aria-label` "Tools and terms" on the button.
- `aria-current="page"` follows the route (campaign, composer and
  link-intent count as Home; terms counts as Tools).
- Narrow screens (<640px): icon-only nav, labels hidden (aria-labels keep
  the names).

## Files owned

`index.html`, `style.css`, `app.js`, `tests/v30-navbar.test.mjs`,
`tasks/V30-navbar.md`, `version.json` (patch bump on merge per AGENTS.md).

## Acceptance

- `npm test` green (`navItemForView` mapping covered in
  `tests/v30-navbar.test.mjs`).
- Manual check (DOM-only, per AGENTS.md): Playwright screenshots of
  home, campaign, discover at desktop + 390px widths; gear menu
  opens/closes; `aria-current` moves across routes; zero console errors.
  Script: `~/workspace/cabal-bench/pw/check-nav.mjs`.
