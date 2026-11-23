# T06 — Discord #rings bridge

Status: open

## Goal

Push ring briefs into a dev's own Discord without a central bot, a
central token, or any DM.

## Files owned

- `src/discord.mjs`, `tests/t06.test.mjs`

## Spec

- `buildPayload({ content, embeds })`: Discord incoming-webhook JSON.
  Limits (use the safe ceilings): content <= 2,000 chars, embeds <= 10
  per message, embed description <= 2,048 chars (API docs say 4,096,
  Discord's safety page says 2,048 — use 2,048), total embed text
  <= 6,000 chars per message, fields <= 25 per embed. Over-limit input
  is truncated with a visible note, never silently dropped.
- `sendWebhook(url, payload)`: `POST` to the user-pasted webhook URL
  with `fetch`. Honour 429 `retry_after` (wait once, then stop and report
  — never retry-loop). 403 means stop immediately and report.
- The webhook URL is pasted by the user, stored in localStorage only,
  never committed, never sent anywhere except Discord. Show a plain
  warning that a webhook URL is a write credential — treat it like a
  secret, rotate by recreating it.
- `mount()` renders: webhook URL field, a ring-brief composer (pre-built
  UTM links + "Draft in Cabal" deep link), a send button, and a short
  guide to announcement-channel following (10 publishes/hour, one channel
  follows at most 10 announcement channels, @everyone/@here stripped in
  followed copies).
- No central bot, no Gateway, no Message Content intent, no DMs, no
  rewards, no quotas.

## Acceptance test

`tests/t06.test.mjs` (node --test): payload-builder fixtures
(truncation at each limit, embed counts, total-text cap). Sending itself
is a manual check with a test webhook.

## Don'ts

- No central bot token, no 100-server verification cliff, no DM
  solicitation, no join-for-join, no quota/ledger/reward.
