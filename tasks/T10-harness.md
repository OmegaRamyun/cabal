# T10 — Test harness + CI

Status: partial — package.json + tests/README.md merged to main (cd35c2b); .github/workflows/test.yml NOT landed: the gh token lacks the `workflow` scope. Land it after `gh auth refresh -s workflow`.

## Goal

One command proves the whole MVP is green, on every push.

## Files owned

- `package.json`, `tests/`, `.github/workflows/test.yml`

## Spec

- `package.json`: `{ "scripts": { "test": "node --test tests/" } }`,
  Node >= 20. No dependencies.
- `tests/` directory exists with a README noting each task owns its own
  `tests/txx.test.mjs` (this task owns the harness, not other tasks'
  tests).
- `.github/workflows/test.yml`: on push and pull_request, Node 24,
  `npm test`. That is the whole CI — no build, no deploy step in Stage 1.
- If a task's test file is missing when this task lands, list it in the
  report as a gap — do not write other tasks' tests for them.

## Acceptance test

`npm test` exits 0 with every present task test collected. CI file is
valid YAML (check with `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/test.yml'))"` or equivalent).

## Don'ts

- No test framework dependency, no coverage gate, no deploy.
