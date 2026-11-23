# Cabal Ring Kit

Open-source, zero-API mutual-aid promotion tool for indie game devs.

Cabal is a social media management app with a twist: developers help each
other out and form friendly "cabals" — small, opt-in rings that share each
other's games. Same campaign, different post: every member writes their own
words, quote-posts with genuine commentary, staggers timing, and discloses
the relationship. No quotas, no ledgers, no automation, no copypasta.

v0.2 is a **campaign-first static webapp**: no server, no OAuth, no API
keys, no build step, no accounts. Posting happens through the platforms'
own composers (Web Intents) and by hand where no intent exists. The
design contract is `REDESIGN-BRIEF.md`.

## What v0.2 does

- Your game at the center: first open asks one question, then the app is
  that game's dashboard — live campaign, your turn, your rings.
- Campaigns: one game, one post to amplify, a window, and the whole ring
  with who's posted. A campaign is a link; the link is the invite.
- Quote composer fed by the campaign: drafts with the original attached,
  and a browser-local similarity gate (SimHash + word 3-grams) that warns
  like a password meter — it never blocks a post.
- Discovery: campaigns with similar games (tag match) and popular
  campaigns (member count), over a public static list
  (`data/campaigns.json`). A campaign lists only with a real game page
  attached and at least one joiner — the ring is the proof.
- Demo mode: fictional example data on first load (clearly labeled DEMO),
  clearable any time from the banner.
- Campaign tools (demoted off the front page): Kickstarter planner,
  Steam UTM builder, Discord #rings bridge, pre-post checklist.
- Terms and disclaimer, in plain language, in the app.

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

Serve the folder and open `http://localhost:8000` in your browser — no account, no backend, and no API keys required. On first load you get fictional demo data (Starlight Salvage, three demo campaigns) so the loop is visible immediately. Clear it from the DEMO banner any time.

1. **Your game:** Tell Cabal your game (name, Steam/itch links, tags). That is your dashboard.
2. **Start a campaign:** One post to amplify, a window, and the ring. Share the campaign link — anyone with it opens the app straight into the campaign and can join.
3. **Your turn:** Open a campaign where you owe a quote-post. Write it in your own words with the original attached; the similarity gate warns if it reads too close to the original, and never stops you.
4. **Post it yourself:** Open the draft in X or Bluesky and tap Post in the platform's own composer. Then tap "I posted it" so the ring sees you posted.
5. **Discover:** Find campaigns with similar games or popular campaigns, and join rings that need your voice.

All user data (game, campaigns, drafts, checklist state) stays in your browser's `localStorage` and can be cleared at any time through your browser's site data settings.

## Contribute

Pick an open task in `tasks/INDEX.md`. One task = one file set + one
acceptance test. See `AGENTS.md` for the rules — read it before writing
code. One branch per task (`task/T01-short-name`).

## Licence

MIT. See `LICENSE`.
