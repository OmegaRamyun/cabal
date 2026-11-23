# vendor/

Third-party assets vendored into the repo so the GitHub Pages site stays
self-contained. No CDN hotlinks anywhere in the app.

## Pico.css v2.1.1

- File: `pico.min.css` (83,319 bytes, 11.7 KB gzipped)
- Source: https://cdn.jsdelivr.net/npm/@picocss/pico@2.1.1/css/pico.min.css
- Project: https://picocss.com
- License: MIT (header comment in the file; copyright 2019-2025)
- Classless: styles semantic HTML, no markup changes needed, no JS
  dependency, no build step. Auto dark mode follows
  `prefers-color-scheme`.

To upgrade: download the new `pico.min.css` from the same jsDelivr path
with the version pinned, replace this file, update the version above,
and re-run the Playwright route screenshots — Pico minor versions have
moved spacing tokens before.

## d3-force v3.0.1 (+ d3-dispatch, d3-quadtree, d3-timer)

- Files: `d3-force/d3-force.mjs`, `d3-force/d3-quadtree.mjs`,
  `d3-force/d3-dispatch.mjs`, `d3-force/d3-timer.mjs`, `d3-force/LICENSE`
- Source: npm `d3-force@3.0.1` (`dist/*.mjs` prebuilt ESM modules)
- Project: https://d3js.org/d3-force/
- License: ISC (Copyright 2010–2026 Mike Bostock; full text in `d3-force/LICENSE`)
- Modification: the three bare ESM specifiers in `d3-force/d3-force.mjs`
  (`'d3-quadtree'`, `'d3-dispatch'`, `'d3-timer'`) are rewritten to relative
  imports (`'./d3-quadtree.mjs'`, `'./d3-dispatch.mjs'`, `'./d3-timer.mjs'`)
  so the module runs in browsers and Node with zero build step and zero
  import map.
