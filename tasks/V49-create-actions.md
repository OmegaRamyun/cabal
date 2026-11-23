# V49 — Obvious creation on both views

Status: merged (main 1d7fcc3, v0.2.23; branch task/V49-create-actions commits 16bbe59 + 2550393)
Branch: `task/V49-create-actions`
Files owned: `src/home.mjs`, `src/discovery.mjs`, `src/user-formats.mjs` (new), `src/campaign-formats.mjs`, `tests/v49-create-actions.test.mjs`, `tasks/V49-create-actions.md`

## What changed
- **Rings view** (`home.mjs`): the button reads "Start a ring" and sits directly under the game header, in a `.start-ring` block with one line (`START_RING.help`): what a ring is and what happens next. The create form keeps its fields; labels are plain ("Ring name", "Link to your post", "What the post says", "Your handle on that post"), submit is "Start my ring". Setup screen gains one line pointing at the ring step.
- **Campaigns view** (`discovery.mjs`): "New campaign template" button (`.new-template`) under the lede plus one explainer line. Click calls `ctx.onNewTemplate()`, else sets `location.hash = "#/campaigns/new"` (`ctx.location` or `globalThis.location`). Format list, usage sort, ring sections untouched.
- **Store** (`user-formats.mjs`): `loadUserFormats` / `saveUserFormats` / `addUserFormat` (storage-injected, key `cabal.v2.formats`), `mergeFormats(seed, user)` (seed order first, user appended, dedupe by id only, seed wins a clash).
- **Create form** (`campaign-formats.mjs`): `mountCreate(rootEl, ctx)`, `buildFormatFromForm(values)`, `parseFormatTags`. Tagline, description, how-to required; how-to must mention disclosure (every template ships a disclosure line); tags optional. Validation is the existing `createFormat`/`validateFormat`.

## ctx contract for V50 integration
- Campaigns view: `mountDiscovery(root, { ..., formats: mergeFormats(seed, loadUserFormats()), onNewTemplate: () => (location.hash = "#/campaigns/new") })`.
- Route `#/campaigns/new`: `mountCreate(root, { onCreate: (f) => addUserFormat(f), onCreated: (f) => (location.hash = "#/format/" + f.id), onCancel: () => (location.hash = "#/campaigns") })`. The module never touches storage itself.
- `app.js` must pass merged formats to the `#/format/<id>` route too, or user formats will 404 as "not found".
- Styles needed (coordinator): `.start-ring`, `.new-template`, `.view-create`, `.field-hint`, `.field-error`, `.format-create-form`. Existing tokens only.

## Left out on purpose
`app.js`, `index.html`, `style.css`, `nostr.mjs`, `campaign.mjs`; version bump (coordinator); publishing user templates over Nostr; editing/deleting a user template; example uses in the form (examples stay empty).

## Manual check (DOM)
Cold profile. Rings: after game setup, "Start a ring" and its line are the first thing under the game name; tap it, finish the form with a post URL. Campaigns: "New campaign template" is visible without scrolling; tap, fill three fields (how-to with a disclosure line), save, land on the new format page.
