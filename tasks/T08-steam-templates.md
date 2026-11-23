# T08 — Steam UTM builder + campaign templates

Status: done (merged to main)

## Goal

Attribute what actually drove wishlists, and give every campaign a
disclosed, human-written shape.

## Files owned

- `src/steam.mjs`, `src/templates.mjs`, `tests/t08.test.mjs`

## Spec

- `buildUtm(appUrl, { source, medium, campaign, content, term })`:
  `utm_source` and/or `utm_campaign` required (at least one); the rest
  optional. Destination must be an app page or sale page only. Default
  naming: `utm_source=cabal&utm_medium=<platform>&utm_campaign=<game>-<date>&utm_content=<member>`.
- Show the 72-hour rule in the UI: conversions count only if the user
  acts within 72 hours of the click, only logged-in Steam users in the
  same browser count, demos/playtests never count. Reports are a floor,
  not the truth.
- `templates.mjs`: five campaign templates — pre-launch (follow-gathering,
  referral tag per partner), live (update swap, own-words quote-post),
  late pledge (pledge-manager link), Next Fest (demo + wishlist UTM),
  dev update (progress, no ask). Each template is structure + prompts,
  never fill-in-the-blank captions, and each ships a disclosure line
  ("fellow ring member — I backed/played this" where true; never a fake
  "independent fan" framing) plus a similarity-gate reminder.
- `mount()` renders the UTM builder (live URL preview) and the template
  picker with copy-to-clipboard.

## Acceptance test

`tests/t08.test.mjs` (node --test): UTM fixtures (required-param
enforcement, encoding, default naming), every template has a disclosure
line and a similarity reminder, no template contains copy-paste caption
text.

## Don'ts

- No Steam write API (none exists). No review/wishlist manipulation, no
  key-farming, no review-for-review.
