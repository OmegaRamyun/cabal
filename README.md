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

## Usage

Serve the folder and open `http://localhost:8000` in your browser — no account, no backend, and no API keys required.

1. **Voice Card:** Add 3–5 of your own best posts (links or text) as a human writing reference in the composer. These stay in `localStorage` only — never used as training data and never sent anywhere.
2. **Intent Composer & Disclosure Templates:** Pick a target platform (X, Bluesky, Threads, or Reddit), write in your own words with per-platform length checks, and include a disclosure line whenever a relationship exists.
3. **Local Similarity Gate:** Run the browser-local similarity check before posting (lexical matching is always on; embeddings are opt-in and never loaded on first visit). If a draft is flagged as a near-duplicate, rewrite it.
4. **Matchmaking Directory & Discord `#rings`:** Optionally browse or join the matchmaking directory (genre, Steam tags, audience bucket, launch window) and store per-guild Discord `#rings` webhook URLs in `localStorage`.
5. **Steam UTM / Kickstarter Planner:** Generate Steam UTM links, referral tags, and campaign projections (`R = F x C x P`).
6. **Pre-post Checklist:** Review all 6 checks — own words, similarity gate passed, disclosure line present, UTM/referral link where applicable, your audience's timing (not a synchronised burst), and one shared game today — then tap **Post** in the platform's own composer.

All user data (voice card entries, webhook URLs, drafts, and checklist state) stays in your browser's `localStorage` and can be cleared at any time through your browser's site data settings.

## Contribute

Pick an open task in `tasks/INDEX.md`. One task = one file set + one
acceptance test. See `AGENTS.md` for the rules — read it before writing
code. One branch per task (`task/T01-short-name`).

## Licence

MIT. See `LICENSE`.
