# T02 — Intent composers (X / Bluesky / Threads / Reddit)

Status: done (merged to main)

## Goal

Build native-composer URLs. The user taps a button; the platform's own
composer opens pre-filled; the user taps Post. No API, no OAuth, no fee.

## Files owned

- `src/intents.mjs`, `tests/t02.test.mjs`

## Spec

- `buildIntent(platform, { text, url })` returns a full URL string.
- X: `https://x.com/intent/post?text=…&url=…`. 280 chars for non-Premium;
  a URL counts 23 chars via t.co. `hashtags` param takes comma-separated
  tags, no `#`. Values via `encodeURIComponent` (spaces %20, `&` %26,
  line break %0A).
- Bluesky: `https://bsky.app/intent/compose?text=…` — single `text` param,
  URL appended inside the text. Limit 300 graphemes / 3,000 bytes —
  enforce client-side, show remaining count.
- Threads: `https://www.threads.net/intent/post?text=…`. **Domain unresolved
  (threads.net vs threads.com) — implement threads.net, leave a TODO and
  a visible "live-test before shipping" note. 500 chars.**
- Reddit: `https://www.reddit.com/submit?url=…&title=…`. The user picks
  the subreddit in the composer — there is no subreddit param; do not
  invent one.
- `mount()` renders one composer per platform with a textarea, live char
  count, and an "Open in <platform>" button (plain `<a target=_blank>`).
- Char-limit overflow blocks the button with a plain message, never a
  silent truncation.

## Acceptance test

`tests/t02.test.mjs` (node --test): exact URLs for fixtures (plain text,
text with `&` and newlines, text with a URL, over-limit text rejected).
Expected outputs are literal strings in the test.

## Don'ts

- No API calls, no OAuth, no auto-posting. No invented params.
