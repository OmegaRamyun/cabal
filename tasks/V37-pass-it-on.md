# V37 — Pass it on: teach the second-order loop

Status: done, merged as v0.2.9
Branch: `task/V37-pass-it-on`
Files owned: `src/intro.mjs`, `src/campaign-page.mjs`, `style.css`,
`tests/v33-intro.test.mjs`, `tests/v22-home.test.mjs`, `tasks/V37-pass-it-on.md`

## The gap (Cade, Nov 23)
The app taught quote-posting the anchor and explained why quote-posts
beat plain reposts, and the campaign page linked each member's
quote-post — but nothing taught the second-order loop: open a ringmate's
quote-post, share/copy its link onward, engage with it so it travels
beyond the anchor. That is the `share_via_copy_link` mechanic from the
research (a reader copying a post's URL carries the heavy weight), and
it was untaught. Cade calls it the biggest boost.

## What shipped
- **How page, step 6 "Pass it on"** (lede now "Six steps"): open a
  ringmate's quote-post; if it speaks to you, share its link onward —
  drop it in your own **#Ring channel**, your Discord or community
  channel where your people actually are, or wherever else your
  community gathers, with a line of your own. "Only what you genuinely
  like; no one counts it, and no one owes it."
- **Theory section "Pass it on: the post travels further than the
  anchor"** (after "Why a quote-post and not a plain repost"): the
  mechanic in plain language — a reader copying a post's link and
  sharing it onward carries real weight because a human chose to pass
  it on, not a button. The anchor starts it, the ringmates' posts carry
  it. #Ring channel named again. "Only ever what you genuinely like.
  No one counts shares, and no one owes any."
- **Campaign page nudge** (`.ring-pass-on`, under the ring list, only
  when at least one member has posted with a quote-post link — pure
  `hasQuotablePost(campaign)` helper, node-tested): "A ringmate's
  quote-post travels further when a real reader passes it on. If one
  speaks to you, open it and share its link in your own #Ring channel
  or wherever your people gather. Only what you genuinely like — never
  an obligation, never a count."

## Decisions
- **No number cited for the mechanic.** The research's `share_via_copy_link`
  20.0 weight is a Phoenix weight — flagged shaky / not re-verified by
  both critique models, so it stays out of the product copy. The
  mechanic is taught ("a human chose to pass it on"), the weight is not.
- **Guardrails kept:** human act, own words, no obligation, no count.
  The nudge and the copy say so explicitly; nothing here counts shares,
  ranks sharers, or implies anyone owes a share. No auto anything.
- **#Ring is a named, concrete suggestion** (Cade's second steer), not a
  vague "share it somewhere" — in the How step first, and consistently
  in the theory section and the campaign nudge.

## Manual check note
Playwright smoke (V36+V37): `#/intro/how` shows step 6 with #Ring;
`#/intro/theory` shows the pass-it-on section; the ToonSouls campaign
page (Wren Halloway posted with a quote link) shows the nudge under the
ring list; a campaign with no posted quote links shows none.
