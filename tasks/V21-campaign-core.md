# V21 — Campaign object + link intent + store

Scope: the campaign data model, URL link intent, and localStorage store.
Files owned: `src/campaign.mjs`, `src/store.mjs`, `tests/v21-campaign.test.mjs`
Status: claimed
Branch: `task/V21-campaign-core`

## Frozen contract (do not change shape without coordinator approval)

Campaign object:
```js
{
  id: 'cmp_' + 8 random base36 chars,
  game: { name, links: { steam?: url, itch?: url, x?: url }, tags: string[] },
  title: string,
  anchorPost: { platform: 'x'|'bluesky'|'threads', url, text, author },
  window: { start: ISO date, end: ISO date } | null,
  members: [{ name, handle, platform?, status: 'posted'|'pending', quoteUrl?: string }],
  createdAt: ISO string,
  demo?: boolean
}
```

Functions in `src/campaign.mjs` (pure):
- `createCampaign({ game, title, anchorPost, window })` — validates, assigns id + createdAt, creator is members[0] with status 'pending'.
- `validateCampaign(c)` — returns array of error strings (empty = valid). Requires: game.name non-empty, at least one of game.links.steam / game.links.itch, anchorPost.url + text + author, members.length >= 1.
- `addMember(campaign, { name, handle })` — returns new campaign (no mutation); no-op if handle already a member.
- `markPosted(campaign, handle, quoteUrl)` — returns new campaign; member status -> 'posted'.
- `postedCount(campaign)`, `pendingMembers(campaign)`, `isLive(campaign, now?)` (window contains now, or no window), `isUpcoming(campaign, now?)`.
- `encodeCampaignLink(campaign, baseUrl)` — `#c=` + base64url(JSON). If encoded payload > 2000 chars, still return it but include `long: true` in the return object `{ url, long }`.
- `decodeCampaignLink(hash)` — parses `#c=...`, returns `{ campaign }` or `{ error }`. Invalid JSON / failed validation -> error, never throw.

`src/store.mjs` — localStorage wrapper, all keys under `cabal.v2.*`:
- Keys: `cabal.v2.game`, `cabal.v2.campaigns`, `cabal.v2.demo` ('on'|'off'), `cabal.v2.me` (my {name, handle}).
- `loadGame() / saveGame(game)`, `loadCampaigns() / saveCampaigns(list)`, `loadMe() / saveMe(me)`, `demoFlag() / setDemoFlag(v)`, `clearAll()` — all try/catch, return sane defaults when storage is missing (private mode) or corrupt.
- A `createMemoryStore()` in-memory fallback used by tests (no localStorage in node).

## Acceptance
- `tests/v21-campaign.test.mjs` covers: create/validate (valid + each missing field), addMember dedupe, markPosted, encode/decode round-trip, decode of garbage returns error, store round-trip via memory store.
- `npm test` green on the branch (existing tests must still pass).
- Do NOT touch index.html, app.js, style.css, tasks/INDEX.md, or any other track's files. Do NOT merge. Push the branch and report: branch, files, test count, exact exported API.
