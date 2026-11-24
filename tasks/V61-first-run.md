# V61 (+V67) — First-run screen, demo opt-in, mobile one-thing-at-a-time

Status: done (pending merge). Branch: `task/V61-first-run` (base 376b579, v0.2.34).
Lane A. Files: `src/first-run.mjs` (new), `src/demo.mjs` (`optInDemo` added),
`tests/v61-first-run.test.mjs` (new), this file.

## What changed
- `first-run.mjs`: `shouldShowFirstRun({campaigns, demoFlag})` (true only with zero
  campaigns and demoFlag !== "on"), `shouldShowRinglessCta`, `extractInviteHash`,
  `mount(rootEl, ctx)` (one sentence, `Start a ring`, `I have an invite link`,
  small `See a demo ring` link), `mountStickyCta(rootEl, ctx)`.
- "I have an invite link" reveals an inline paste field. It accepts a full URL,
  `#c=...`, or `c=...`, and calls `ctx.onOpenInvite("#c=...")`. Today's accepted
  route is the `#c=` link intent in `parseHash` (view `link`), so the shell sets
  `location.hash`. Lane C's V64 can replace the field later.
- `demo.mjs`: new `optInDemo(store, now)`. It is the only demo loader. It also works after a
  "Clear demo data" (flag off), and refuses to overwrite real or corrupt data.
  `seedDemo` is kept (v25 tests) but must no longer be called on cold load.
  DEMO badge and `demo: true` are untouched.

## Shell wiring needed (coordinator: app.js / index.html / style.css)
app.js:
1. `start()`: **delete** `demo.seedDemo(globalThis.localStorage)`. This is the cold-load auto-seed.
2. In the `home` case (and only there, not `#/rings`): if
   `firstRun.shouldShowFirstRun({campaigns: store.campaigns, demoFlag: backend.demoFlag()})`,
   `firstRun.mount(view, {...})` instead of `home.mount`:
   - `onStartRing: () => { location.hash = '#/rings'; }` (game setup, then create)
   - `onOpenInvite: (h) => { location.hash = h; }`
   - `onSeeDemo: () => { demo.optInDemo(globalThis.localStorage); location.reload(); }`
     (or re-read the store and re-render; `renderDemoBanner` shows it after).
3. Sticky CTA: add `<div id="ringless-cta-slot"></div>` to index.html (outside `#view`).
   On every route render call `firstRun.mountStickyCta(slot, {campaigns: store.campaigns,
   demoFlag: backend.demoFlag(), onStartRing})`. Toggle
   `document.body.classList.toggle('has-ringless-cta', !!returnedElement)`.
   Hide it on `#/rings` itself (already creating).
4. `renderDemoBanner` stays as is (demo only exists after opt-in now).

style.css classes (mine do not touch it):
- `.first-run` centered column, max-width ~32rem, generous vertical padding.
- `.first-run-sentence` large readable text. `.first-run-actions` flex column on mobile.
- `.first-run-btn` big (min-height 3rem, full width on mobile); `.first-run-start` = primary orange.
- `.first-run-demo-link` text-link look (no border/background), small, below the buttons.
- `.first-run-invite-form` input + button row; `.first-run-error` form-error colour.
- `.ringless-cta` `position: fixed; bottom: calc(<tab-bar height> + env(safe-area-inset-bottom)); left/right 1rem; z-index above content, below modals`. Visible on mobile; on desktop harmless (can be `max-width` centred).
- `body.has-ringless-cta { padding-bottom: calc(<tab-bar height> + 4.5rem + env(safe-area-inset-bottom)); }`
  keeps content from clipping under the tab bar + sticky CTA. Also apply the plain
  tab-bar padding-bottom to `#view` generally (V67 clipping).

## Manual checks (DOM-only, not covered by node tests)
- Clear localStorage, load `/`: only the first-run screen. No DEMO banner, no demo
  rings, no orange CTA for the fictional game. Check at 375px: no stacked banners.
- Tap "See a demo ring": demo seeds, DEMO banner appears, dashboard shows demo rings.
  "Clear demo data" returns to first-run (not a dead end).
- "I have an invite link": field appears and is focused; junk shows the error;
  a pasted `#c=` link opens the ring page.
- "Start a ring" reaches game setup, then the create flow.
- Ringless on mobile: sticky "Start a ring" sits above the tab bar and clips nothing;
  after creating a ring it disappears.
- Returning user with rings goes straight to the dashboard; no first-run flash.

## Notes
- No `#fresh-shelf` or public listing added (V50 stays dead).
- `npm test`: 531 tests, 530 pass, 1 fail. The failure is `unassistedPostsFor` in
  `tests/v38-sustained-model.test.mjs`. It also fails on base 376b579 (verified by
  stashing my changes), so it is not caused by V61. It's an id-ordering assertion
  and looks timing-dependent.
