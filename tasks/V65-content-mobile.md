# V65 — Intro Replacement + V66 Journal Gating + V68 Small Bugs + V69 Template Gating

Status: done
Branch: `task/V65-content-mobile`
Base: `376b579` (v0.2.34)

## Summary
- **V65 (`src/intro.mjs`):**
  - Replaced intro-as-onboarding with one ≤60-word 3-step card (`ONBOARDING_CARD`, `mountOnboardingCard`, `mount(rootEl, "intro")`) with verbatim copy:
    - Lead: `"Small rings of indie devs boost each other's posts in their own words — no accounts, no auto-posting."`
    - Steps: `"1. Start or join a ring → 2. Drop your post link → 3. Boost in your own words"`
    - CTA: `"Start my ring"` (`#/rings`)
  - Removed Theory from the onboarding path (no multi-page intro nav or Theory link on the onboarding card). Kept Theory content intact and reachable as reference material (`getIntroPage("theory")`, `#/intro/theory`, and `#/tools/theory` via `THEORY_DOCS_ROUTE` / `introPageIdForRoute`).
  - Standardized copy on **Ring** (`How rings work`, removed `"Rings and Campaigns"` three-noun pileup) while preserving tag and game discoverability hooks.
  - Disclosure guidance is deferred to first-assist time (no assist-time disclosure UI built in this lane; coordinator note below).
- **V66 (`src/gamify.mjs`):**
  - Added `firstAssist` boolean to journal state, `markFirstAssist(journal)`, `record("assist", ...)`, and `shouldShowJournal(journal, ctx)`.
  - Gated `mount(rootEl, ctx)` so the Field Journal does not render (`rootEl.hidden = true`, empty DOM) on first-run / ringless screens or after read-only actions. It renders only after the user's first assist (real non-demo assist or `firstAssist: true`), or when explicitly opened with `{ forceShow: true }`.
  - Kept the private field journal module and craft-only milestones intact.
- **V68 (`src/nav.mjs`, `src/campaign-formats.mjs`):**
  - **(a)** Fixed `backTargetForRoute` in `src/nav.mjs` to look up the intro page's own title via `getIntroPage(parsed?.pageId || 'intro')` instead of defaulting every intro page to `"What Cabal is"`. Theory routes point back to `#/tools` (`Tools`); `campaigns-new` uses `"New post format"`.
  - **(b)** Replaced the `/disclos/i` regex gate in `src/campaign-formats.mjs` with a prefilled, editable `"Disclosure reminder"` field (`DEFAULT_DISCLOSURE_REMINDER = "Mention you're posting with your dev ring."`). Every post format still ships a disclosure line (`format.disclosure`, rendered on the format detail page), without regex rejection of valid guidance. Tags field and tag display remain intact.
- **V69 (`src/campaign-formats.mjs`):**
  - Renamed creation copy (`CREATE_TEMPLATE_COPY`) to `"New post format"` with subline `"A reusable idea any ring can try in their own words."`.
  - Added `canCreateFormat(rings, me)` (`MIN_DEVS_FOR_FORMAT = 2`, ignoring demo rings and removed members) and gated `mountCreate(rootEl, ctx)` when `ctx.rings` or `ctx.store` is provided so ringless and 1-dev users do not see the create form.

## Files changed
- `src/intro.mjs`
- `src/gamify.mjs`
- `src/nav.mjs`
- `src/campaign-formats.mjs`
- `tests/v65-content-mobile.test.mjs` (new)
- `tasks/V65-content-mobile.md` (new)

## Shell wiring needed (coordinator — `app.js` / `style.css` not touched in this lane)
1. **Theory route move to Tools/Docs (`app.js`):**
   - In `parseHash()`, support `#/tools/theory` -> `{ view: 'intro', pageId: 'theory' }` (already recognized by `intro.introPageIdForRoute('#/tools/theory')`).
   - In `renderTools()`, link to `#/tools/theory` (or `#/intro/theory`) under Docs/Reference instead of linking `#/intro` as "What Cabal is".
   - In `renderNotFound()` (`app.js:253`), update `"Campaign not found"` -> `"Ring not found"` to complete Ring copy standardization.
2. **First-assist disclosure guidance & Field Journal unlock (`app.js`):**
   - Record first assist via `gamify.record('assist', {})` when the user completes their first assist / Enscryption, AND/OR pass `campaigns: store.campaigns, me: store.me` into `gamify.mount(journalSlot, ...)` in `renderHomeExtras()`.
   - Optionally expose a "Field journal" link in `renderTools()` that mounts `gamify.mount(el, { ..., forceShow: true })` (or only once unlocked).
   - Surface disclosure guidance at the user's first assist (noted per V65 spec; not built in this lane).
3. **V69 create-format gating on Network/Campaigns & route (`app.js`):**
   - In `renderNewTemplate()`, pass `rings: store.campaigns, me: store.me` into `formats.mountCreate(view, ...)`.
   - In `renderCampaigns()`, gate `onNewTemplate` (and rename button label to `"New post format"` in `src/node-view.mjs` / `src/discovery.mjs`) on `formats.canCreateFormat(store.campaigns, store.me)`.
4. **Styling (`style.css`):**
   - Style `.intro-card`, `.intro-steps`, `.intro-actions`, `.format-disclosure`, and `.format-create-locked` if custom spacing/typography is desired.
5. **Superseded assertions in older test files (not edited in this lane to respect strict file ownership):**
   - `tests/v33-intro.test.mjs:12` asserts `getIntroPage("how").title === "How a campaign works"` (now `"How rings work"` per V65).
   - `tests/v40-sustained-journal.test.mjs:158-160` asserts old multi-section `"intro"` page copy (`"A ring that keeps going"`, `"founding post is the start"`) — replaced by the 60-word 3-step card per V65.
   - `tests/v45-split.test.mjs:93` asserts `heading === "Rings and Campaigns"` — explicitly removed per V65.
   - `tests/v49-create-actions.test.mjs:35-37,83,89` asserts the old `/disclos/i` regex rejection on `howTo`, old `"New campaign template"` heading, and old `"Give the template a short name."` message — replaced per V68(b) & V69.
   - `tests/v57-nav-forms.test.mjs:194` asserts `CREATE_TEMPLATE_COPY.lede` matches `/Network/` — replaced by verbatim V69 subline `"A reusable idea any ring can try in their own words."`.
   - Pre-existing date-rot failure on `origin/main` (`376b579`): `tests/v38-sustained-model.test.mjs:250` creates `p0` with `new Date()` (`2026-11-24T01:57Z`) vs hardcoded `p1` at `2026-11-24T00:00:00Z`.

## Manual-check notes (DOM-only behavior)
- Open `#/intro` on desktop and 360px mobile: verify one compact 3-step card with `"Start my ring"` CTA, no scrolling wall of text, and no link to Theory.
- Open `#/intro/theory`: verify the top back-bar shows `"Tools"` chevron + `"The theory"` title (never `"What Cabal is"`).
- On a fresh browser profile (cleared localStorage): verify the Field Journal (`"The Unsworn"`, `"Primer: 0 of 3 pages read"`, achievement cards) is completely hidden on Home.
- Open `#/campaigns/new` with a 2+ dev ring: verify heading `"New post format"`, subline `"A reusable idea any ring can try in their own words."`, prefilled editable `"Disclosure reminder"` (`"Mention you're posting with your dev ring."`), intact `"Tags (optional)"` field, and successful save without typing the word `"disclose"`.
- Open `#/campaigns/new` with 0 or 1 dev in a ring (after coordinator passes `rings: store.campaigns`): verify the form is hidden and the locked state links to `#/rings`.
