# vendor/

Third-party assets vendored into the repo so the GitHub Pages site stays
self-contained. No CDN hotlinks anywhere in the app. No build step.

## modern-normalize v3.0.1

- Files: `modern-normalize.css` (3.3 KB), `modern-normalize.LICENSE`
- Source: https://www.npmjs.com/package/modern-normalize (v3.0.1)
- Project: https://github.com/sindresorhus/modern-normalize
- License: MIT (`vendor/modern-normalize.LICENSE`)
- Purpose: Minimal browser CSS reset replacing Pico.css (dropped in V55)
  so Cabal owns its own app shell, elevation surfaces, form controls,
  and typography without fighting classless framework defaults.

## @fontsource/cinzel v5.3.0

- Files: `fonts/cinzel/cinzel-{latin,latin-ext}-{400,600}-normal.woff2`,
  `fonts/cinzel/LICENSE`
- Source: https://www.npmjs.com/package/@fontsource/cinzel (v5.3.0)
- License: SIL Open Font License 1.1 (`vendor/fonts/cinzel/LICENSE`)
- Weights chosen: **400** (wordmark, tracked display titles, intro &
  journal headings) and **600** (emphasized section/card titles). Only
  `.woff2` and `latin` + `latin-ext` subsets are vendored to keep the
  static repo lean (~45 KB total).

## @fontsource/inter v5.3.0

- Files: `fonts/inter/inter-{latin,latin-ext}-{400,500,600,700}-normal.woff2`,
  `fonts/inter/LICENSE`
- Source: https://www.npmjs.com/package/@fontsource/inter (v5.3.0)
- License: SIL Open Font License 1.1 (`vendor/fonts/inter/LICENSE`)
- Weights chosen: **400** (body copy, inputs, meta), **500** (nav items,
  chips, subtle labels), **600** (buttons, active states, author labels,
  status), and **700** (avatars, badges, strong emphasis). Only `.woff2`
  and `latin` + `latin-ext` subsets are vendored.

To upgrade any vendored asset: fetch the pinned npm package tarball,
replace the files and LICENSE above, and re-run `npm test` plus the
Playwright shell smoke check.
