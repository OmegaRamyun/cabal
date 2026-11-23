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
