# V28 — Social feel: feed, avatars, relative time, composer-first

Cade's direction refinement, Nov 22 ~23:34: "It needs to feel like a
social media app. Y'know?" Target is social presentation, not generic
modern polish. Builds on V27 (Pico, tokens, motion — merged 612270a).

## What changes

- Campaign page reads like a feed: the anchor is a post card (avatar
  initials, author, relative time like "2h"), posted members show their
  quote-post attached to the original as a nested quote card.
- Composer is front and center: a compose box embedded at the top of
  the campaign page for pending members (compact mode of the same
  component), sticky while the ring scrolls. The standalone
  #/composer/<id> route still works.
- The ring is people: initial avatars (deterministic hue per handle),
  names, who's posted, relative times. Home cards and discover rows get
  the same author/game avatar.
- Mobile-first: feed column, thumb-reachable actions (44px minimums
  already), sticky composer, tighter padding under 640px.

## What it does NOT mean

No fake engagement mechanics. No like buttons, no follower counts, no
engagement numbers as a feature. The feel comes from presentation
(people, posts, timestamps, composer-first), not from adding mechanics.
All hard don'ts from the brief still stand.

## Data (additive, backwards compatible)

- `markPosted` stamps `postedAt` (ISO) on the member, optional 4th
  `now` param for tests. Unknown handle still returns an unchanged copy.
- Members may carry `quoteText` (their quote-post in their own words).
- Demo posted members get `postedAt` (hours before now) and `quoteText`
  (fictional, clearly demo).
- Anchor post time is `window.start || createdAt`, documented here:
  the anchor's own post time is not stored, so the window start is the
  proxy. Open-ended campaigns fall back to createdAt.

## Files

- `src/campaign.mjs` (`relativeTime`, `initials`, `avatarHue`,
  `markPosted` postedAt), `tests/v28-social.test.mjs`
- `src/demo.mjs` (postedAt + quoteText on posted demo members)
- `src/quote-composer.mjs` (`compact` option, "Post as" row, placeholder)
- `src/campaign-page.mjs` (feed rendering, embedded composer, quote cards)
- `src/home.mjs` (author row on campaign cards), `src/discovery.mjs`
  (game avatar on rows)
- `style.css` (avatar, post head, quote card, compose box, mobile)

## Deliberately not done

- No nav active-route state (same note as V27).
- No logo or wordmark.
- No real timestamps on anchor posts beyond the window-start proxy.
- No sticky composer on the standalone composer route (the whole view
  is the composer there).

## Acceptance

- `npm test` green (157 + new v28 tests).
- Playwright `~/workspace/cabal-bench/pw/check-social.mjs`: avatars,
  relative times, attached quote cards, embedded composer (join first,
  then it appears), zero console errors; screenshots
  `cabal-v02-social-*.png` in `~/workspace/cabal-bench/`.
- `check-polish.mjs` still green (regression).
