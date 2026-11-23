# Cabal redesign brief (v0.2, campaign-first)

Status: draft for Cade's ruling. Nothing in here is a build order until he
says so.

Thesis: Cabal is a campaign-first tool for indie devs to organize retweet and
repost rings around their own games. Anonymous, link-invited, no accounts,
no server.

## 1. Verdict on Stage 1

Stage 1 shipped November 22, 2026: ten tasks, 83 tests green, hosted on
GitHub Pages. Cade tried it the same night. His words: "This fucking sucks.
Sorry. I don't get how the user uses this. This doesn't feel like a social
media management tool."

He was right. Stage 1 is six disconnected tools stacked on one long page:
a composer, a directory, a Discord bridge, a Kickstarter planner, a Steam
link builder, a checklist. Each works. Nothing connects them. There is no
workflow, no central object, nothing to do. You open it and it is tools in
a pile.

The research was not the problem. It said: same campaign, different post.
Own words, quote-posts with genuine commentary, staggered timing, human
posting only. The build sliced that into tools instead of a flow. This
redesign fixes the flow. It keeps the research.

## 2. The point

Organize with other similar developers to retweet and repost each other.
Retweet rings. The concrete case is /agdg/: the board coordinates Twitter
marketing for its members' games.

The user is an indie dev with a game. The job is a push. My game has
something coming out. Get the ring to amplify it.

Anonity.AI is the near neighbor. It is a private social network built on
invite-only trees: no public feed, no followers, no algorithm, members-only
groups nobody outside can see. Cabal shares the shape. A ring is a tree,
you get in by invite, nothing is public. The difference is the job.
Anonity is a place to be together. Cabal is a push machine: a campaign with
a window, one post to amplify, everyone's quote-post, who's posted. If the
push mechanics ever fall out of Cabal, it is just Anonity with fewer
features. That line holds.

## 3. The shape

Four rules. Your game at the center. A campaign is a link. The link is
the invite. The page shows the whole ring. Anything that does not fit in
those four rules does not ship.

Anonymous for now. No accounts, no servers. Cade's words: "Keep it
anonymous for now, no accounts, just your game. This keeps it light."
Accounts and servers were acknowledged as eventually needed. They are
deferred, not rejected.

