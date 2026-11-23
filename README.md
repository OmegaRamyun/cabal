# Cabal Ring Kit

Open-source, zero-API mutual-aid promotion tool for indie game devs.

Cabal is a social media management app with a twist: developers help each
other out and form friendly "cabals" — small, opt-in rings that share each
other's games. Same campaign, different post: every member writes their own
words, quote-posts with genuine commentary, staggers timing, and discloses
the relationship. No quotas, no ledgers, no automation, no copypasta.

Stage 1 MVP is a **basic static webapp**: no server, no OAuth, no API keys,
no build step. Posting happens through the platforms' own composers (Web
Intents) and by hand where no intent exists.

## What Stage 1 does

- Intent composers for X, Bluesky, Threads, and Reddit, with per-platform
  length checks
- A browser-local similarity gate (lexical always on, embeddings opt-in)
  that refuses near-duplicates
- An opt-in matchmaking directory (genre / Steam-tag / audience-bucket /
  launch-window) with an explainable match score and rotation caps
- A Discord #rings bridge (per-guild webhooks, announcement following)
- A Kickstarter planner (R = F x C x P) and referral-tag builder
- A Steam UTM builder and campaign templates with disclosure lines
- A pre-post checklist

## Run it

No build. Serve the folder and open it:

```
python3 -m http.server 8000
```

Tests:

```
npm test
```

## Contribute

Pick an open task in `tasks/INDEX.md`. One task = one file set + one
acceptance test. See `AGENTS.md` for the rules — read it before writing
code. One branch per task (`task/T01-short-name`).

## Licence

MIT. See `LICENSE`.
