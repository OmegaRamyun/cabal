# V27 — UI polish: Pico.css, tokens, motion

Cade's order, Nov 22 ~23:26: "We need this to feel like a modern web
application. Pretty it up a bit with a third party CSS library and
animations. Try to not make it look 'sloppy'."

## Library

Pico.css v2.1.1, classless, vendored at `vendor/pico.min.css` (83,319
bytes, 11.7 KB gzipped, MIT). No CDN hotlink; the Pages site stays
self-contained. Chosen over Water.css (too thin to read as modern) and
Bulma/Tailwind (class-based: would force markup edits across all 14 src
modules, breaking file ownership, and Tailwind needs a build step).
Pico styles the semantic HTML the views already emit, so zero markup
changes were needed for the library itself. Auto dark mode follows
`prefers-color-scheme` with no `data-theme` attribute. Primary kept at
Pico's default azure; Cabal-specific tokens live in `style.css`.

## Motion identity (local-motion-principles)

One archetype: Corporate. Signature easing
`cubic-bezier(0.2, 0, 0, 1)` (MD3 standard). Durations: quick 120 ms
(press/hover), standard 250 ms (route transition, card enter), slow
400 ms (meter fill). Entrance: fade + 8 px rise, ease-out, micro-cascade
30 ms per ring row, total under 400 ms. Card hover: translateY(-2 px) +
shadow. Button press: scale(0.98). Meter fill animates 0 to value on
mount. `prefers-reduced-motion: reduce` kills every transition and
animation. Nothing loops, nothing travels more than 1/3 of the screen.

## Files

- `vendor/pico.min.css`, `vendor/README.md` (source, version, license)
- `style.css` (full rewrite on Pico tokens; keeps every existing class)
- `index.html` (Pico link before style.css; nothing else)
- `src/home.mjs`, `src/campaign-page.mjs` (posted-progress meter,
  `empty-state` classes — presentational only)
- `src/discovery.mjs` (`empty-state` classes — presentational only)

## What changed per route

- Every route: Pico base (type scale, spacing, form controls, focus
  rings), card surfaces with soft shadow, 54 rem content width, route
  entrance animation.
- Home: game header hierarchy, campaign cards with hover lift, meter
  under "Posted n/m", empty states as dashed muted panels.
- Campaign: anchor blockquote styled, share box grouped, ring rows with
  posted/pending chips, meter, join form on Pico inputs.
- Composer: anchor card, gate warning colors kept (pass/review/warn),
  intent links as Pico buttons, "I posted it" primary.
- Discover: rows as full-width buttons with hover lift, DEMO badge kept,
  empty states as panels.
- Tools: sections as cards, Discord announcement `<pre>` kept readable.
- Terms: long-form reading styles, no changes to the text.
- Demo banner: no longer a loud yellow slab. Soft amber tint, left
  accent border, amber badge, Pico buttons. Still unmissable, now
  intentional.

## Deliberately not done

- No nav active-route state (`aria-current`). The nav is static HTML;
  wiring it needs router changes in app.js. Small follow-up, not a
  polish blocker.
- No logo, wordmark, or illustration. The app has no brand art; a
  made-up logo would be decoration, not polish.
- No theme toggle. Pico follows the OS; a manual toggle is a feature,
  not polish.

## Acceptance

- `npm test` green (157 tests; no test file for this task — CSS-only,
  DOM behaviour verified by the Playwright check below, per the
  AGENTS.md carve-out).
- Playwright `~/workspace/cabal-bench/pw/check-polish.mjs`: every route
  (home, campaign, composer, discover, tools, terms, setup after clear
  demo) renders with zero console errors; screenshots
  `cabal-v02-polish-*.png` in `~/workspace/cabal-bench/`.