Home. First open asks one question: what's your game? Name and links, then
the app becomes that game's dashboard. After that, opening it shows the
game at the top, the live campaign under it (the post to amplify, the
window, who's posted), your turn (the quote-posts you still owe), your
rings underneath, and a clear way to start a campaign.

Campaign page. Opened from a link. It shows the game, the anchor post, and
the whole ring with who's posted already, plus a join button. Whole ring
was Cade's call, not a summary view.

Composer. It is fed by the campaign, not four blank boxes. You open a
quote-post draft with the original attached. The similarity gate lives
here: password-meter warnings ("This post is very similar!"), never a
block. Nothing ever stops you from posting.

Discovery. Two ways in: campaigns with similar games (tag match against
your game's tags) and popular campaigns (member count, carried on the
link). Both need a browsable list. The lightest home proposed is a public
static file in the repo. That is still an open question.

## 4. Filters and trust

Invite-only is simple, but a closed ring cannot grow, and the point is devs
finding each other and helping. The link resolves it. The link is the
invite. No directory, no approval queue. Anyone with the link joins. Drop
it in /agdg/ and the whole board can pile in. Keep it in a DM and it is a
closed circle. One mechanism, both modes, nothing to build.

Listing has two filters, both light. A campaign must attach a real game
page (Steam, itch). And it only shows in discovery once real devs have
joined it. The ring is the proof. A grifter's campaign sits invisible with
zero members. The PR idea (open a pull request to list your campaign) was
funny and a good filter, since only real devs would bother, but unusable
as a web application. These two filters keep the benefit without the PR.

Imitators self-filter. Say someone claims to be Call of Duty. The campaign
links the anchor post, and the post's author is visible to the whole ring.
You cannot contribute under accounts you do not control, so the push never
happens. Nobody real amplifies it, no members join, discovery never shows
it. No verification system is needed. Verifying ownership would need
platform auth, which is accounts and servers, which are deferred.

Whole-ring visibility is the trust mechanism. A bad actor is visible, not
hidden.

## 5. Misuse and disclaimers

A retweet ring and a brigade are the same mechanics with a different
target, and the tool cannot tell them apart. That has to be faced in the
design.

The design guards do most of it. No game, no campaign. What gets amplified
is always your own announcement, never a target. The own-words rule means
it cannot run a copy-paste pile-on. Human posting only, always.

Big legal disclaimers are required. Cade's words: "We need big legal
disclaimers that I'm not responsible for anything people use this for."
The disclaimer states the terms: the tool is for promoting your own games,
misuse is on the user, provided as-is. A disclaimer states the terms. It
is not a shield. Real legal review of the text is a separate step if he
wants it.

The hard don'ts carry over from Stage 1: no auto-posting, auto-like,
auto-follow, auto-comment, auto-DM, no vote exchange. No quotas, ledgers,
points, streaks, or rewards. No scraping, no browser automation, no
password logins. No credentials or tokens stored anywhere. No AI-generated
campaign copy presented as human. No SCT codes. Posting happens only when
a human taps Post in the platform's own composer.

## 6. What happens to Stage 1

Stage 1 stays on main as the shipped v0.1. The redesign adds a new task
queue (v0.2). The modules become parts of the
campaign flow instead of sections on a page.

Keep, re-homed: the intents composer (fed by the campaign), the similarity
gate (on quote-post drafts, warnings only), match and directory (ring
members, tag matching for discovery), the Discord bridge (announce the
campaign where the ring already talks), the checklist (pre-post, per
campaign).

Keep, demoted: the Kickstarter planner and the Steam UTM builder. They
serve a launch campaign. They are not the app, and they do not sit on the
front page.

Cut: the six-section long page. The standalone similarity section (already
folded into the composer by T11). Any tool with no job inside a campaign.

## 7. Rejected alternatives

PR to list a campaign. Great filter, unusable UX. Replaced by the game-page
and members filters in section 4.

Accounts and servers now. Acknowledged as eventually needed. Deferred to
keep it light and anonymous.

Public directory or feed. Rejected. No feed is the point. Discovery is by
link, plus similar and popular over a static list.

Embedding or AI gate (T04). Removed November 22. SimHash won the bench:
separation +0.218 against +0.176 for the best embedding, at about 3 ms per
comparison and 8 bytes per draft. Recorded here so it is not relitigated.

Block states on the gate. Replaced by warnings only, per Cade's ruling:
password-meter UX, never stops a post.

## 8. Open questions

Where does the browsable campaign list live? Proposed: a public static
file in the repo. Undecided.

Link encoding. Does the campaign data ride in the URL, or does the link
point at a shared file? URLs have length limits. A file needs a fetch.
Undecided.

What fields does "your game" setup need? Name, store links, tags, handle?
Undecided.

Does a campaign need a window or deadline, or is it open-ended?
Undecided.

Legal review of the disclaimer text? Separate step, his call.

## 9. Task queue shape

New queue (v0.2), campaign first. Proposed tasks, not ordered, for his
ruling. None of these is a build order until the brief is ruled on.

- Campaign object and link intent. Create a campaign for your game, get a
  link that opens the app straight into it.
- Home: your game dashboard. First-open setup, live campaign, your turn,
  your rings.
- Campaign page: whole ring, who's posted, join.
- Composer fed by the campaign: quote-post drafts with the original
  attached, gate warnings live.
- Discovery: similar by tags, popular by member count, over the static
  list.
- Filters: game-page attachment, members gate for discovery.
- Disclaimers and terms, visible in the app.
- Migration: Stage 1 modules into the flow, per section 6.

The first build slice should be the smallest thing that proves the loop:
make a campaign, share its link, open it, see the whole ring, join.
Everything after that earns its place through the campaign.
