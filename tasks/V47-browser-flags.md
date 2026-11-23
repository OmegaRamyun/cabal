# V47 — Browser flags: sync panel on ToonSouls, relay defaults, BIP-340 vectors

Status: claimed
Branch: `task/V47-browser-flags`. Files: `src/nostr.mjs` (DEFAULT_RELAYS only),
`src/sync-target.mjs` (new), `tests/v47-browser-flags.test.mjs`,
`tests/v47-bip340-vectors.test.mjs`, this doc, defaults mentions in V41/V43b/V44 docs.

## (a) Sync panel missing on ToonSouls

**Mechanism (confirmed by code trace; DOM not driven in this lane).**
`findCampaign(id)` (app.js:177) returns a local campaign, else falls back to
`data/campaigns.json`. ToonSouls is `cmp_toon001`, static, `demo:true`, no key.
`renderCampaign` resolves it fine and the page renders, then calls
`renderSyncPanel(campaign.id)`, whose lookup is `store.campaigns.find(...)` —
local only — finds nothing, and `if (!campaign) return;` exits silently with
an emptied slot. Starlight demos are seeded into localStorage by `demo.mjs`,
so they pass. Not by design: no comment or doc says static campaigns are
meant to lack sync, and it is the flagship example. Treated as a bug.

**Second bug found on the way (data loss).** With `ctx.campaign` set,
`nostr.mount` calls `onMerged([thatCampaign])`, and app.js does
`store.saveCampaigns(list)` — which REPLACES the whole stored list with one
campaign. Any "Fetch updates" on a local campaign page drops every other
local campaign. The patch below fixes both.

**Patch for the coordinator (V48) — `app.js`:**

1. In `renderCampaign`, old:
```js
    if (opts.sync !== false) renderSyncPanel(campaign.id);
```
new:
```js
    if (opts.sync !== false) renderSyncPanel(campaign);
```
2. Add near the other imports: `import { mergeSyncedIntoStore } from './src/sync-target.mjs';`
3. Replace `renderSyncPanel` (app.js ~205–226):
old:
```js
function renderSyncPanel(campaignId) {
  const slot = document.querySelector('#campaign-extras');
  if (!slot) return;
  slot.textContent = '';
  const campaign = store.campaigns.find((c) => c.id === campaignId);
  if (!campaign) return;
  const view = document.querySelector('#view');
  nostr.mount(slot, {
    campaign,
    getCampaigns: () => store.campaigns,
    me: store.me,
    onMerged: (list) => {
      store.saveCampaigns(list);
      if (view) renderCampaign(view, campaignId, { sync: false });
    },
  });
}
```
new:
```js
function renderSyncPanel(campaign) {
  const slot = document.querySelector('#campaign-extras');
  if (!slot) return;
  slot.textContent = '';
  if (!campaign) return;
  const campaignId = campaign.id;
  const original = JSON.parse(JSON.stringify(campaign));
  const view = document.querySelector('#view');
  nostr.mount(slot, {
    campaign,
    getCampaigns: () => store.campaigns,
    me: store.me,
    onMerged: (list) => {
      store.saveCampaigns(mergeSyncedIntoStore(store.campaigns, list, original));
      if (view) renderCampaign(view, campaignId, { sync: false });
    },
  });
}
```
Static campaigns stay read-only (no key → Publish disabled) and are only
written to localStorage if a sync actually changed them.
Verify after applying: open `#/campaign/cmp_toon001` → Sync/Relays/Fetch text
present; with two local campaigns, Fetch updates on one leaves both stored.
Tests: `tests/v47-browser-flags.test.mjs` (mechanism + `mergeSyncedIntoStore`).
Caveat: the DOM wiring itself is a manual check (no DOM in the test runner).

## (b) Relay defaults

Decision: **dropped `wss://relay.nostr.band`**; defaults are now
`wss://relay.damus.io`, `wss://nos.lol`. `KNOWN_DEAD_RELAYS` records the
dropped one; tests pin defaults ∩ dead = ∅ and `useDefaultRelays`.
Evidence: coordinator's live-browser check Nov 23 ~11:20 — nostr.band timed
out twice, damus + nos.lol reachable. **My own check proves nothing:** this
build sandbox cannot open outbound websockets (all three relays, plus a raw
HTTPS upgrade via curl, timed out at 10s). I do not claim any relay is
reachable from here; nostr.band should be re-checked in a real browser before
anyone re-adds it. The panel copy and intro copy do not name relay URLs; the
button just uses `DEFAULT_RELAYS`. Older task docs (V41/V43b/V44) annotated.
No health check was added (no phone-home).

## (c) BIP-340 vectors

Full official list (bitcoin/bips `bip-0340/test-vectors.csv`, vectors 0–18,
fetched Nov 23 2026) embedded in `tests/v47-bip340-vectors.test.mjs`: verify
assertion for every vector, plus exact-signature + pubkey derivation for every
vector that has a secret key (0–3, 15–18). **Result: 19/19 vectors pass, no
failures; `src/nostr-schnorr.mjs` needed no change.**
