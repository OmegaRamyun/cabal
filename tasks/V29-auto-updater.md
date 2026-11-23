# V29 — Auto-updater (version.json polling + banner)

Status: done (merged to main, see commit note below).
Branch: `task/V29-auto-updater`

## Why

Cade's open tab was still showing the pre-polish version after the v0.2
and polish deploys: "we need the auto updater because mine's stale".
GitHub Pages serves fresh files, but a loaded tab never re-fetches them.

## What

- `version.json` at the repo root: `{ "version", "updatedAt" }`.
  Bumped to `0.2.1` by this task. Convention (also in AGENTS.md):
  bump the patch number on EVERY merge to main, set `updatedAt` to the
  merge time (UTC). A stale version.json means users never see the banner.
- `src/updater.mjs`: pure compare + banner mount + poller.
  - Baseline = first successful fetch of `version.json` (`cache:
    'no-store'`). A later fetch that differs shows the banner.
  - Poll every 60s, plus a re-check on `visibilitychange` (when the tab
    becomes visible) and window `focus`.
  - Banner: "A new version is available (x.y.z)." + Refresh button, in
    Pico styling. Never force-reloads; the banner just waits.
  - Refresh with an unsent composer draft asks once ("Discard draft &
    refresh"); the second tap reloads. No draft: one tap reloads.
  - After a refresh the new version is the baseline, so the banner stays
    down — no reload loops. Fetch failure (offline / bad file) stays
    quiet and retries next poll.
- Wiring: `app.js` mounts the updater on `#update-banner` at startup;
  `index.html` has the mount point; `style.css` has the banner styles
  (primary accent, not amber — a new version, not a warning).

## Files owned

`version.json`, `src/updater.mjs`, `tests/v29-updater.test.mjs`,
`tasks/V29-auto-updater.md`, `index.html`, `style.css`, `app.js`
(shell files touched as coordinator), `tasks/INDEX.md`, `AGENTS.md`
(versioning convention only).

## Acceptance

- `npm test` green (169 tests: 163 + 6 new).
- Playwright `check-updater.mjs`: served copy, load -> no banner ->
  bump version.json -> focus -> banner appears -> Refresh -> reloads
  to the new version, banner gone, no reload loop, zero console errors.
  Draft path: typed draft -> first Refresh asks, second reloads.
- No service worker, no build step, no new runtime dependencies.

## Deliberately not done

- No service worker / offline caching — out of scope, adds failure modes.
- No changelog in the banner — the version string is the whole signal.
- No auto-reload, even with no draft — the user always taps Refresh.
