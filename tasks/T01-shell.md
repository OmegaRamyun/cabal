# T01 — App shell, layout, module registry

Status: done (merged to main)

## Goal

The static shell every other module mounts into. Single page, no
framework, no build step.

## Files owned

- `index.html`, `style.css`, `app.js`

## Spec

- `index.html`: sections with stable ids — `#composer`, `#similarity`,
  `#directory`, `#discord`, `#kickstarter`, `#steam`, `#checklist`. Loads
  `app.js` as a module. Each section has a heading, a short plain-English
  explainer (one or two sentences), and an empty mount node.
- `style.css`: plain, readable, dark-friendly. No framework, no webfonts.
  Mobile-usable: sections stack, tap targets >= 44px.
- `app.js`: module registry on `window.Cabal.modules`. `register(name,
  module)` / `get(name)`. Loads each `src/*.mjs` module and calls its
  `mount()` with its section node. A module that fails to load must not
  take down the rest — log and continue.
- No module code in `app.js` beyond the registry and loader.

## Acceptance test

`tests/t01.test.mjs` (node --test): registry register/get/duplicate
behaviour. Manual check: serve the folder, page loads, all seven sections
render, a deliberately broken module logs and the rest still mount.

## Don'ts

- No framework, no bundler, no CSS-in-JS. No other task's files.
