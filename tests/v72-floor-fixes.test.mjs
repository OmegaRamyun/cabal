// V72 floor fixes acceptance tests (Hallmark + MWG audit, 2026-11-24):
// - H1: CTA contrast pairs reach 4.5:1 (ember-deep / ember-cta-hover on bone-bright)
// - H2: overflow-x: clip on html,body (was hidden, breaks sticky)
// - H3: tracked-caps labels lose text-transform: uppercase + letter-spacing
// - H4: no colour/font literal past the token block (gate 48)
// - FAIL 34: sheet widths use 100%, not 100vw (scrollbar overflow)
// - index.html: em-dash title -> colon, meta description added, middle dot removed
// - app.js:290: JSON.parse(JSON.stringify()) -> structuredClone()
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../app.js", import.meta.url), "utf8");

// --- helpers ---------------------------------------------------------------
function tokenBlock(text) {
  const m = text.match(/:root,\n\[data-theme="dark"\] \{(.*?)\n\}/s);
  assert.ok(m, "token block found");
  return m[1];
}
function tokens(text) {
  const out = new Map();
  for (const line of tokenBlock(text).split("\n")) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*(.*?);\s*$/);
    if (m) out.set(m[1], m[2].trim());
  }
  return out;
}
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg, bg) {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}
function ruleBody(text, selector) {
  const re = new RegExp(`[^{}]*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^{}]*\\{([^}]*)\\}`, "s");
  const m = text.match(re);
  assert.ok(m, `rule found: ${selector}`);
  return m[1];
}
function pastTokenBlock(text) {
  const lines = text.split("\n");
  let end = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(":root,")) {
      for (let j = i; j < lines.length; j++) {
        if (lines[j].trim() === "}") { end = j; break; }
      }
      break;
    }
  }
  return lines.slice(end + 1).join("\n");
}

const T = tokens(css);

describe("H1 CTA contrast", () => {
  test("resting pair ember-deep on bone-bright reaches 4.5:1", () => {
    const ratio = contrast(T.get("--cabal-bone-bright"), T.get("--cabal-ember-deep"));
    assert.ok(ratio >= 4.5, `resting ${ratio.toFixed(2)}:1`);
  });
  test("hover pair ember-cta-hover on bone-bright reaches 4.5:1", () => {
    const ratio = contrast(T.get("--cabal-bone-bright"), T.get("--cabal-ember-cta-hover"));
    assert.ok(ratio >= 4.5, `hover ${ratio.toFixed(2)}:1`);
  });
  test("primary buttons rest on ember-deep, hover on ember-cta-hover", () => {
    const rest = ruleBody(css, 'button[type="submit"]');
    assert.match(rest, /background: var\(--cabal-ember-deep\)/);
    const hover = ruleBody(css, 'button[type="submit"]:hover');
    assert.match(hover, /background: var\(--cabal-ember-cta-hover\)/);
  });
  test("no CTA background still uses bare ember", () => {
    assert.doesNotMatch(css, /background: var\(--cabal-ember\)/);
    assert.doesNotMatch(css, /background: #c8501e/);
    assert.doesNotMatch(css, /color: #fff;/);
    assert.doesNotMatch(css, /color: #f4ece1;/);
  });
});

describe("H2 overflow-x", () => {
  test("html,body uses clip, never hidden", () => {
    const body = ruleBody(css, "html, body");
    assert.match(body, /overflow-x: clip/);
    assert.doesNotMatch(css, /overflow-x: hidden/);
  });
});

describe("H3 tracked caps", () => {
  const labels = [
    ".cabal-demo-banner strong",
    ".demo-badge",
    ".quote-anchor-label",
    ".node-panel-subhead",
    ".node-panel-kind",
    ".section-eyebrow",
    ".activity-strip-label",
  ];
  for (const sel of labels) {
    test(`${sel} carries no uppercase transform or letter-spacing`, () => {
      const body = ruleBody(css, sel);
      assert.doesNotMatch(body, /text-transform:\s*uppercase/);
      assert.doesNotMatch(body, /letter-spacing:/);
    });
  }
});

describe("H4 token lift", () => {
  test("no colour or font literal past the token block", () => {
    const rest = pastTokenBlock(css);
    const codeLines = rest.split("\n").map((ln) => ln.split("/*")[0]);
    const hits = [];
    for (let i = 0; i < codeLines.length; i++) {
      const m = codeLines[i].match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g);
      if (m) hits.push(`${i + 1}: ${m.join(", ")}`);
    }
    assert.deepEqual(hits, [], `literals past token block: ${hits.join(" | ")}`);
  });
  test("no var() fallback literal past the token block", () => {
    const rest = pastTokenBlock(css);
    assert.doesNotMatch(rest, /var\(--[a-z0-9-]+,\s*#[0-9a-fA-F]/);
    assert.doesNotMatch(rest, /var\(--[a-z0-9-]+,\s*rgba?\(/);
  });
  test("V72 tokens are defined in :root", () => {
    const want = [
      "--cabal-ember-cta-hover", "--cabal-error", "--cabal-muted-light",
      "--cabal-bone-soft", "--cabal-bone-dim", "--cabal-bone-mid", "--cabal-mono",
      "--cabal-ember-faint", "--cabal-ember-mist", "--cabal-ember-line",
      "--cabal-gold-faint", "--cabal-gold-glow", "--cabal-hairline-wash",
      "--cabal-ground-veil", "--cabal-surface-elevated", "--cabal-surface-wash",
      "--cabal-white-faint", "--cabal-white-soft", "--cabal-scrim",
      "--cabal-posted-line", "--cabal-posted-wash",
      "--cabal-avatar-0", "--cabal-avatar-1", "--cabal-avatar-2",
      "--cabal-avatar-3", "--cabal-avatar-4", "--cabal-avatar-5",
      "--cabal-shadow-sm", "--cabal-shadow-lg", "--cabal-shadow-strong",
      "--cabal-shadow-sheet",
    ];
    for (const name of want) assert.ok(T.has(name), `${name} defined`);
  });
});

describe("FAIL 34 sheet widths", () => {
  test("adopt-picker-sheet and ringless-cta cap use 100%, not 100vw", () => {
    assert.match(ruleBody(css, ".adopt-picker-sheet"), /width: min\(30rem, calc\(100% - 2rem\)\)/);
    // .ringless-cta has two rules; the max-width cap lives in the desktop one.
    const idx = css.indexOf("max-width: calc(100% - 2rem)");
    assert.ok(idx > 0, "ringless-cta max-width present");
    assert.match(css.slice(Math.max(0, idx - 200), idx), /\.ringless-cta/);
    assert.doesNotMatch(css, /100vw/);
  });
});

describe("index.html copy + meta", () => {
  test("title has no em dash", () => {
    const m = html.match(/<title>(.*?)<\/title>/);
    assert.ok(m, "title present");
    assert.doesNotMatch(m[1], /—/);
  });
  test("meta description present", () => {
    assert.match(html, /<meta name="description" content="[^"]{20,}">/);
  });
  test("no middle dot in the shell", () => {
    assert.doesNotMatch(html, /·/);
  });
});

describe("app.js structuredClone", () => {
  test("campaign snapshot uses structuredClone", () => {
    assert.match(appJs, /structuredClone\(campaign\)/);
    assert.doesNotMatch(appJs, /JSON\.parse\(JSON\.stringify\(campaign\)\)/);
  });
});
